// ============================================
// RUTAS DE NOMENCLADOR (PRESTACIONES)
// Sistema de Costos - Instituto Dr. Mercado
// Datos: GECLISA (SQL Server) + Precios: Supabase
// ============================================

const express = require('express');
const router = express.Router();
const { executeQuery, testConnection } = require('../config/database');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');

// ============================================
// HELPER: Fetch con https nativo (compatible con Node < 18)
// ============================================

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(data), status: res.statusCode });
        } catch (e) {
          reject(new Error('Error parseando JSON: ' + e.message));
        }
      });
    }).on('error', reject);
  });
}

// ============================================
// CONFIGURACIÓN SUPABASE (CONTACTO)
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ecraryyvngnyxusdggvj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

let supabase = null;

// Inicializar cliente Supabase solo si hay credenciales
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Cliente Supabase inicializado para precios');
} else {
  console.warn('⚠️ Supabase no configurado - precios no disponibles');
}

// ============================================
// CONSTANTES
// ============================================

const AGRUPACION_ID = 10; // Filtro para obtener solo las prestaciones relevantes

// ============================================
// FUNCIÓN HELPER: Obtener precios de Supabase
// ============================================

async function getPreciosFromSupabase() {
  if (!supabase) {
    console.warn('⚠️ Supabase no disponible, retornando precios vacíos');
    return {};
  }

  try {
    // Primero intentar con moneda, si falla, solo precio
    let data, error;
    
    ({ data, error } = await supabase
      .from('prestaciones')
      .select('codigo, precio, moneda'));

    // Si hay error por columna moneda, intentar sin ella
    if (error && error.message.includes('moneda')) {
      console.log('⚠️ Columna moneda no existe, consultando solo precio...');
      ({ data, error } = await supabase
        .from('prestaciones')
        .select('codigo, precio'));
    }

    if (error) {
      console.error('❌ Error obteniendo precios de Supabase:', error.message);
      return {};
    }

    // Crear mapa codigo -> {precio, moneda} para lookup rápido
    const preciosMap = {};
    if (data) {
      data.forEach(row => {
        if (row.codigo) {
          preciosMap[row.codigo.trim()] = {
            precio: parseFloat(row.precio) || 0,
            moneda: row.moneda || 'USD'
          };
        }
      });
    }

    console.log(`💰 ${Object.keys(preciosMap).length} precios cargados de Supabase`);
    return preciosMap;

  } catch (error) {
    console.error('❌ Error conectando a Supabase:', error.message);
    return {};
  }
}

// ============================================
// GET /api/nomenclador
// Obtener todas las prestaciones (GECLISA + precios Supabase)
// ============================================

