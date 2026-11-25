// ==========================================
// DRRACS - Database Initialization Script
// (database/init.js)
// ==========================================

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function initializeDatabase() {
  console.log('🔄 Initializing DRRACS Disaster Relief Database...');

  // Step 1: Connect to MySQL Server (supports local and cloud instances)
  let connection;
  try {
    const sslOption = process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : undefined;

    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
      multipleStatements: true, // Allows executing the entire schema file with multiple SQL statements
      ssl: sslOption
    });

    console.log('✅ Connected to MySQL server successfully.');

    // Step 2: Read the SQL schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    console.log(`📖 Reading SQL schema from: ${schemaPath}`);
    const sqlScript = fs.readFileSync(schemaPath, 'utf8');

    // Step 3: Execute the SQL script
    console.log('⚡ Executing schema.sql (creating database, tables, and seed records)...');
    await connection.query(sqlScript);

    // Step 4: Ensure seed user passwords are cryptographically hashed for 'admin123'
    console.log('🔒 Encrypting seed user passwords (admin123) with bcrypt...');
    const seedHash = await bcrypt.hash('admin123', 10);
    await connection.query(
      `UPDATE disaster_relief_db.Users 
       SET Password_Hash = ? 
       WHERE Email IN ('admin@drracs.org', 'officer@drracs.org', 'shelter@drracs.org', 'citizen@drracs.org')`,
      [seedHash]
    );

    console.log('===========================================================');
    console.log('🎉 SUCCESS! Database "disaster_relief_db" is fully set up!');
    console.log('📊 Tables created:');
    console.log('   - Users (Admins, Relief Officers, Shelter Leads)');
    console.log('   - Disaster_Incident');
    console.log('   - Location');
    console.log('   - Supply');
    console.log('   - Shelter');
    console.log('   - Request & Request_Item');
    console.log('   - Stock');
    console.log('   - Allocation');
    console.log('   - Shipment');
    console.log('   - Activity_Log');
    console.log('🌱 Sample demonstration data seeded for Gwalior, Sehore & Indore!');
    console.log('===========================================================');

  } catch (error) {
    console.error('❌ Failed to initialize database:');
    console.error('   Error Code:', error.code);
    console.error('   Error Message:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n👉 Hint: Double-check your MySQL root password in the .env file.');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n👉 Hint: MySQL Server is not running. Please start the MySQL service in Windows Services.');
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initializeDatabase();

