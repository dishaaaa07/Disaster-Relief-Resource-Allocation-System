// ==========================================
// DRRACS - Server Entry Point (server.js)
// ==========================================

// 1. Load environment variables from .env file
require('dotenv').config();

// 2. Import necessary packages
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/db'); // MySQL Database Pool

// 3. Initialize the Express application
const app = express();

// 4. Global Middlewares (Helpers that run before reaching routes)
app.use(cors()); // Allow frontend to communicate with backend
app.use(express.json()); // Allow server to understand JSON data sent in request body
app.use(express.urlencoded({ extended: true })); // Allow reading URL-encoded form data

// 5. Serve static frontend files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// 6. API Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/disasters', require('./routes/disaster.routes'));
app.use('/api/locations', require('./routes/location.routes'));
app.use('/api/supplies', require('./routes/supply.routes'));
app.use('/api/shelters', require('./routes/shelter.routes'));
app.use('/api/stock', require('./routes/stock.routes'));
app.use('/api/requests', require('./routes/request.routes'));
app.use('/api/allocations', require('./routes/allocation.routes'));
app.use('/api/shipments', require('./routes/shipment.routes'));
app.use('/api/audit-logs', require('./routes/audit.routes'));

// 7. Test / Health-check route (To verify server is alive)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'DRRACS Disaster Relief Backend is running smoothly!',
    timestamp: new Date().toISOString()
  });
});

app.get(['/', '/login', '/citizen', '/officer', '/shelter', '/commander'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 7. Define the port to listen on (from .env or default to 5000)
const PORT = process.env.PORT || 5000;

// 8. Start the server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 DRRACS Server running on http://localhost:${PORT}`);
  console.log(`📡 Health Check URL: http://localhost:${PORT}/api/health`);
  console.log(`==================================================`);
});

