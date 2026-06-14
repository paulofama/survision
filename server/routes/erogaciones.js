// =====================================================
// RUTAS DE EROGACIONES / COSTOS FIJOS
// Sistema de Costos - Instituto Dr. Mercado
// v2.0 - Con MovValoresEnca (Egresos de Caja)
// =====================================================

const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');

// =====================================================
// GET /api/erogaciones/resumen/:anio
// Resumen mensual de erogaciones del año
// IMPORTANTE: Esta ruta debe ir ANTES de /:anio/:mes
// =====================================================
router.get('/resumen/:anio', async (req, res) => {
  try {
    const anio = parseInt(req.params.anio);
    
    if (isNaN(anio)) {
      return res.status(400).json({ 
        error: 'Parámetro inválido',
        message: 'anio debe ser un número válido'
      });
    }
    
    console.log(`📊 Consultando resumen erogaciones ${anio}...`);
    
    const query = `
      WITH Erogaciones AS (
        -- Proveedores (solo pagos reales: OP, PV)
        SELECT 
          MONTH(mp.Fecha) AS mes,
          'Proveedores' AS fuente,
          SUM(ABS(ISNULL(mp.Total, 0))) AS total,
          COUNT(*) AS cantidad
        FROM MovProv mp
        INNER JOIN TipoComp tc ON mp.TComp_id = tc.TComp_id
        WHERE YEAR(mp.Fecha) = ${anio}
          AND ISNULL(mp.Anulado, 0) = 0
          AND ABS(ISNULL(mp.Total, 0)) > 0
          AND tc.TComp_Signo = -1
        GROUP BY MONTH(mp.Fecha)

        UNION ALL

        -- Egresos de Caja (MovValoresEnca con Signo negativo)
        SELECT 
          MONTH(mve.Mve_Fecha) AS mes,
          'EgresosCaja' AS fuente,
          SUM(ABS(ISNULL(mve.Mve_Total, 0))) AS total,
          COUNT(*) AS cantidad
        FROM MovValoresEnca mve
        LEFT JOIN TipoComp tc ON mve.TComp_id = tc.TComp_id
        WHERE YEAR(mve.Mve_Fecha) = ${anio}
          AND ISNULL(mve.Mve_Anulado, 0) = 0
          AND ISNULL(mve.Mve_Signo, 0) = -1
          AND ABS(ISNULL(mve.Mve_Total, 0)) > 0
        GROUP BY MONTH(mve.Mve_Fecha)

        UNION ALL

        -- Liquidaciones
        SELECT 
          MONTH(lc.LiqComp_Fecha) AS mes,
          'Liquidaciones' AS fuente,
          SUM(ABS(ISNULL(lc.LiqComp_Total, 0))) AS total,
          COUNT(*) AS cantidad
        FROM LiqComp lc
        WHERE YEAR(lc.LiqComp_Fecha) = ${anio}
          AND ISNULL(lc.LiqComp_Anulado, 0) = 0
        GROUP BY MONTH(lc.LiqComp_Fecha)
      )
      SELECT 
        mes,
        SUM(CASE WHEN fuente = 'Proveedores' THEN total ELSE 0 END) AS proveedores,
        SUM(CASE WHEN fuente = 'EgresosCaja' THEN total ELSE 0 END) AS egresos_caja,
        SUM(CASE WHEN fuente = 'Liquidaciones' THEN total ELSE 0 END) AS liquidaciones,
        SUM(total) AS total_mes,
        SUM(cantidad) AS cantidad_total
      FROM Erogaciones
      GROUP BY mes
      ORDER BY mes
    `;

    const result = await executeQuery(query);
    
    // Crear array completo con 12 meses (rellenando con 0 los vacíos)
    const resumenCompleto = [];
    for (let m = 1; m <= 12; m++) {
      const datoMes = result.recordset.find(r => r.mes === m);
      resumenCompleto.push({
        Mes: m,
        NombreMes: new Date(anio, m - 1, 1).toLocaleString('es-AR', { month: 'long' }),
        Proveedores: datoMes?.proveedores || 0,
        EgresosCaja: datoMes?.egresos_caja || 0,
        Liquidaciones: datoMes?.liquidaciones || 0,
        TotalMes: datoMes?.total_mes || 0,
        CantidadTotal: datoMes?.cantidad_total || 0
      });
    }
    
    // Calcular totales anuales
    const totales = {
      proveedores: resumenCompleto.reduce((sum, m) => sum + m.Proveedores, 0),
      egresos_caja: resumenCompleto.reduce((sum, m) => sum + m.EgresosCaja, 0),
      liquidaciones: resumenCompleto.reduce((sum, m) => sum + m.Liquidaciones, 0),
      total_anual: resumenCompleto.reduce((sum, m) => sum + m.TotalMes, 0)
    };
    
    console.log(`✅ Resumen ${anio}: $${totales.total_anual.toLocaleString()} (Prov: $${totales.proveedores.toLocaleString()}, Caja: $${totales.egresos_caja.toLocaleString()}, Liq: $${totales.liquidaciones.toLocaleString()})`);
    
    res.json({
      success: true,
      anio,
      data: resumenCompleto,
      totales
    });
    
  } catch (error) {
    console.error('❌ Error en resumen erogaciones:', error);
    res.status(500).json({ 
      error: 'Error al obtener resumen',
      message: error.message 
    });
  }
});

