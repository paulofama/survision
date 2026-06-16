// ============================================
// SERVIDOR EXPRESS - API BACKEND
// Sistema de Costos - Instituto Dr. Mercado
// Conexión con SQL Server Local (GECLISA)
// v2.0.0 - Con Seguimiento de Pacientes
// ============================================

// Cargar variables de entorno PRIMERO
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const os = require('os');

// Importar rutas
const nomencladorRoutes = require('./routes/nomenclador');
const movimientosRoutes = require('./routes/movimientos');
const obrasSocialesRoutes = require('./routes/obras-sociales');
const prestadoresRoutes = require('./routes/prestadores');
const prestacionesRealizadasRoutes = require('./routes/prestaciones-realizadas');
const elementosGeclisaRoutes = require('./routes/elementos-geclisa');
const prestadoresGeclisaRoutes = require('./routes/prestadores-geclisa');
const turnosRoutes = require('./routes/turnos');
const erogacionesRoutes = require('./routes/erogaciones');
const tesoreriaRoutes = require('./routes/tesoreria');
const informesRoutes = require('./routes/informes');
const derivacionesRoutes = require('./routes/derivaciones');
const pacientesRoutes = require('./routes/pacientes'); // ← PACIENTES (NUEVO)
const seguimientoPacientesRoutes = require('./routes/seguimiento-pacientes'); // ← SEGUIMIENTO PACIENTES
const empleadosRoutes = require('./routes/empleados'); // ← SUELDOS - EMPLEADOS (NUEVO)
const f931Routes = require('./routes/f931');           // ← SUELDOS - F.931 PARSER (FASE 3)
const conciliacionRoutes = require('./routes/conciliacion'); // ← SUELDOS - CONCILIACION (FASE 3)
const asientosRoutes = require('./routes/asientos');         // ← SUELDOS - ASIENTOS (FASE 4)
const fiscalRoutes = require('./routes/fiscal');             // ← MODULO FISCAL (IVA)

// ============================================
// FUNCIÓN PARA OBTENER IP LOCAL
// ============================================

const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

// ============================================
// CONFIGURACIÓN DEL SERVIDOR
// ============================================

const app = express();
const PORT = process.env.PORT || 3001;
const LOCAL_IP = getLocalIP();

// ============================================
// CORS - Permitir acceso desde red local
// ============================================

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      `http://${LOCAL_IP}:3000`,
      `http://${LOCAL_IP}:3001`,
      `http://${LOCAL_IP}:5173`,
    ];
    
    if (origin.match(/^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/)) {
      return callback(null, true);
    }
    
    if (origin.match(/^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/)) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.log('⚠️  CORS bloqueado para origen:', origin);
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());

// Logging de requests
app.use((req, res, next) => {
  console.log(`📥 ${new Date().toISOString()} | ${req.method} ${req.url}`);
  next();
});

// ============================================
// RUTAS
// ============================================

// Ruta de salud del servidor
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Sistema de Costos - API Backend',
    version: '2.0.0',
    network: {
      localIP: LOCAL_IP,
      port: PORT,
      urls: {
        local: `http://localhost:${PORT}`,
        network: `http://${LOCAL_IP}:${PORT}`
      }
    },
    endpoints: [
      '/api/nomenclador',
      '/api/movimientos',
      '/api/movimientos/stats',
      '/api/movimientos/por-obra-social',
      '/api/movimientos/por-prestador',
      '/api/movimientos/evolucion-mensual',
      '/api/obras-sociales',
      '/api/prestadores',
      '/api/prestaciones-realizadas',
      '/api/prestaciones-realizadas/stats',
      '/api/prestaciones-realizadas/filtros',
      '/api/prestaciones-realizadas/derivadores',
      '/api/elementos-geclisa',
      '/api/elementos-geclisa/stats',
      '/api/elementos-geclisa/tipos',
      '/api/prestadores-geclisa',
      '/api/prestadores-geclisa/activos',
      '/api/prestadores-geclisa/stats',
      '/api/turnos/analisis',
      '/api/turnos/hoy',
      '/api/turnos/semana',
      '/api/erogaciones/:anio/:mes',
      '/api/erogaciones/resumen/:anio',
      '/api/erogaciones/proveedores/:anio',
      '/api/erogaciones/categorias/:anio/:mes',
      '/api/tesoreria/caja/saldo',
      '/api/tesoreria/caja/saldo-historico',
      '/api/tesoreria/caja/movimientos',
      '/api/tesoreria/caja/tipos-comprobante',
      '/api/tesoreria/caja/resumen-diario',
      '/api/tesoreria/caja/dashboard',
      '/api/informes/verificar-pin',
      '/api/informes/ejecutivo-mensual',
      '/api/informes/meses-disponibles',
      '/api/derivaciones/derivadores',
      '/api/derivaciones/liquidacion',
      '/api/derivaciones/resumen',
      '/api/derivaciones/anios-disponibles',
      // PACIENTES (NUEVO)
      '/api/pacientes/buscar-dni/:dni',
      '/api/pacientes/buscar/:termino',
      // SEGUIMIENTO PACIENTES
      '/api/seguimiento-pacientes/informe-mensual',
      '/api/seguimiento-pacientes/meses-disponibles',
      // SUELDOS - EMPLEADOS (Supabase)
      '/api/empleados',
      '/api/empleados/:id',
      // SUELDOS - F.931 (Parser PDF)
      'POST /api/f931/parse?anio=YYYY&mes=MM',
      'GET /api/f931/health/parser',
      // SUELDOS - Conciliacion (Minuta vs F.931)
      'GET /api/conciliacion/:anio/:mes',
      'POST /api/conciliacion/:anio/:mes/recalcular',
      'PATCH /api/conciliacion/diferencia/:id/justificar',
      // SUELDOS - Asiento (Propuesta de devengamiento, Fase 4)
      'GET /api/asientos/:anio/:mes',
      'POST /api/asientos/:anio/:mes/generar',
      'DELETE /api/asientos/:anio/:mes'
    ]
  });
});