router.get('/', async (req, res) => {
  try {
    console.log('📋 Obteniendo prestaciones del Nomenclador...');

    // 1. Obtener precios de Supabase (en paralelo)
    const preciosPromise = getPreciosFromSupabase();

    // 2. Query a GECLISA
    const query = `
      SELECT 
        nom_cod,
        nom_nom,
        nom_id,
        nom_Orden,
        nom_obs,
        nom_CantMax,
        nom_Modulo,
        nom_tcir,
        nom_diasInt,
        nom_DuracionDias
      FROM Nomenclador
      WHERE nom_id = @agrupacionId
      ORDER BY nom_cod ASC
    `;

    const [result, preciosMap] = await Promise.all([
      executeQuery(query, { agrupacionId: AGRUPACION_ID }),
      preciosPromise
    ]);

    // 3. Combinar datos de GECLISA con precios de Supabase
    const prestaciones = result.recordset.map((row, index) => {
      const codigo = row.nom_cod?.toString().trim() || '';
      const precioData = preciosMap[codigo] || { precio: 0, moneda: 'USD' };

      return {
        id: `local-${codigo}`,
        codigo: codigo,
        practica: row.nom_nom?.trim() || '',
        agrupacion_id: row.nom_id?.toString() || '10',
        agrupacion_nombre: 'Cirugías',
        agrupacion_color: '#3B82F6',
        segmento: 'Cirugías',
        precio: precioData.precio,  // ← Precio de Supabase
        moneda: precioData.moneda,  // ← Moneda de Supabase
        activa: true,
        observaciones: row.nom_obs?.trim() || '',
        orden: row.nom_Orden || index,
        cantidad_maxima: row.nom_CantMax || 99,
        modulo: row.nom_Modulo?.trim() || '',
        tipo_cirugia: row.nom_tcir || 0,
        dias_internacion: row.nom_diasInt || 0,
        duracion_dias: row.nom_DuracionDias || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        fuente: 'local'
      };
    });

    // Contar cuántos tienen precio
    const conPrecio = prestaciones.filter(p => p.precio > 0).length;
    console.log(`✅ ${prestaciones.length} prestaciones (${conPrecio} con precio)`);

    res.json({
      success: true,
      data: prestaciones,
      total: prestaciones.length,
      conPrecio: conPrecio,
      fuente: 'GECLISA + Supabase',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo prestaciones:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo prestaciones del servidor local',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================
// GET /api/nomenclador/columnas
// Ver las columnas disponibles en la tabla
// ============================================

router.get('/columnas', async (req, res) => {
  try {
    console.log('🔍 Obteniendo estructura de tabla Nomenclador...');

    const query = `
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Nomenclador'
      ORDER BY ORDINAL_POSITION
    `;

    const result = await executeQuery(query);

    console.log(`✅ ${result.recordset.length} columnas encontradas`);

    res.json({
      success: true,
      data: result.recordset,
      total: result.recordset.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo columnas:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo estructura de tabla',
      message: error.message
    });
  }
});

// ============================================
// GET /api/nomenclador/tipocambio
// Obtener tipo de cambio USD del BCRA
// IMPORTANTE: Esta ruta debe estar ANTES de /:codigo
// ============================================

router.get('/tipocambio', async (req, res) => {
  try {
    console.log('💱 Obteniendo tipo de cambio del BNA (DolarAPI)...');

    // ── FUENTE 1: DolarAPI — devuelve compra/venta reales del BNA ──
    try {
      const response = await fetchJSON('https://dolarapi.com/v1/dolares/oficial');
      if (response.ok && response.data && response.data.venta > 0) {
        const d = response.data;
        console.log(`✅ TC BNA: compra=${d.compra} venta=${d.venta} (DolarAPI)`);
        return res.json({
          success: true,
          data: {
            compra: d.compra,
            venta: d.venta,
            fecha: d.fechaActualizacion || new Date().toISOString().split('T')[0],
            fuente: 'BNA Oficial'
          },
          timestamp: new Date().toISOString()
        });
      }
    } catch (dolarApiError) {
      console.log('⚠️ DolarAPI no disponible:', dolarApiError.message);
    }

    // ── FUENTE 2: BCRA (fallback) ──
    console.log('🔄 Intentando BCRA como fallback...');
    const fecha = new Date().toISOString().split('T')[0];
    const url = `https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones?fecha=${fecha}`;

    try {
      const response = await fetchJSON(url);
      if (response.ok && response.data) {
        const result = procesarCotizacionBCRA(response.data, fecha);
        if (result) {
          console.log(`✅ TC BCRA (fallback): venta=${result.venta} (${fecha})`);
          return res.json({ success: true, data: result, timestamp: new Date().toISOString() });
        }
      }

      // Sin cotización para hoy → intentar con ayer
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);
      const fechaAyer = ayer.toISOString().split('T')[0];
      const responseAyer = await fetchJSON(`https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones?fecha=${fechaAyer}`);
      if (responseAyer.ok && responseAyer.data) {
        const result = procesarCotizacionBCRA(responseAyer.data, fechaAyer);
        if (result) {
          console.log(`✅ TC BCRA (fallback, ayer): venta=${result.venta} (${fechaAyer})`);
          return res.json({ success: true, data: result, timestamp: new Date().toISOString() });
        }
      }
    } catch (bcraError) {
      console.log('⚠️ BCRA no disponible:', bcraError.message);
    }

    throw new Error('No se pudo obtener tipo de cambio de ninguna fuente');

  } catch (error) {
    console.error('❌ Error obteniendo tipo de cambio:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo tipo de cambio',
      message: error.message
    });
  }
});

// Función helper para procesar cotización del BCRA
function procesarCotizacionBCRA(data, fecha) {
  if (data.status === 200 && data.results && data.results.detalle) {
    const usd = data.results.detalle.find(d => d.codigoMoneda === 'USD');
    if (usd && usd.tipoCotizacion) {
      return {
        compra: usd.tipoCotizacion,
        venta: usd.tipoCotizacion, // BCRA solo da un valor de referencia
        fecha: fecha,
        fuente: 'BCRA Oficial'
      };
    }
  }
  return null;
}

// ============================================
// GET /api/nomenclador/:codigo
// Obtener una prestación específica por código
// ============================================

router.get('/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    
    // Evitar que rutas especiales se interpreten como código
    if (['columnas', 'search', 'stats', 'test', 'precio', 'tipocambio'].includes(codigo)) {
      return res.status(400).json({
        success: false,
        error: 'Ruta inválida'
      });
    }
    
    console.log(`📋 Buscando prestación: ${codigo}`);

    // Obtener precio de Supabase
    const preciosMap = await getPreciosFromSupabase();

    const query = `
      SELECT 
        nom_cod,
        nom_nom,
        nom_id,
        nom_Orden,
        nom_obs,
        nom_CantMax,
        nom_Modulo,
        nom_tcir,
        nom_diasInt,
        nom_DuracionDias
      FROM Nomenclador
      WHERE nom_id = @agrupacionId AND nom_cod = @codigo
    `;

    const result = await executeQuery(query, { 
      agrupacionId: AGRUPACION_ID,
      codigo: codigo 
    });

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Prestación no encontrada',
        codigo: codigo
      });
    }

    const row = result.recordset[0];
    const codigoTrim = row.nom_cod?.toString().trim() || '';
    const precioData = preciosMap[codigoTrim] || { precio: 0, moneda: 'USD' };
    
    const prestacion = {
      id: `local-${codigoTrim}`,
      codigo: codigoTrim,
      practica: row.nom_nom?.trim() || '',
      agrupacion_id: row.nom_id?.toString() || '10',
      agrupacion_nombre: 'Cirugías',
      agrupacion_color: '#3B82F6',
      segmento: 'Cirugías',
      precio: precioData.precio,  // ← Precio de Supabase
      moneda: precioData.moneda,  // ← Moneda de Supabase
      activa: true,
      observaciones: row.nom_obs?.trim() || '',
      orden: row.nom_Orden || 0,
      cantidad_maxima: row.nom_CantMax || 99,
      modulo: row.nom_Modulo?.trim() || '',
      tipo_cirugia: row.nom_tcir || 0,
      dias_internacion: row.nom_diasInt || 0,
      duracion_dias: row.nom_DuracionDias || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      fuente: 'local'
    };

    console.log(`✅ Prestación encontrada: ${prestacion.practica} - $${prestacion.precio}`);

    res.json({
      success: true,
      data: prestacion,
      fuente: 'GECLISA + Supabase',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error buscando prestación:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error buscando prestación',
      message: error.message
    });
  }
});

