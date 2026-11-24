// ==========================================
// DRRACS - Supply Catalog Controller
// (controllers/supply.controller.js)
// ==========================================

const db = require('../config/db');

// 1. GET ALL SUPPLIES: GET /api/supplies
exports.getAllSupplies = async (req, res) => {
  try {
    const { category } = req.query;
    let query = `
      SELECT s.*, 
             COALESCE(SUM(st.Quantity), 0) AS Total_Stock_Available
      FROM Supply s
      LEFT JOIN Stock st ON s.Supply_Id = st.Supply_Id
    `;
    const params = [];

    if (category) {
      query += ' WHERE s.Category = ?';
      params.push(category);
    }

    query += ' GROUP BY s.Supply_Id ORDER BY s.Category ASC, s.Supply_Name ASC';

    const [supplies] = await db.query(query, params);

    res.json({
      success: true,
      count: supplies.length,
      data: supplies
    });
  } catch (error) {
    console.error('Error fetching supplies:', error);
    res.status(500).json({ success: false, message: 'Server error fetching supplies.', error: error.message });
  }
};

// 2. GET SUPPLY DETAILS & STOCK BREAKDOWN: GET /api/supplies/:id
exports.getSupplyById = async (req, res) => {
  try {
    const { id } = req.params;

    const [supplies] = await db.query('SELECT * FROM Supply WHERE Supply_Id = ?', [id]);
    if (supplies.length === 0) {
      return res.status(404).json({ success: false, message: 'Supply item not found.' });
    }

    const supply = supplies[0];

    // Fetch stock breakdown across all warehouses/locations
    const [stocks] = await db.query(
      `SELECT st.Stock_Id, st.Quantity, st.Last_Updated, l.Location_Type, l.Address, l.City, l.State
       FROM Stock st
       JOIN Location l ON st.Location_Id = l.Location_Id
       WHERE st.Supply_Id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...supply,
        warehouseBreakdown: stocks
      }
    });
  } catch (error) {
    console.error('Error fetching supply details:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 3. CREATE NEW SUPPLY ITEM: POST /api/supplies
exports.createSupply = async (req, res) => {
  try {
    const { supplyName, unit, storageRequire, category } = req.body;

    if (!supplyName || !unit || !category) {
      return res.status(400).json({
        success: false,
        message: 'supplyName, unit, and category are required fields.'
      });
    }

    const [result] = await db.query(
      `INSERT INTO Supply (Supply_Name, Unit, Storage_Require, Category)
       VALUES (?, ?, ?, ?)`,
      [supplyName, unit, storageRequire || 'Standard storage', category]
    );

    res.status(201).json({
      success: true,
      message: 'Supply item added to catalog.',
      supplyId: result.insertId
    });
  } catch (error) {
    console.error('Error creating supply:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 4. UPDATE SUPPLY: PUT /api/supplies/:id
exports.updateSupply = async (req, res) => {
  try {
    const { id } = req.params;
    const { supplyName, unit, storageRequire, category } = req.body;

    const [existing] = await db.query('SELECT * FROM Supply WHERE Supply_Id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Supply item not found.' });
    }

    const cur = existing[0];

    await db.query(
      `UPDATE Supply 
       SET Supply_Name = ?, Unit = ?, Storage_Require = ?, Category = ?
       WHERE Supply_Id = ?`,
      [
        supplyName || cur.Supply_Name,
        unit || cur.Unit,
        storageRequire || cur.Storage_Require,
        category || cur.Category,
        id
      ]
    );

    res.json({ success: true, message: 'Supply item updated successfully.' });
  } catch (error) {
    console.error('Error updating supply:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 5. DELETE SUPPLY: DELETE /api/supplies/:id
exports.deleteSupply = async (req, res) => {
  try {
    const { id } = req.params;

    // Safety check: is this supply tied to stock or active requests?
    const [stocks] = await db.query('SELECT COUNT(*) AS count FROM Stock WHERE Supply_Id = ?', [id]);
    const [reqItems] = await db.query('SELECT COUNT(*) AS count FROM Request_Item WHERE Supply_Id = ?', [id]);

    if (stocks[0].count > 0 || reqItems[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: Supply has ${stocks[0].count} warehouse stocks and ${reqItems[0].count} request records associated with it.`
      });
    }

    const [result] = await db.query('DELETE FROM Supply WHERE Supply_Id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Supply item not found.' });
    }

    res.json({ success: true, message: 'Supply item deleted successfully.' });
  } catch (error) {
    console.error('Error deleting supply:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