// =====================================================
// GET /api/erogaciones/proveedores/:anio
// Lista de proveedores con totales anuales
// =====================================================
router.get('/proveedores/:anio', async (req, res) => {
  try {
    const anio = parseInt(req.params.anio);
    
    if (isNaN(anio)) {
      return res.status(400).json({ 
        error: 'Parámetro inválido',
        message: 'anio debe ser un número válido'
      });
    }
    
    console.log(`📊 Consultando proveedores ${anio}...`);
    
    const query = `
      SELECT 
        ISNULL(p.Prov_id, 0) AS proveedor_id,
        ISNULL(p.Prov_Nombre, mp.Nombre) AS proveedor_nombre,
        COUNT(*) AS cantidad_comprobantes,
        SUM(ABS(ISNULL(mp.Total, 0))) AS total_anual
      FROM MovProv mp
      LEFT JOIN Proveedores p ON mp.Prov_id = p.Prov_id
      INNER JOIN TipoComp tc ON mp.TComp_id = tc.TComp_id
      WHERE YEAR(mp.Fecha) = ${anio}
        AND ISNULL(mp.Anulado, 0) = 0
        AND ABS(ISNULL(mp.Total, 0)) > 0
        AND tc.TComp_Signo = -1
      GROUP BY p.Prov_id, p.Prov_Nombre, mp.Nombre
      ORDER BY total_anual DESC
    `;

    const result = await executeQuery(query);
    
    console.log(`✅ Proveedores ${anio}: ${result.recordset.length} proveedores`);
    
    res.json({
      success: true,
      anio,
      total_proveedores: result.recordset.length,
      data: result.recordset
    });
    
  } catch (error) {
    console.error('❌ Error en proveedores:', error);
    res.status(500).json({ 
      error: 'Error al obtener proveedores',
      message: error.message 
    });
  }
});

