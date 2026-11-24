// ==========================================
// DRRACS - Stock Inventory Controller
// (controllers/stock.controller.js)
// ==========================================

const db = require('../config/db');

// 1. GET ALL STOCK INVENTORY: GET /api/stock
exports.getAllStock = async (req, res) => {
  try {
    const { locationId, category, lowStock } = req.query;
    let query = `
      SELECT st.Stock_Id,
             st.Quantity,
             st.Last_Updated,
             sup.Supply_Id,
             sup.Supply_Name,
             sup.Unit,
             sup.Category,
             sup.Storage_Require,
             l.Location_Id,
             l.Address,
             l.City,
             l.State,
             l.Location_Type,
             CASE 
               WHEN st.Quantity < 50 THEN 'CRITICAL_LOW'
               WHEN st.Quantity < 150 THEN 'LOW'
               ELSE 'HEALTHY'
             END AS Stock_Status
      FROM Stock st
      JOIN Supply sup ON st.Supply_Id = sup.Supply_Id
      JOIN Location l ON st.Location_Id = l.Location_Id
      WHERE 1=1
    `;
    const params = [];

    if (locationId) {
      query += ' AND st.Location_Id = ?';
      params.push(locationId);
    }
    if (category) {
      query += ' AND sup.Category = ?';
      params.push(category);
    }
    if (lowStock === 'true') {
      query += ' AND st.Quantity < 150';
    }

    query += ' ORDER BY st.Quantity ASC, l.City ASC';

    const [stocks] = await db.query(query, params);

    res.json({
      success: true,
      count: stocks.length,
      data: stocks
    });
  } catch (error) {
    console.error('Error fetching stock inventory:', error);
    res.status(500).json({ success: false, message: 'Server error fetching stock.', error: error.message });
  }
};

// 2. GET SINGLE STOCK ITEM DETAILS: GET /api/stock/:id
exports.getStockById = async (req, res) => {
  try {
    const { id } = req.params;

    const [stocks] = await db.query(
      `SELECT st.Stock_Id,
              st.Quantity,
              st.Last_Updated,
              sup.Supply_Id,
              sup.Supply_Name,
              sup.Unit,
              sup.Category,
              l.Location_Id,
              l.Address,
              l.City,
              l.State,
              l.Location_Type
       FROM Stock st
       JOIN Supply sup ON st.Supply_Id = sup.Supply_Id
       JOIN Location l ON st.Location_Id = l.Location_Id
       WHERE st.Stock_Id = ?`,
      [id]
    );

    if (stocks.length === 0) {
      return res.status(404).json({ success: false, message: 'Stock record not found.' });
    }

    const stock = stocks[0];

    // Fetch allocations sourced from this stock
    const [allocations] = await db.query(
      `SELECT a.Alloc_Id, a.Alloc_Date, a.Allocated_Quantity, a.Allocation_Status,
              u.Full_Name AS Approved_By_Name,
              r.Request_Id, s.Shelter_Name
       FROM Allocation a
       LEFT JOIN Users u ON a.Approved_By = u.User_Id
       JOIN Request_Item ri ON a.Reqitem_Id = ri.Reqitem_Id
       JOIN Request r ON ri.Request_Id = r.Request_Id
       JOIN Shelter s ON r.Shelter_Id = s.Shelter_Id
       WHERE a.Stock_Id = ?
       ORDER BY a.Alloc_Date DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...stock,
        recentAllocations: allocations
      }
    });
  } catch (error) {
    console.error('Error fetching stock record:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 3. RECEIVE / INTAKE STOCK (UPSERT): POST /api/stock
exports.receiveStock = async (req, res) => {
  try {
    const { supplyId, locationId, quantity } = req.body;

    if (!supplyId || !locationId || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'supplyId, locationId, and quantity are required fields.'
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity received must be greater than zero.'
      });
    }

    // Upsert query: insert if not present, increment quantity if already present
    const [result] = await db.query(
      `INSERT INTO Stock (Supply_Id, Location_Id, Quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         Quantity = Quantity + VALUES(Quantity),
         Last_Updated = CURRENT_TIMESTAMP`,
      [supplyId, locationId, quantity]
    );

    // Record into audit log
    if (req.user) {
      await db.query(
        `INSERT INTO Activity_Log (Action_Type, Description, User_Id) VALUES (?, ?, ?)`,
        ['STOCK_RECEIVED', `Received +${quantity} units of Supply #${supplyId} at Location #${locationId}.`, req.user.userId]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Stock received and inventory updated successfully.',
      affectedRows: result.affectedRows
    });
  } catch (error) {
    console.error('Error receiving stock:', error);
    res.status(500).json({ success: false, message: 'Server error receiving stock.', error: error.message });
  }
};

// 4. MANUAL STOCK ADJUSTMENT (AUDIT): PUT /api/stock/:id
exports.adjustStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { newQuantity, reason } = req.body;

    if (newQuantity === undefined || newQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid non-negative newQuantity is required.'
      });
    }

    const [existing] = await db.query('SELECT Quantity, Supply_Id, Location_Id FROM Stock WHERE Stock_Id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Stock record not found.' });
    }

    const previousQty = existing[0].Quantity;

    await db.query(
      'UPDATE Stock SET Quantity = ?, Last_Updated = CURRENT_TIMESTAMP WHERE Stock_Id = ?',
      [newQuantity, id]
    );

    // Audit log for accountability
    if (req.user) {
      await db.query(
        `INSERT INTO Activity_Log (Action_Type, Description, User_Id) VALUES (?, ?, ?)`,
        [
          'STOCK_ADJUSTED',
          `Stock #${id} adjusted from ${previousQty} to ${newQuantity}. Reason: ${reason || 'Physical inventory audit'}.`,
          req.user.userId
        ]
      );
    }

    res.json({
      success: true,
      message: 'Stock quantity adjusted successfully.',
      previousQuantity: previousQty,
      newQuantity: newQuantity
    });
  } catch (error) {
    console.error('Error adjusting stock:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 5. DELETE EMPTY STOCK RECORD: DELETE /api/stock/:id (Admin only)
exports.deleteStock = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if there are past allocations referencing this stock record
    const [allocs] = await db.query('SELECT COUNT(*) AS count FROM Allocation WHERE Stock_Id = ?', [id]);
    if (allocs[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: Stock record #${id} has ${allocs[0].count} historical allocation records linked to it.`
      });
    }

    const [result] = await db.query('DELETE FROM Stock WHERE Stock_Id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Stock record not found.' });
    }

    res.json({ success: true, message: 'Stock record removed.' });
  } catch (error) {
    console.error('Error deleting stock:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

