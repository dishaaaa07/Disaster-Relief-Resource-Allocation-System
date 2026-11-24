// ==========================================
// DRRACS - Location Controller
// (controllers/location.controller.js)
// ==========================================

const db = require('../config/db');

// 1. GET ALL LOCATIONS: GET /api/locations
exports.getAllLocations = async (req, res) => {
  try {
    const { type, city, verificationStatus } = req.query;
    let query = 'SELECT * FROM Location WHERE 1=1';
    const params = [];

    // Optional query filters: ?type=Warehouse/Depot or ?verificationStatus=Verified
    if (type) {
      query += ' AND Location_Type = ?';
      params.push(type);
    }
    if (city) {
      query += ' AND City = ?';
      params.push(city);
    }
    if (verificationStatus) {
      query += ' AND Verification_Status = ?';
      params.push(verificationStatus);
    }

    query += ' ORDER BY City ASC, Location_Id ASC';

    const [locations] = await db.query(query, params);

    res.json({
      success: true,
      count: locations.length,
      data: locations
    });
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ success: false, message: 'Server error fetching locations.', error: error.message });
  }
};

// 2. GET LOCATION BY ID: GET /api/locations/:id
exports.getLocationById = async (req, res) => {
  try {
    const { id } = req.params;

    const [locations] = await db.query('SELECT * FROM Location WHERE Location_Id = ?', [id]);
    if (locations.length === 0) {
      return res.status(404).json({ success: false, message: 'Location not found.' });
    }

    const location = locations[0];

    // Fetch any shelters stationed at this location
    const [shelters] = await db.query(
      'SELECT Shelter_Id, Shelter_Name, Capacity, Current_Occupancy FROM Shelter WHERE Location_Id = ?',
      [id]
    );

    // Fetch any stock / inventory stored at this location
    const [stock] = await db.query(
      `SELECT s.Stock_Id, s.Quantity, s.Last_Updated, sup.Supply_Name, sup.Category, sup.Unit
       FROM Stock s
       JOIN Supply sup ON s.Supply_Id = sup.Supply_Id
       WHERE s.Location_Id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...location,
        shelters: shelters,
        inventory: stock
      }
    });
  } catch (error) {
    console.error('Error fetching location details:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 3. CREATE NEW LOCATION: POST /api/locations
exports.createLocation = async (req, res) => {
  try {
    const { address, city, state, locationType, latitude, longitude, affectedPopulation, verificationStatus } = req.body;

    if (!address || !city || !state) {
      return res.status(400).json({
        success: false,
        message: 'Address, city, and state are required fields.'
      });
    }

    const [result] = await db.query(
      `INSERT INTO Location (Address, City, State, Location_Type, Latitude, Longitude, Affected_Population, Verification_Status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        address,
        city,
        state,
        locationType || 'Affected Area',
        latitude || 26.2183,
        longitude || 78.1828,
        affectedPopulation || 0,
        verificationStatus || 'Pending'
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Location registered successfully.',
      locationId: result.insertId
    });
  } catch (error) {
    console.error('Error creating location:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 4. UPDATE LOCATION: PUT /api/locations/:id
exports.updateLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { address, city, state, locationType, latitude, longitude, affectedPopulation, verificationStatus } = req.body;

    const [existing] = await db.query('SELECT * FROM Location WHERE Location_Id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Location not found.' });
    }

    const curr = existing[0];

    await db.query(
      `UPDATE Location 
       SET Address = ?, City = ?, State = ?, Location_Type = ?, Latitude = ?, Longitude = ?,
           Affected_Population = ?, Verification_Status = ?
       WHERE Location_Id = ?`,
      [
        address || curr.Address,
        city || curr.City,
        state || curr.State,
        locationType || curr.Location_Type,
        latitude !== undefined ? latitude : curr.Latitude,
        longitude !== undefined ? longitude : curr.Longitude,
        affectedPopulation !== undefined ? affectedPopulation : curr.Affected_Population,
        verificationStatus || curr.Verification_Status,
        id
      ]
    );

    res.json({
      success: true,
      message: 'Location updated successfully.'
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 5. DELETE LOCATION: DELETE /api/locations/:id (Admin only)
exports.deleteLocation = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if shelters or stock exist here before deleting
    const [shelters] = await db.query('SELECT COUNT(*) AS count FROM Shelter WHERE Location_Id = ?', [id]);
    const [stock] = await db.query('SELECT COUNT(*) AS count FROM Stock WHERE Location_Id = ?', [id]);

    if (shelters[0].count > 0 || stock[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: Location has ${shelters[0].count} shelters and ${stock[0].count} stock records assigned to it.`
      });
    }

    const [result] = await db.query('DELETE FROM Location WHERE Location_Id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Location not found.' });
    }

    res.json({ success: true, message: 'Location deleted successfully.' });
  } catch (error) {
    console.error('Error deleting location:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