// =====================================================
// GET /api/erogaciones/categorias/:anio/:mes
// Erogaciones agrupadas por categoría
// =====================================================
router.get('/categorias/:anio/:mes', async (req, res) => {
  try {
    const anio = parseInt(req.params.anio);
    const mes = parseInt(req.params.mes);
    
    if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ 
        error: 'Parámetros inválidos',
        message: 'anio y mes deben ser números válidos'
      });
    }
    
    console.log(`📊 Consultando categorías ${mes}/${anio}...`);
    
    const query = `
      SELECT 
        'Gastos Proveedores' AS categoria,
        COUNT(*) AS cantidad,
        SUM(ABS(ISNULL(mp.Total, 0))) AS total
      FROM MovProv mp
      INNER JOIN TipoComp tc ON mp.TComp_id = tc.TComp_id
      WHERE YEAR(mp.Fecha) = ${anio}
        AND MONTH(mp.Fecha) = ${mes}
        AND ISNULL(mp.Anulado, 0) = 0
        AND ABS(ISNULL(mp.Total, 0)) > 0
        AND tc.TComp_Signo = -1

      UNION ALL

      SELECT 
        'Egresos de Caja' AS categoria,
        COUNT(*) AS cantidad,
        SUM(ABS(ISNULL(mve.Mve_Total, 0))) AS total
      FROM MovValoresEnca mve
      WHERE YEAR(mve.Mve_Fecha) = ${anio}
        AND MONTH(mve.Mve_Fecha) = ${mes}
        AND ISNULL(mve.Mve_Anulado, 0) = 0
        AND ISNULL(mve.Mve_Signo, 0) = -1
        AND ABS(ISNULL(mve.Mve_Total, 0)) > 0

      UNION ALL

      SELECT 
        'Honorarios Profesionales' AS categoria,
        COUNT(*) AS cantidad,
        SUM(ABS(ISNULL(lc.LiqComp_Total, 0))) AS total
      FROM LiqComp lc
      WHERE YEAR(lc.LiqComp_Fecha) = ${anio}
        AND MONTH(lc.LiqComp_Fecha) = ${mes}
        AND ISNULL(lc.LiqComp_Anulado, 0) = 0
        AND ABS(ISNULL(lc.LiqComp_Total, 0)) > 0

      ORDER BY total DESC
    `;

    const result = await executeQuery(query);
    
    const totalGeneral = result.recordset.reduce((sum, cat) => sum + (cat.total || 0), 0);
    
    console.log(`✅ Categorías ${mes}/${anio}: ${result.recordset.length} categorías, total $${totalGeneral.toLocaleString()}`);
    
    res.json({
      success: true,
      anio,
      mes,
      categorias: result.recordset,
      total_general: totalGeneral
    });
    
  } catch (error) {
    console.error('❌ Error en categorías:', error);
    res.status(500).json({ 
      error: 'Error al obtener categorías',
      message: error.message 
    });
  }
});

