// ==========================================
// DRRACS - Allocation Engine Controller
// (controllers/allocation.controller.js)
// Handles Full & Partial Allocations with Row Locking
// ==========================================

const db = require('../config/db');

// 1. GET ALL ALLOCATIONS: GET /api/allocations
exports.getAllAllocations = async (req, res) => {
  try {
    const { status, shelterId } = req.query;

    let query = `
      SELECT a.Alloc_Id,
             a.Alloc_Date,
             a.Allocated_Quantity,
             a.Allocation_Status,
             u.Full_Name AS Approved_By_Name,
             ri.Reqitem_Id,
             ri.Item_Type,
             ri.Quantity AS Total_Requested_Qty,
             sup.Supply_Name,
             sup.Unit,
             sup.Category,
             r.Request_Id,
             r.Priority,
             s.Shelter_Name,
             loc_shelter.City AS Shelter_City,
             loc_source.City AS Source_Warehouse_City,
             loc_source.Address AS Source_Warehouse_Address,
             sh.Ship_Id,
             sh.Shipment_Status,
             sh.Vehicle_Number
      FROM Allocation a
      JOIN Request_Item ri ON a.Reqitem_Id = ri.Reqitem_Id
      JOIN Request r ON ri.Request_Id = r.Request_Id
      JOIN Shelter s ON r.Shelter_Id = s.Shelter_Id
      JOIN Location loc_shelter ON s.Location_Id = loc_shelter.Location_Id
      JOIN Stock st ON a.Stock_Id = st.Stock_Id
      JOIN Supply sup ON st.Supply_Id = sup.Supply_Id
      JOIN Location loc_source ON st.Location_Id = loc_source.Location_Id
      LEFT JOIN Users u ON a.Approved_By = u.User_Id
      LEFT JOIN Shipment sh ON a.Alloc_Id = sh.Alloc_Id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND a.Allocation_Status = ?';
      params.push(status);
    }
    if (shelterId) {
      query += ' AND s.Shelter_Id = ?';
      params.push(shelterId);
    }

    query += ' ORDER BY a.Alloc_Date DESC, a.Alloc_Id DESC';

    const [allocations] = await db.query(query, params);

    res.json({
      success: true,
      count: allocations.length,
      data: allocations
    });
  } catch (error) {
    console.error('Error fetching allocations:', error);
    res.status(500).json({ success: false, message: 'Server error fetching allocations.', error: error.message });
  }
};

// 2. EXECUTE SMART ALLOCATION (TRANSACTION WITH ROW LOCK): POST /api/allocations
exports.createAllocation = async (req, res) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const { reqitemId, stockId, quantityToAllocate } = req.body;
    const approverUserId = req.user ? req.user.userId : 1; // Default to admin if unauthenticated

    if (!reqitemId || !stockId) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'reqitemId and stockId are required fields.'
      });
    }

    // Step A: Lock and fetch the Request_Item row
    const [reqItemRows] = await connection.query(
      `SELECT ri.*, r.Request_Id, r.Request_Status, s.Shelter_Name, sup.Supply_Name
       FROM Request_Item ri
       JOIN Request r ON ri.Request_Id = r.Request_Id
       JOIN Shelter s ON r.Shelter_Id = s.Shelter_Id
       JOIN Supply sup ON ri.Supply_Id = sup.Supply_Id
       WHERE ri.Reqitem_Id = ? FOR UPDATE`,
      [reqitemId]
    );

    if (reqItemRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Request item not found.' });
    }

    const reqItem = reqItemRows[0];
    const remainingNeeded = reqItem.Quantity - reqItem.Allocated_Quantity;

    if (remainingNeeded <= 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `This item is already 100% fulfilled (${reqItem.Quantity} / ${reqItem.Quantity}).`
      });
    }

    // Step B: Lock and fetch warehouse Stock row
    const [stockRows] = await connection.query(
      `SELECT st.Stock_Id, st.Quantity, st.Supply_Id, loc.City, loc.Address
       FROM Stock st
       JOIN Location loc ON st.Location_Id = loc.Location_Id
       WHERE st.Stock_Id = ? FOR UPDATE`,
      [stockId]
    );

    if (stockRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Warehouse stock record not found.' });
    }

    const stock = stockRows[0];

    // Verify supply match
    if (stock.Supply_Id !== reqItem.Supply_Id) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Mismatch: This stock record stores a different supply commodity.'
      });
    }

    if (stock.Quantity <= 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Warehouse stock is currently zero for this item.'
      });
    }

    // Step C: Determine quantity to allocate (Full or Partial)
    // If user specified an explicit quantity, use it (capped by available stock & needed qty)
    let finalAllocQty = remainingNeeded;
    if (quantityToAllocate && quantityToAllocate > 0) {
      finalAllocQty = Math.min(quantityToAllocate, remainingNeeded);
    }
    finalAllocQty = Math.min(finalAllocQty, stock.Quantity);

    if (finalAllocQty <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Allocation quantity must be greater than zero.' });
    }

    const isPartial = finalAllocQty < remainingNeeded;

    // Step D: Deduct from warehouse stock
    await connection.query(
      'UPDATE Stock SET Quantity = Quantity - ?, Last_Updated = CURRENT_TIMESTAMP WHERE Stock_Id = ?',
      [finalAllocQty, stockId]
    );

    // Step E: Update Request_Item allocated quantity
    await connection.query(
      'UPDATE Request_Item SET Allocated_Quantity = Allocated_Quantity + ? WHERE Reqitem_Id = ?',
      [finalAllocQty, reqitemId]
    );

    // Step F: Insert Allocation record
    const [allocResult] = await connection.query(
      `INSERT INTO Allocation (Reqitem_Id, Stock_Id, Alloc_Date, Allocated_Quantity, Approved_By, Allocation_Status)
       VALUES (?, ?, CURDATE(), ?, ?, 'Approved')`,
      [reqitemId, stockId, finalAllocQty, approverUserId]
    );

    const newAllocId = allocResult.insertId;

    // Step G: Check and update parent Request overall status
    const [siblingItems] = await connection.query(
      'SELECT Quantity, Allocated_Quantity FROM Request_Item WHERE Request_Id = ?',
      [reqItem.Request_Id]
    );

    let allFullyFulfilled = true;
    let anyAllocated = false;

    for (const item of siblingItems) {
      if (item.Allocated_Quantity > 0) anyAllocated = true;
      if (item.Allocated_Quantity < item.Quantity) allFullyFulfilled = false;
    }

    const newReqStatus = allFullyFulfilled
      ? 'Fulfilled'
      : (anyAllocated ? 'Partially Fulfilled' : 'Pending');

    await connection.query(
      'UPDATE Request SET Request_Status = ? WHERE Request_Id = ?',
      [newReqStatus, reqItem.Request_Id]
    );

    // Step H: Activity Log
    await connection.query(
      `INSERT INTO Activity_Log (Action_Type, Description, User_Id) VALUES (?, ?, ?)`,
      [
        'ALLOCATION_APPROVED',
        `Allocated ${finalAllocQty} units of ${reqItem.Supply_Name} from ${stock.City} Depot for ${reqItem.Shelter_Name} (Status: ${newReqStatus}).`,
        approverUserId
      ]
    );

    // Step I: Commit transaction!
    await connection.commit();

    res.status(201).json({
      success: true,
      message: isPartial
        ? `Partial allocation successful: ${finalAllocQty} units allocated (${remainingNeeded - finalAllocQty} units still needed).`
        : `Full allocation successful: ${finalAllocQty} units allocated.`,
      allocationId: newAllocId,
      allocatedQuantity: finalAllocQty,
      remainingNeededForItem: remainingNeeded - finalAllocQty,
      requestStatus: newReqStatus
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error in createAllocation transaction:', error);
    res.status(500).json({ success: false, message: 'Allocation transaction failed.', error: error.message });
  } finally {
    connection.release();
  }
};

