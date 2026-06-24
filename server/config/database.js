// ============================================
// CONFIGURACIÓN DE BASE DE DATOS SQL SERVER
// Sistema de Costos - Instituto Dr. Mercado
// Servidor: GECLISA (192.168.1.73)
// ============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const sql = require('mssql');

// ============================================
// CONFIGURACIÓN DE CONEXIÓN
// ============================================

const dbConfig = {
  server: process.env.DB_SERVER,                   // IP del servidor GECLISA (server/.env)
  database: process.env.DB_DATABASE,               // Nombre de la base de datos
  user: process.env.DB_USER,                       // Usuario
  password: process.env.DB_PASSWORD,               // Contraseña (NUNCA hardcodear)
  port: parseInt(process.env.DB_PORT, 10) || 1433, // Puerto SQL Server (por defecto)
  options: {
    encrypt: false,                  // Sin encriptación para red local
    trustServerCertificate: true,    // Confiar en certificado del servidor
    enableArithAbort: true,          // Requerido para SQL Server
    instanceName: undefined,         // Si usa instancia nombrada, especificar aquí
  },
  pool: {
    max: 10,                         // Máximo de conexiones en el pool
    min: 0,                          // Mínimo de conexiones
    idleTimeoutMillis: 30000,        // Tiempo de inactividad antes de cerrar
  },
  connectionTimeout: 30000,          // Timeout de conexión (30 segundos)
  requestTimeout: 30000,             // Timeout de requests (30 segundos)
};

// ============================================
// POOL DE CONEXIONES
// ============================================

let pool = null;

/**
 * Obtener conexión al pool de SQL Server
 * @returns {Promise<sql.ConnectionPool>}
 */
const getConnection = async () => {
  try {
    if (pool) {
      return pool;
    }

    console.log('🔌 Conectando a SQL Server...');
    console.log(`   Servidor: ${dbConfig.server}`);
    console.log(`   Base de datos: ${dbConfig.database}`);
    
    pool = await sql.connect(dbConfig);
    
    console.log('✅ Conexión a SQL Server establecida');
    return pool;
  } catch (error) {
    console.error('❌ Error conectando a SQL Server:', error.message);
    throw error;
  }
};

/**
 * Cerrar conexión al pool
 */
const closeConnection = async () => {
  try {
    if (pool) {
      await pool.close();
      pool = null;
      console.log('🔒 Conexión a SQL Server cerrada');
    }
  } catch (error) {
    console.error('❌ Error cerrando conexión:', error.message);
  }
};

/**
 * Ejecutar query con parámetros
 * @param {string} query - Query SQL a ejecutar
 * @param {Object} params - Parámetros de la query
 * @returns {Promise<sql.IResult>}
 */
const executeQuery = async (query, params = {}) => {
  try {
    const connection = await getConnection();
    const request = connection.request();

    // Agregar parámetros si existen
    Object.entries(params).forEach(([key, value]) => {
      request.input(key, value);
    });

    const result = await request.query(query);
    return result;
  } catch (error) {
    console.error('❌ Error ejecutando query:', error.message);
    throw error;
  }
};

/**
 * Verificar conexión con la base de datos
 * @returns {Promise<boolean>}
 */
const testConnection = async () => {
  try {
    const connection = await getConnection();
    const result = await connection.request().query('SELECT 1 AS test');
    console.log('✅ Test de conexión exitoso');
    return true;
  } catch (error) {
    console.error('❌ Test de conexión fallido:', error.message);
    return false;
  }
};

// ============================================
// EXPORTACIONES
// ============================================

module.exports = {
  sql,
  dbConfig,
  getConnection,
  closeConnection,
  executeQuery,
  testConnection,
};
