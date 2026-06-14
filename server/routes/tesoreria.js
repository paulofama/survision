// ============================================
// RUTAS DE TESORERÍA - CAJA Y BANCOS
// Sistema de Costos - Instituto Dr. Mercado
// v1.0.0
// ============================================
// RUTA DESTINO: server/routes/tesoreria.js
// ============================================

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const dbConfig = require('../config/database');

// ============================================
// POOL DE CONEXIONES
// ============================================

let pool = null;

const getPool = async () => {
  if (!pool) {
    pool = await sql.connect(dbConfig);
  }
  return pool;
};

// ============================================
// HELPER: FORMATEAR FECHA PARA SQL SERVER
// ============================================

const formatDateForSQL = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return d.toISOString().split('T')[0].replace(/-/g, '');
};

// ============================================
// GET /api/tesoreria/caja/saldo
// Obtiene el saldo actual de caja
// ============================================

router.get('/caja/saldo', async (req, res) => {
  try {
    const pool = await getPool();
    
    const result = await pool.request().query(`
      SELECT 
        SUM(CASE WHEN mve.Mve_Signo > 0 THEN mve.Mve_Total ELSE 0 END) AS total_ingresos,
        SUM(CASE WHEN mve.Mve_Signo < 0 THEN ABS(mve.Mve_Total) ELSE 0 END) AS total_egresos,
        SUM(CASE WHEN mve.Mve_Signo > 0 THEN mve.Mve_Total ELSE -ABS(mve.Mve_Total) END) AS saldo_actual,
        COUNT(*) AS total_movimientos
      FROM MovValoresEnca mve
      WHERE (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado = 0)
    `);
    
    const saldo = result.recordset[0];
    
    res.json({
      success: true,
      data: {
        saldo_actual: saldo.saldo_actual || 0,
        total_ingresos: saldo.total_ingresos || 0,
        total_egresos: saldo.total_egresos || 0,
        total_movimientos: saldo.total_movimientos || 0
      },
      generadoEn: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo saldo de caja:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// GET /api/tesoreria/caja/saldo-historico
// Obtiene el saldo a una fecha específica
// ============================================

router.get('/caja/saldo-historico', async (req, res) => {
  try {
    const { fecha } = req.query;
    
    if (!fecha) {
      return res.status(400).json({
        success: false,
        error: 'Parámetro fecha es requerido (YYYY-MM-DD)'
      });
    }
    
    const pool = await getPool();
    const fechaSQL = formatDateForSQL(fecha);
    
    const result = await pool.request()
      .input('fecha', sql.VarChar, fechaSQL)
      .query(`
        SELECT 
          SUM(CASE WHEN mve.Mve_Signo > 0 THEN mve.Mve_Total ELSE 0 END) AS total_ingresos,
          SUM(CASE WHEN mve.Mve_Signo < 0 THEN ABS(mve.Mve_Total) ELSE 0 END) AS total_egresos,
          SUM(CASE WHEN mve.Mve_Signo > 0 THEN mve.Mve_Total ELSE -ABS(mve.Mve_Total) END) AS saldo,
          COUNT(*) AS total_movimientos
        FROM MovValoresEnca mve
        WHERE mve.Mve_Fecha <= @fecha
          AND (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado = 0)
      `);
    
    const saldo = result.recordset[0];
    
    res.json({
      success: true,
      data: {
        fecha: fecha,
        saldo: saldo.saldo || 0,
        total_ingresos: saldo.total_ingresos || 0,
        total_egresos: saldo.total_egresos || 0,
        total_movimientos: saldo.total_movimientos || 0
      },
      generadoEn: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo saldo histórico:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// GET /api/tesoreria/caja/movimientos
// Obtiene movimientos de caja con filtros
// ============================================

router.get('/caja/movimientos', async (req, res) => {
  try {
    const { 
      fechaDesde, 
      fechaHasta, 
      tipoComprobante,
      busqueda,
      limite = 500 
    } = req.query;
    
    const pool = await getPool();
    
    // Construir query dinámico
    let whereConditions = ['(mve.Mve_Anulado IS NULL OR mve.Mve_Anulado = 0)'];
    const request = pool.request();
    
    if (fechaDesde) {
      whereConditions.push('mve.Mve_Fecha >= @fechaDesde');
      request.input('fechaDesde', sql.VarChar, formatDateForSQL(fechaDesde));
    }
    
    if (fechaHasta) {
      whereConditions.push('mve.Mve_Fecha <= @fechaHasta');
      request.input('fechaHasta', sql.VarChar, formatDateForSQL(fechaHasta));
    }
    
    if (tipoComprobante) {
      whereConditions.push('tc.TComp_sigla = @tipoComprobante');
      request.input('tipoComprobante', sql.VarChar, tipoComprobante);
    }
    
    if (busqueda) {
      whereConditions.push('(mve.Mve_Nombre LIKE @busqueda OR CAST(mve.Mve_NroDoc AS VARCHAR) LIKE @busqueda)');
      request.input('busqueda', sql.VarChar, `%${busqueda}%`);
    }
    
    request.input('limite', sql.Int, parseInt(limite));
    
    const whereClause = whereConditions.join(' AND ');
    
    const result = await request.query(`
      SELECT TOP (@limite)
        mve.Mve_id AS id,
        CAST(mve.Mve_Fecha AS DATE) AS fecha,
        tc.TComp_sigla AS tipo_comprobante,
        tc.TComp_Nombre AS tipo_nombre,
        mve.Mve_Letra AS letra,
        mve.Mve_Suc AS sucursal,
        mve.Mve_NroDoc AS numero,
        RTRIM(mve.Mve_Nombre) AS nombre,
        COALESCE(RTRIM(mve.Mve_Obs), cc.ConcCaja_TextoComp, '') AS observaciones,
        mve.Mve_Total AS importe,
        mve.Mve_Signo AS signo,
        CASE WHEN mve.Mve_Signo > 0 THEN mve.Mve_Total ELSE 0 END AS ingreso,
        CASE WHEN mve.Mve_Signo < 0 THEN ABS(mve.Mve_Total) ELSE 0 END AS egreso,
        mve.Usu_Alta AS usuario,
        mve.Fec_Alta AS fecha_alta
      FROM MovValoresEnca mve
      LEFT JOIN TipoComp tc ON mve.TComp_id = tc.TComp_id
      LEFT JOIN ConceptosCaja cc ON mve.ConcCaja_Id = cc.ConcCaja_id
      WHERE ${whereClause}
      ORDER BY mve.Mve_Fecha DESC, mve.Mve_id DESC
    `);
    
    // Calcular totales del período filtrado
    const totalesResult = await request.query(`
      SELECT 
        COUNT(*) AS total_registros,
        SUM(CASE WHEN mve.Mve_Signo > 0 THEN mve.Mve_Total ELSE 0 END) AS total_ingresos,
        SUM(CASE WHEN mve.Mve_Signo < 0 THEN ABS(mve.Mve_Total) ELSE 0 END) AS total_egresos
      FROM MovValoresEnca mve
      LEFT JOIN TipoComp tc ON mve.TComp_id = tc.TComp_id
      WHERE ${whereClause}
    `);
    
    const totales = totalesResult.recordset[0];
    
    res.json({
      success: true,
      data: result.recordset,
      totales: {
        registros: totales.total_registros || 0,
        ingresos: totales.total_ingresos || 0,
        egresos: totales.total_egresos || 0,
        diferencia: (totales.total_ingresos || 0) - (totales.total_egresos || 0)
      },
      filtros: {
        fechaDesde,
        fechaHasta,
        tipoComprobante,
        busqueda,
        limite
      },
      generadoEn: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo movimientos:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// GET /api/tesoreria/caja/tipos-comprobante
// Obtiene tipos de comprobante disponibles
// ============================================

router.get('/caja/tipos-comprobante', async (req, res) => {
  try {
    const pool = await getPool();
    
    const result = await pool.request().query(`
      SELECT DISTINCT
        tc.TComp_id AS id,
        tc.TComp_sigla AS sigla,
        tc.TComp_Nombre AS nombre,
        tc.TComp_Signo AS signo,
        COUNT(mve.Mve_id) AS cantidad
      FROM MovValoresEnca mve
      INNER JOIN TipoComp tc ON mve.TComp_id = tc.TComp_id
      WHERE (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado = 0)
      GROUP BY tc.TComp_id, tc.TComp_sigla, tc.TComp_Nombre, tc.TComp_Signo
      ORDER BY cantidad DESC
    `);
    
    res.json({
      success: true,
      data: result.recordset
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo tipos de comprobante:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// GET /api/tesoreria/caja/resumen-diario
// Resumen de movimientos por día (últimos N días)
// ============================================

router.get('/caja/resumen-diario', async (req, res) => {
  try {
    const { dias = 7 } = req.query;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('dias', sql.Int, parseInt(dias))
      .query(`
        SELECT 
          CAST(mve.Mve_Fecha AS DATE) AS fecha,
          COUNT(*) AS movimientos,
          SUM(CASE WHEN mve.Mve_Signo > 0 THEN mve.Mve_Total ELSE 0 END) AS ingresos,
          SUM(CASE WHEN mve.Mve_Signo < 0 THEN ABS(mve.Mve_Total) ELSE 0 END) AS egresos,
          SUM(CASE WHEN mve.Mve_Signo > 0 THEN mve.Mve_Total ELSE -ABS(mve.Mve_Total) END) AS neto
        FROM MovValoresEnca mve
        WHERE mve.Mve_Fecha >= DATEADD(DAY, -@dias, GETDATE())
          AND (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado = 0)
        GROUP BY CAST(mve.Mve_Fecha AS DATE)
        ORDER BY fecha DESC
      `);
    
    res.json({
      success: true,
      data: result.recordset,
      dias: parseInt(dias),
      generadoEn: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo resumen diario:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// GET /api/tesoreria/caja/dashboard
// Dashboard completo de caja
// ============================================

router.get('/caja/dashboard', async (req, res) => {
  try {
    const pool = await getPool();
    
    // Obtener fecha actual
    const hoy = new Date().toISOString().split('T')[0].replace(/-/g, '');
    
    // Query múltiple
    const result = await pool.request()
      .input('hoy', sql.VarChar, hoy)
      .query(`
        -- Saldo general
        SELECT 
          SUM(CASE WHEN mve.Mve_Signo > 0 THEN mve.Mve_Total ELSE -ABS(mve.Mve_Total) END) AS saldo_actual
        FROM MovValoresEnca mve
        WHERE (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado = 0);
        
        -- Movimientos de hoy
        SELECT 
          COUNT(*) AS movimientos_hoy,
          ISNULL(SUM(CASE WHEN mve.Mve_Signo > 0 THEN mve.Mve_Total ELSE 0 END), 0) AS ingresos_hoy,
          ISNULL(SUM(CASE WHEN mve.Mve_Signo < 0 THEN ABS(mve.Mve_Total) ELSE 0 END), 0) AS egresos_hoy
        FROM MovValoresEnca mve
        WHERE CAST(mve.Mve_Fecha AS DATE) = CAST(GETDATE() AS DATE)
          AND (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado = 0);
        
        -- Movimientos del mes actual
        SELECT 
          COUNT(*) AS movimientos_mes,
          ISNULL(SUM(CASE WHEN mve.Mve_Signo > 0 THEN mve.Mve_Total ELSE 0 END), 0) AS ingresos_mes,
          ISNULL(SUM(CASE WHEN mve.Mve_Signo < 0 THEN ABS(mve.Mve_Total) ELSE 0 END), 0) AS egresos_mes
        FROM MovValoresEnca mve
        WHERE YEAR(mve.Mve_Fecha) = YEAR(GETDATE())
          AND MONTH(mve.Mve_Fecha) = MONTH(GETDATE())
          AND (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado = 0);
        
        -- Últimos 5 movimientos
        SELECT TOP 5
          mve.Mve_id AS id,
          CAST(mve.Mve_Fecha AS DATE) AS fecha,
          tc.TComp_sigla AS tipo,
          RTRIM(mve.Mve_Nombre) AS nombre,
          CASE WHEN mve.Mve_Signo > 0 THEN mve.Mve_Total ELSE 0 END AS ingreso,
          CASE WHEN mve.Mve_Signo < 0 THEN ABS(mve.Mve_Total) ELSE 0 END AS egreso
        FROM MovValoresEnca mve
        LEFT JOIN TipoComp tc ON mve.TComp_id = tc.TComp_id
        WHERE (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado = 0)
        ORDER BY mve.Mve_Fecha DESC, mve.Mve_id DESC;
        
        -- Resumen últimos 7 días
        SELECT 
          CAST(mve.Mve_Fecha AS DATE) AS fecha,
          SUM(CASE WHEN mve.Mve_Signo > 0 THEN mve.Mve_Total ELSE 0 END) AS ingresos,
          SUM(CASE WHEN mve.Mve_Signo < 0 THEN ABS(mve.Mve_Total) ELSE 0 END) AS egresos
        FROM MovValoresEnca mve
        WHERE mve.Mve_Fecha >= DATEADD(DAY, -7, GETDATE())
          AND (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado = 0)
        GROUP BY CAST(mve.Mve_Fecha AS DATE)
        ORDER BY fecha;
      `);
    
    res.json({
      success: true,
      data: {
        saldoActual: result.recordsets[0][0]?.saldo_actual || 0,
        hoy: {
          movimientos: result.recordsets[1][0]?.movimientos_hoy || 0,
          ingresos: result.recordsets[1][0]?.ingresos_hoy || 0,
          egresos: result.recordsets[1][0]?.egresos_hoy || 0
        },
        mes: {
          movimientos: result.recordsets[2][0]?.movimientos_mes || 0,
          ingresos: result.recordsets[2][0]?.ingresos_mes || 0,
          egresos: result.recordsets[2][0]?.egresos_mes || 0
        },
        ultimosMovimientos: result.recordsets[3] || [],
        evolucion7Dias: result.recordsets[4] || []
      },
      generadoEn: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo dashboard de caja:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