// Rutas de nomenclador (prestaciones)
app.use('/api/nomenclador', nomencladorRoutes);

// Rutas de movimientos (atenciones)
app.use('/api/movimientos', movimientosRoutes);

// Rutas de obras sociales
app.use('/api/obras-sociales', obrasSocialesRoutes);

// Rutas de prestadores
app.use('/api/prestadores', prestadoresRoutes);

// Rutas de prestaciones realizadas (Dashboard tipo Power BI)
app.use('/api/prestaciones-realizadas', prestacionesRealizadasRoutes);

// Rutas de elementos GECLISA (Sincronización con Supabase)
app.use('/api/elementos-geclisa', elementosGeclisaRoutes);

// Rutas de prestadores GECLISA (Sincronización con Supabase)
app.use('/api/prestadores-geclisa', prestadoresGeclisaRoutes);

// Rutas de Turnos (Análisis)
app.use('/api/turnos', turnosRoutes);

// Rutas de Erogaciones (Costos Fijos)
app.use('/api/erogaciones', erogacionesRoutes);

// Rutas de Tesorería (Caja y Bancos)
app.use('/api/tesoreria', tesoreriaRoutes);

// Rutas de Informes Ejecutivos (Acceso Restringido)
app.use('/api/informes', informesRoutes);

// Rutas de Derivaciones (Liquidación)
app.use('/api/derivaciones', derivacionesRoutes);

// Rutas de Pacientes (Búsqueda por DNI - Presupuestador)
app.use('/api/pacientes', pacientesRoutes); // ← PACIENTES (NUEVO)

// Rutas de Seguimiento de Pacientes (Informe Mensual Clínico)
app.use('/api/seguimiento-pacientes', seguimientoPacientesRoutes);

// Rutas de Empleados (Modulo Sueldos - tabla Supabase)
app.use('/api/empleados', empleadosRoutes);

// Rutas de F.931 (Modulo Sueldos - parser PDF)
app.use('/api/f931', f931Routes);

// Rutas de Conciliacion (Modulo Sueldos - minuta vs F.931)
app.use('/api/conciliacion', conciliacionRoutes);

// Rutas de Asientos (Modulo Sueldos - propuesta de devengamiento, Fase 4)
app.use('/api/asientos', asientosRoutes);

// Modulo Fiscal (IVA): sync GECLISA -> Supabase + freshness
app.use('/api/fiscal', fiscalRoutes);

// ============================================
// MANEJO DE ERRORES
// ============================================

// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Ruta no encontrada',
    path: req.url 
  });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: err.message 
  });
});

// ============================================
// INICIAR SERVIDOR - ESCUCHAR EN TODAS LAS INTERFACES
// ============================================

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     🚀 SERVIDOR API BACKEND INICIADO                       ║');
  console.log('║     Sistema de Costos - Instituto Dr. Mercado              ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║                                                            ║');
  console.log(`║  🔒 Local:      http://localhost:${PORT}                      ║`);
  console.log(`║  🌐 Red:        http://${LOCAL_IP}:${PORT}                    ║`);
  console.log('║                                                            ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Endpoints disponibles:                                    ║');
  console.log('║                                                            ║');
  console.log('║  ❤️  Health:     /api/health                               ║');
  console.log('║  📋 Nomenclador: /api/nomenclador                          ║');
  console.log('║  📊 Prestaciones:/api/prestaciones-realizadas              ║');
  console.log('║  📅 Turnos:      /api/turnos/analisis                      ║');
  console.log('║  📦 Elementos:   /api/elementos-geclisa                    ║');
  console.log('║  👨‍⚕️ Prestadores: /api/prestadores-geclisa                  ║');
  console.log('║  💰 Erogaciones: /api/erogaciones/2025/12                  ║');
  console.log('║  🏦 Tesorería:   /api/tesoreria/caja/dashboard             ║');
  console.log('║  📊 Informes:    /api/informes/ejecutivo-mensual           ║');
  console.log('║  🔄 Derivaciones:/api/derivaciones/liquidacion              ║');
  console.log('║  🔍 Pacientes:   /api/pacientes/buscar-dni/:dni            ║');
  console.log('║  📋 Seguimiento: /api/seguimiento-pacientes/informe-mensual ║');
  console.log('║                                                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`💡 Accede desde otros dispositivos usando: http://${LOCAL_IP}:${PORT}`);
  console.log('');
});

module.exports = app;
