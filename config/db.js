// ==========================================
// DRRACS - Database Connection Pool (config/db.js)
// Supports local MySQL & Cloud MySQL (Aiven, TiDB, Railway, etc.)
// ==========================================

const mysql = require('mysql2/promise');
require('dotenv').config();

// SSL configuration for hosted cloud databases
let sslConfig = undefined;
if (process.env.DB_SSL === 'true') {
  sslConfig = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  };
}

// Create connection pool with serverless-friendly limits
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'disaster_relief_db',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  waitForConnections: true,
  connectionLimit: process.env.DB_CONNECTION_LIMIT ? parseInt(process.env.DB_CONNECTION_LIMIT, 10) : 5,
  queueLimit: 0,
  decimalNumbers: true,
  ssl: sslConfig
});

// Self-test database connectivity
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(`✅ Successfully connected to MySQL Database: "${process.env.DB_NAME || 'disaster_relief_db'}"`);
    connection.release();
  } catch (error) {
    console.error('⚠️ Database connection check:', error.message);
    console.error('👉 If running locally, check MySQL service. If on Vercel, verify your cloud DB environment variables.');
  }
}

// Run connectivity check in development mode or when explicitly tested
if (process.env.NODE_ENV !== 'production' || process.env.TEST_DB === 'true') {
  testConnection();
}

module.exports = pool;