// ============================================
// PUT /api/nomenclador/precio/:codigo
// Actualizar precio de una prestación en Supabase
// ============================================

router.put('/precio/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    const { precio, moneda, practica } = req.body;

    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Supabase no configurado'
      });
    }

    if (precio === undefined || precio === null) {
      return res.status(400).json({
        success: false,
        error: 'Precio es requerido'
      });
    }

    // Validar moneda
    const monedaValida = moneda === 'ARS' ? 'ARS' : 'USD';

    // ── Resolver nombre real de la práctica ───────────────────────────────
    // Si practica no viene en el body, o es igual al codigo (fallback anterior),
    // consultamos GECLISA para obtener el nom_nom real. Esto evita que Supabase
    // quede con practica = '030316' en lugar del nombre real de la prestación.
    let practicaFinal = (practica && practica.trim() && practica.trim() !== codigo.trim())
      ? practica.trim()
      : null;

    if (!practicaFinal) {
      try {
        const geclisaResult = await executeQuery(
          `SELECT nom_nom FROM Nomenclador WHERE nom_cod = @codigo AND nom_id = @agrupacionId`,
          { codigo, agrupacionId: AGRUPACION_ID }
        );
        if (geclisaResult.recordset.length > 0) {
          practicaFinal = geclisaResult.recordset[0].nom_nom?.trim() || codigo;
          console.log(`📋 Nombre obtenido de GECLISA: "${practicaFinal}"`);
        } else {
          practicaFinal = codigo;
        }
      } catch (gErr) {
        console.warn('⚠️ No se pudo consultar GECLISA para nombre:', gErr.message);
        practicaFinal = codigo;
      }
    }

    console.log(`💰 Guardando precio de ${codigo} → ${monedaValida} ${precio} | practica: "${practicaFinal}"`);

    // UPSERT: crea el registro si no existe en Supabase, lo actualiza si ya existe.
    // Usa el nombre real obtenido de GECLISA para el campo practica (NOT NULL).
    const { data, error } = await supabase
      .from('prestaciones')
      .upsert(
        {
          codigo: codigo,
          practica: practicaFinal,
          precio: parseFloat(precio),
          moneda: monedaValida,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'codigo' }
      )
      .select();

    if (error) {
      console.error('❌ Error guardando precio:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Error guardando precio en Supabase',
        message: error.message
      });
    }

    const accion = (data && data.length > 0) ? 'actualizado' : 'registrado';
    console.log(`✅ Precio ${accion}: ${codigo} = ${monedaValida} ${precio}`);

    res.json({
      success: true,
      data: data ? data[0] : { codigo, precio, moneda: monedaValida },
      message: `Precio ${accion} correctamente: ${monedaValida} ${precio}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en actualización de precio:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error actualizando precio',
      message: error.message
    });
  }
});

// ============================================
// GET /api/nomenclador/search/:termino
// Buscar prestaciones por término
// ============================================

router.get('/search/:termino', async (req, res) => {
  try {
    const { termino } = req.params;
    console.log(`🔍 Buscando: "${termino}"`);

    // Obtener precios de Supabase
    const preciosMap = await getPreciosFromSupabase();

    const query = `
      SELECT 
        nom_cod,
        nom_nom,
        nom_id,
        nom_Orden,
        nom_obs
      FROM Nomenclador
      WHERE nom_id = @agrupacionId 
        AND (nom_cod LIKE @termino OR nom_nom LIKE @termino)
      ORDER BY nom_cod ASC
    `;

    const result = await executeQuery(query, { 
      agrupacionId: AGRUPACION_ID,
      termino: `%${termino}%`
    });

    const prestaciones = result.recordset.map((row) => {
      const codigo = row.nom_cod?.toString().trim() || '';
      const precioData = preciosMap[codigo] || { precio: 0, moneda: 'USD' };
      return {
        id: `local-${codigo}`,
        codigo: codigo,
        practica: row.nom_nom?.trim() || '',
        agrupacion_id: row.nom_id?.toString() || '10',
        agrupacion_nombre: 'Cirugías',
        segmento: 'Cirugías',
        precio: precioData.precio,  // ← Precio de Supabase
        moneda: precioData.moneda,  // ← Moneda de Supabase
        activa: true,
        fuente: 'local'
      };
    });

    console.log(`✅ ${prestaciones.length} resultados para "${termino}"`);

    res.json({
      success: true,
      data: prestaciones,
      total: prestaciones.length,
      termino: termino,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en búsqueda:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error en búsqueda',
      message: error.message
    });
  }
});

// ============================================
// GET /api/nomenclador/stats/resumen
// Obtener estadísticas del nomenclador
// ============================================

router.get('/stats/resumen', async (req, res) => {
  try {
    console.log('📊 Obteniendo estadísticas...');

    const query = `
      SELECT 
        COUNT(*) AS total
      FROM Nomenclador
      WHERE nom_id = @agrupacionId
    `;

    const result = await executeQuery(query, { agrupacionId: AGRUPACION_ID });
    const stats = result.recordset[0];

    res.json({
      success: true,
      data: {
        total: stats.total || 0,
        agrupacion_filtrada: AGRUPACION_ID,
        fuente: 'GECLISA + Supabase'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo estadísticas',
      message: error.message
    });
  }
});

// ============================================
// GET /api/nomenclador/test/connection
// Verificar conexión con las bases de datos
// ============================================

router.get('/test/connection', async (req, res) => {
  try {
    console.log('🔌 Verificando conexiones...');
    
    // Test GECLISA
    const geclisaConnected = await testConnection();
    
    // Test Supabase
    let supabaseConnected = false;
    if (supabase) {
      try {
        const { error } = await supabase.from('prestaciones').select('count').limit(1);
        supabaseConnected = !error;
      } catch {
        supabaseConnected = false;
      }
    }

    res.json({
      success: geclisaConnected,
      connections: {
        geclisa: {
          connected: geclisaConnected,
          servidor: '192.168.1.73',
          database: 'GECLISA'
        },
        supabase: {
          connected: supabaseConnected,
          url: SUPABASE_URL ? 'Configurado' : 'No configurado'
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en test de conexión:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error verificando conexión',
      message: error.message
    });
  }
});

// ============================================
// ============================================
// POST /api/nomenclador/sync
// Sincroniza nombres desde GECLISA → Supabase
// Solo actualiza codigo + practica, NUNCA toca precio/moneda
// ============================================

router.post('/sync', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Supabase no configurado' });
    }

    console.log('🔄 Iniciando sync GECLISA → Supabase...');

    // 1. Leer todos los registros de GECLISA
    const query = `
      SELECT nom_cod, nom_nom
      FROM Nomenclador
      WHERE nom_id = @agrupacionId
      ORDER BY nom_cod ASC
    `;
    const result = await executeQuery(query, { agrupacionId: AGRUPACION_ID });
    const rows = result.recordset;

    console.log(`📋 ${rows.length} prestaciones obtenidas de GECLISA`);

    if (rows.length === 0) {
      return res.json({ success: true, message: 'No hay prestaciones en GECLISA', insertados: 0, actualizados: 0 });
    }

    // 2. Obtener precios actuales de Supabase (para preservarlos)
    const { data: sbActuales } = await supabase
      .from('prestaciones')
      .select('codigo, precio, moneda, activa, agrupacion_id');

    const preciosExistentes = {};
    (sbActuales || []).forEach(r => {
      preciosExistentes[r.codigo?.trim()] = {
        precio: r.precio,
        moneda: r.moneda || 'USD',
        activa: r.activa !== false,
        agrupacion_id: r.agrupacion_id
      };
    });

    // 3. Preparar registros para upsert
    // Si ya existe en Supabase → preserva precio/moneda/activa
    // Si es nuevo → precio null, moneda USD, activa true
    const upsertRows = rows.map(row => {
      const codigo = row.nom_cod?.toString().trim();
      const practica = row.nom_nom?.trim() || codigo;
      const existente = preciosExistentes[codigo] || {};

      return {
        codigo,
        practica,
        precio: existente.precio ?? null,
        moneda: existente.moneda || 'USD',
        activa: existente.activa !== false,
        agrupacion_id: existente.agrupacion_id || null,
        updated_at: new Date().toISOString()
      };
    });

    // 4. Upsert en lotes de 100 para no saturar
    const LOTE = 100;
    let insertados = 0;
    let actualizados = 0;
    const errores = [];

    for (let i = 0; i < upsertRows.length; i += LOTE) {
      const lote = upsertRows.slice(i, i + LOTE);
      const { data, error } = await supabase
        .from('prestaciones')
        .upsert(lote, { onConflict: 'codigo' })
        .select('codigo');

      if (error) {
        console.error(`❌ Error en lote ${i}-${i + LOTE}:`, error.message);
        errores.push({ lote: i, error: error.message });
      } else {
        const procesados = (data || []).length;
        // Los que ya existían se actualizan, los nuevos se insertan
        lote.forEach(r => {
          if (preciosExistentes[r.codigo] !== undefined) actualizados++;
          else insertados++;
        });
        console.log(`  ✅ Lote ${Math.floor(i / LOTE) + 1}: ${procesados} registros`);
      }
    }

    console.log(`✅ Sync completo: ${insertados} nuevos, ${actualizados} actualizados`);

    res.json({
      success: true,
      total_geclisa: rows.length,
      insertados,
      actualizados,
      errores: errores.length > 0 ? errores : undefined,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en sync:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/nomenclador/repair/nombres
// Reparar registros en Supabase donde practica = codigo
// (ocurre cuando el upsert anterior usó el fallback practica || codigo)
// Llama a este endpoint UNA VEZ para corregir registros corruptos.
// ============================================

router.post('/repair/nombres', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Supabase no configurado' });
    }

    console.log('🔧 Iniciando reparación de nombres de prestaciones...');

    // 1. Obtener todos los registros de Supabase
    const { data: sbRows, error: sbError } = await supabase
      .from('prestaciones')
      .select('codigo, practica');

    if (sbError) throw new Error(sbError.message);

    // 2. Filtrar los que tienen practica == codigo (corruptos)
    const corruptos = (sbRows || []).filter(r =>
      r.practica && r.codigo && r.practica.trim() === r.codigo.trim()
    );

    console.log(`🔍 ${corruptos.length} registros corruptos encontrados de ${(sbRows || []).length} total`);

    if (corruptos.length === 0) {
      return res.json({ success: true, message: 'No hay registros para reparar', reparados: 0 });
    }

    // 3. Para cada corrupto, buscar el nombre real en GECLISA y actualizar Supabase
    const resultados = [];
    for (const row of corruptos) {
      try {
        const gResult = await executeQuery(
          `SELECT nom_nom FROM Nomenclador WHERE nom_cod = @codigo AND nom_id = @agrupacionId`,
          { codigo: row.codigo, agrupacionId: AGRUPACION_ID }
        );

        if (gResult.recordset.length > 0) {
          const nombreReal = gResult.recordset[0].nom_nom?.trim();
          if (nombreReal && nombreReal !== row.codigo) {
            const { error: updError } = await supabase
              .from('prestaciones')
              .update({ practica: nombreReal, updated_at: new Date().toISOString() })
              .eq('codigo', row.codigo);

            if (updError) {
              resultados.push({ codigo: row.codigo, ok: false, error: updError.message });
            } else {
              resultados.push({ codigo: row.codigo, ok: true, nombre: nombreReal });
              console.log(`  ✅ ${row.codigo} → "${nombreReal}"`);
            }
          } else {
            resultados.push({ codigo: row.codigo, ok: false, error: 'Nombre no encontrado en GECLISA' });
          }
        } else {
          resultados.push({ codigo: row.codigo, ok: false, error: 'No existe en GECLISA' });
        }
      } catch (err) {
        resultados.push({ codigo: row.codigo, ok: false, error: err.message });
      }
    }

    const reparados = resultados.filter(r => r.ok).length;
    console.log(`✅ Reparación completa: ${reparados}/${corruptos.length} registros corregidos`);

    res.json({
      success: true,
      reparados,
      total_corruptos: corruptos.length,
      detalle: resultados,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en reparación:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
