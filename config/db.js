// ==========================================
// DRRACS - Database Connection Pool (config/db.js)
// ==========================================

const mysql = require('mysql2/promise');
require('dotenv').config();

// Create a connection pool to disaster_relief_db
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'disaster_relief_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true
});

// Self-test database connectivity
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(`✅ Successfully connected to MySQL Database: "${process.env.DB_NAME || 'disaster_relief_db'}"`);
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('👉 Make sure MySQL is running and your .env credentials (user/password) are correct.');
  }
}

testConnection();

module.exports = pool;