// =====================================================
// GET /api/erogaciones/:anio/:mes
// Obtiene todas las erogaciones de un mes específico
// IMPORTANTE: Esta ruta debe ir AL FINAL (es la más genérica)
// =====================================================
router.get('/:anio/:mes', async (req, res) => {
  try {
    const anio = parseInt(req.params.anio);
    const mes = parseInt(req.params.mes);
    
    // Validar parámetros
    if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ 
        error: 'Parámetros inválidos',
        message: 'anio y mes deben ser números válidos'
      });
    }
    
    console.log(`📊 Consultando erogaciones ${mes}/${anio}...`);
    
    const query = `
      -- =====================================================
      -- FUENTE 1: MovProv (Solo pagos reales: OP, PV)
      -- Excluye facturas y notas de débito (son deuda, no pago)
      -- =====================================================
      SELECT 
        'MovProv' AS fuente,
        mp.MProv_id AS id_geclisa,
        mp.Fecha AS fecha,
        ISNULL(p.Prov_Nombre, mp.Nombre) AS proveedor_nombre,
        ISNULL(mp.Obs, '') AS descripcion,
        ABS(ISNULL(mp.Total, 0)) AS monto,
        'Gastos Proveedores' AS categoria_sugerida,
        ISNULL(tc.TComp_Nombre, 'Comprobante') AS tipo_comprobante,
        ISNULL(mp.Letra, '') + ' ' + 
          ISNULL(CAST(mp.Suc AS VARCHAR), '') + '-' + 
          ISNULL(CAST(mp.Numero AS VARCHAR), '') AS numero_comprobante
      FROM MovProv mp
      LEFT JOIN Proveedores p ON mp.Prov_id = p.Prov_id
      INNER JOIN TipoComp tc ON mp.TComp_id = tc.TComp_id
      WHERE YEAR(mp.Fecha) = ${anio}
        AND MONTH(mp.Fecha) = ${mes}
        AND ISNULL(mp.Anulado, 0) = 0
        AND ABS(ISNULL(mp.Total, 0)) > 0
        AND tc.TComp_Signo = -1

      UNION ALL

      -- =====================================================
      -- FUENTE 2: MovValoresEnca (Egresos de Caja)
      -- Solo comprobantes con Signo = -1 (egresos)
      -- Tipos: PV (Pagos Varios), EC (Egreso Caja), PS (Pagos Sueldos)
      -- =====================================================
      SELECT 
        'MovValoresEnca' AS fuente,
        mve.Mve_id AS id_geclisa,
        mve.Mve_Fecha AS fecha,
        ISNULL(mve.Mve_Nombre, 'Egreso de Caja') AS proveedor_nombre,
        ISNULL(mve.Mve_Obs, '') AS descripcion,
        ABS(ISNULL(mve.Mve_Total, 0)) AS monto,
        CASE 
          WHEN tc.TComp_sigla = 'PV'  THEN 'Pagos Varios'
          WHEN tc.TComp_sigla = 'EC'  THEN 'Egresos de Caja'
          WHEN tc.TComp_sigla = 'PS'  THEN 'Pagos Sueldos'
          WHEN tc.TComp_sigla = 'OP'  THEN 'Orden de Pago'
          WHEN tc.TComp_sigla = 'OPL' THEN 'Orden Pago Liquidación'
          ELSE ISNULL(tc.TComp_Nombre, 'Egreso')
        END AS categoria_sugerida,
        ISNULL(tc.TComp_Nombre, 'Egreso') AS tipo_comprobante,
        ISNULL(mve.Mve_Letra, '') + ' ' + 
          ISNULL(CAST(mve.Mve_Suc AS VARCHAR), '') + '-' + 
          ISNULL(CAST(mve.Mve_NroDoc AS VARCHAR), '') AS numero_comprobante
      FROM MovValoresEnca mve
      LEFT JOIN TipoComp tc ON mve.TComp_id = tc.TComp_id
      WHERE YEAR(mve.Mve_Fecha) = ${anio}
        AND MONTH(mve.Mve_Fecha) = ${mes}
        AND ISNULL(mve.Mve_Anulado, 0) = 0
        AND ISNULL(mve.Mve_Signo, 0) = -1
        AND ABS(ISNULL(mve.Mve_Total, 0)) > 0

      UNION ALL

      -- =====================================================
      -- FUENTE 3: LiqComp (Liquidaciones a Prestadores)
      -- =====================================================
      SELECT 
        'LiqComp' AS fuente,
        lc.LiqComp_id AS id_geclisa,
        lc.LiqComp_Fecha AS fecha,
        ISNULL(pre.pre_nombre, lc.LiqComp_Nombre) AS proveedor_nombre,
        'Liquidación de honorarios' AS descripcion,
        ABS(ISNULL(lc.LiqComp_Total, 0)) AS monto,
        'Honorarios Profesionales' AS categoria_sugerida,
        'Liquidación' AS tipo_comprobante,
        ISNULL(lc.LiqComp_Letra, '') + ' ' + 
          ISNULL(CAST(lc.LiqComp_Suc AS VARCHAR), '') + '-' + 
          ISNULL(CAST(lc.LiqComp_NroDoc AS VARCHAR), '') AS numero_comprobante
      FROM LiqComp lc
      LEFT JOIN Prestadores pre ON lc.Pre_id = pre.pre_id
      WHERE YEAR(lc.LiqComp_Fecha) = ${anio}
        AND MONTH(lc.LiqComp_Fecha) = ${mes}
        AND ISNULL(lc.LiqComp_Anulado, 0) = 0
        AND ABS(ISNULL(lc.LiqComp_Total, 0)) > 0

      ORDER BY fecha DESC, monto DESC
    `;

    const result = await executeQuery(query);
    
    // Contar por fuente para el log
    const porFuente = result.recordset.reduce((acc, r) => {
      acc[r.fuente] = (acc[r.fuente] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`✅ Erogaciones ${mes}/${anio}: ${result.recordset.length} registros (MovProv: ${porFuente.MovProv || 0}, MovValoresEnca: ${porFuente.MovValoresEnca || 0}, LiqComp: ${porFuente.LiqComp || 0})`);
    
    res.json({
      success: true,
      anio,
      mes,
      total_registros: result.recordset.length,
      data: result.recordset
    });
    
  } catch (error) {
    console.error('❌ Error en erogaciones:', error);
    res.status(500).json({ 
      error: 'Error al obtener erogaciones',
      message: error.message 
    });
  }
});

module.exports = router;
