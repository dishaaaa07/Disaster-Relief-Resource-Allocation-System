// ==========================================
// DRRACS - Auth Controller (controllers/auth.controller.js)
// Handles Registration, Login, and User Profile
// ==========================================

const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Helper function to generate a JWT token (the "VIP wristband")
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.User_Id,
      email: user.Email,
      role: user.Role,
      name: user.Full_Name,
      phone: user.Phone || null
    },
    process.env.JWT_SECRET || 'fallback_secret_key',
    { expiresIn: '24h' } // Token expires in 24 hours
  );
};

// ----------------------------------------------------
// 1. LOGIN CONTROLLER: POST /api/auth/login
// ----------------------------------------------------
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation: Check if email and password are provided
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.'
      });
    }

    // Step A: Find the user in the database by email
    const [rows] = await db.query(
      'SELECT User_Id, Full_Name, Email, Password_Hash, Role, Phone FROM Users WHERE Email = ?',
      [email]
    );

    // If user does not exist
    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const user = rows[0];

    // Step B: Compare the entered password with the hashed password in the DB
    const isPasswordMatch = await bcrypt.compare(password, user.Password_Hash);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Step C: Credentials are valid! Generate their JWT token
    const token = generateToken(user);

    // Step D: Send success response (never return the Password_Hash!)
    res.json({
      success: true,
      message: `Welcome back, ${user.Full_Name}!`,
      token: token,
      user: {
        userId: user.User_Id,
        name: user.Full_Name,
        email: user.Email,
        role: user.Role,
        phone: user.Phone
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login.',
      error: error.message
    });
  }
};

// ----------------------------------------------------
// 2. REGISTER CONTROLLER: POST /api/auth/register
// ----------------------------------------------------
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required fields.'
      });
    }

    if (role && role !== 'Citizen') {
      return res.status(403).json({
        success: false,
        message: 'Staff roles must be assigned by an administrator.'
      });
    }

    // Step A: Check if email is already registered
    const [existing] = await db.query('SELECT User_Id FROM Users WHERE Email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists.'
      });
    }

    // Step B: Hash the password using bcrypt with salt rounds of 10
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Staff accounts must be provisioned by an administrator, not self-registered.
    const assignedRole = 'Citizen';

    // Step D: Insert user into the Users table
    const [result] = await db.query(
      `INSERT INTO Users (Full_Name, Email, Password_Hash, Role, Phone)
       VALUES (?, ?, ?, ?, ?)`,
      [name, email, passwordHash, assignedRole, phone || null]
    );

    // Step E: Issue token for immediate login
    const newUser = {
      User_Id: result.insertId,
      Full_Name: name,
      Email: email,
      Role: assignedRole,
      Phone: phone || null
    };
    const token = generateToken(newUser);

    res.status(201).json({
      success: true,
      message: 'User registered successfully!',
      token: token,
      user: {
        userId: newUser.User_Id,
        name: newUser.Full_Name,
        email: newUser.Email,
        role: newUser.Role
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration.',
      error: error.message
    });
  }
};

// ----------------------------------------------------
// 3. PROFILE CONTROLLER: GET /api/auth/profile
// ----------------------------------------------------
exports.getProfile = async (req, res) => {
  try {
    // req.user will be populated by our auth middleware
    const [rows] = await db.query(
      'SELECT User_Id, Full_Name, Email, Role, Phone, Created_At FROM Users WHERE User_Id = ?',
      [req.user.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({
      success: true,
      user: rows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

