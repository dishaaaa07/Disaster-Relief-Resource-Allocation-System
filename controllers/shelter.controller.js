// ==========================================
// DRRACS - Shelter Controller
// (controllers/shelter.controller.js)
// ==========================================

const db = require('../config/db');

// 1. GET ALL SHELTERS: GET /api/shelters
exports.getAllShelters = async (req, res) => {
  try {
    const { city, minOccupancy } = req.query;
    let query = `
      SELECT s.Shelter_Id,
             s.Shelter_Name,
             s.Capacity,
             s.Current_Occupancy,
             ROUND((s.Current_Occupancy / s.Capacity) * 100, 1) AS Occupancy_Rate,
             l.Location_Id,
             l.Address,
             l.City,
             l.State,
             l.Latitude,
             l.Longitude,
             l.Affected_Population
      FROM Shelter s
      JOIN Location l ON s.Location_Id = l.Location_Id
      WHERE 1=1
    `;
    const params = [];

    if (city) {
      query += ' AND l.City = ?';
      params.push(city);
    }
    if (minOccupancy) {
      query += ' AND (s.Current_Occupancy / s.Capacity) * 100 >= ?';
      params.push(minOccupancy);
    }

    query += ' ORDER BY Occupancy_Rate DESC';

    const [shelters] = await db.query(query, params);

    res.json({
      success: true,
      count: shelters.length,
      data: shelters
    });
  } catch (error) {
    console.error('Error fetching shelters:', error);
    res.status(500).json({ success: false, message: 'Server error fetching shelters.', error: error.message });
  }
};

// 2. GET SHELTER DETAILS & REQUESTS: GET /api/shelters/:id
exports.getShelterById = async (req, res) => {
  try {
    const { id } = req.params;

    const [shelters] = await db.query(
      `SELECT s.Shelter_Id,
              s.Shelter_Name,
              s.Capacity,
              s.Current_Occupancy,
              ROUND((s.Current_Occupancy / s.Capacity) * 100, 1) AS Occupancy_Rate,
              l.Location_Id,
              l.Address,
              l.City,
              l.State,
              l.Latitude,
              l.Longitude
       FROM Shelter s
       JOIN Location l ON s.Location_Id = l.Location_Id
       WHERE s.Shelter_Id = ?`,
      [id]
    );

    if (shelters.length === 0) {
      return res.status(404).json({ success: false, message: 'Shelter not found.' });
    }

    const shelter = shelters[0];

    // Fetch aid requests submitted by this shelter
    const [requests] = await db.query(
      `SELECT r.Request_Id, r.Request_Date, r.Priority, r.Priority_Score, r.Request_Status,
              d.Name AS Disaster_Name, d.Severity AS Disaster_Severity
       FROM Request r
       JOIN Disaster_Incident d ON r.Incident_Id = d.Incident_Id
       WHERE r.Shelter_Id = ?
       ORDER BY r.Request_Date DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...shelter,
        requests: requests
      }
    });
  } catch (error) {
    console.error('Error fetching shelter details:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 3. CREATE NEW SHELTER: POST /api/shelters
exports.createShelter = async (req, res) => {
  try {
    const { shelterName, capacity, currentOccupancy, locationId } = req.body;

    if (!shelterName || !capacity || !locationId) {
      return res.status(400).json({
        success: false,
        message: 'shelterName, capacity, and locationId are required fields.'
      });
    }

    const occupancy = currentOccupancy || 0;
    if (occupancy > capacity) {
      return res.status(400).json({
        success: false,
        message: 'Current occupancy cannot exceed shelter capacity.'
      });
    }

    const [result] = await db.query(
      `INSERT INTO Shelter (Shelter_Name, Capacity, Current_Occupancy, Location_Id)
       VALUES (?, ?, ?, ?)`,
      [shelterName, capacity, occupancy, locationId]
    );

    res.status(201).json({
      success: true,
      message: 'Shelter registered successfully.',
      shelterId: result.insertId
    });
  } catch (error) {
    console.error('Error creating shelter:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 4. UPDATE SHELTER: PUT /api/shelters/:id
exports.updateShelter = async (req, res) => {
  try {
    const { id } = req.params;
    const { shelterName, capacity, currentOccupancy, locationId } = req.body;

    const [existing] = await db.query('SELECT * FROM Shelter WHERE Shelter_Id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Shelter not found.' });
    }

    const cur = existing[0];
    const newCap = capacity !== undefined ? capacity : cur.Capacity;
    const newOcc = currentOccupancy !== undefined ? currentOccupancy : cur.Current_Occupancy;

    if (newOcc > newCap) {
      return res.status(400).json({
        success: false,
        message: `Current occupancy (${newOcc}) cannot exceed capacity (${newCap}).`
      });
    }

    await db.query(
      `UPDATE Shelter 
       SET Shelter_Name = ?, Capacity = ?, Current_Occupancy = ?, Location_Id = ?
       WHERE Shelter_Id = ?`,
      [
        shelterName || cur.Shelter_Name,
        newCap,
        newOcc,
        locationId || cur.Location_Id,
        id
      ]
    );

    res.json({ success: true, message: 'Shelter updated successfully.' });
  } catch (error) {
    console.error('Error updating shelter:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 5. DELETE SHELTER: DELETE /api/shelters/:id
exports.deleteShelter = async (req, res) => {
  try {
    const { id } = req.params;

    const [requests] = await db.query('SELECT COUNT(*) AS count FROM Request WHERE Shelter_Id = ?', [id]);
    if (requests[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: Shelter has ${requests[0].count} relief requests attached.`
      });
    }

    const [result] = await db.query('DELETE FROM Shelter WHERE Shelter_Id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Shelter not found.' });
    }

    res.json({ success: true, message: 'Shelter deleted successfully.' });
  } catch (error) {
    console.error('Error deleting shelter:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

