// ==========================================
// DRRACS - Resource Request Controller
// (controllers/request.controller.js)
// Handles Multi-Item Requests & Triage Priority
// ==========================================

const db = require('../config/db');
const { calculatePriorityScore } = require('../services/triageScorer');

// 1. GET ALL REQUESTS (SORTED BY PRIORITY SCORE): GET /api/requests
exports.getAllRequests = async (req, res) => {
  try {
    const { status, priority, incidentId, shelterId } = req.query;

    let query = `
      SELECT r.Request_Id,
             r.Request_Date,
             r.Priority,
             r.Priority_Score,
             r.Request_Status,
             d.Incident_Id,
             d.Name AS Disaster_Name,
             d.Severity AS Disaster_Severity,
             d.Disaster_Type,
             s.Shelter_Id,
             s.Shelter_Name,
             s.Capacity,
             s.Current_Occupancy,
             l.City,
             l.State,
             COUNT(ri.Reqitem_Id) AS Total_Items_Count,
             COALESCE(SUM(ri.Quantity), 0) AS Total_Units_Requested,
             COALESCE(SUM(ri.Allocated_Quantity), 0) AS Total_Units_Allocated
      FROM Request r
      JOIN Disaster_Incident d ON r.Incident_Id = d.Incident_Id
      JOIN Shelter s ON r.Shelter_Id = s.Shelter_Id
      JOIN Location l ON s.Location_Id = l.Location_Id
      LEFT JOIN Request_Item ri ON r.Request_Id = ri.Request_Id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND r.Request_Status = ?';
      params.push(status);
    }
    if (priority) {
      query += ' AND r.Priority = ?';
      params.push(priority);
    }
    if (incidentId) {
      query += ' AND r.Incident_Id = ?';
      params.push(incidentId);
    }
    if (shelterId) {
      query += ' AND r.Shelter_Id = ?';
      params.push(shelterId);
    }

    query += `
      GROUP BY r.Request_Id
      ORDER BY r.Priority_Score DESC, r.Request_Date DESC
    `;

    const [requests] = await db.query(query, params);

    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({ success: false, message: 'Server error fetching requests.', error: error.message });
  }
};

// 2. GET SINGLE REQUEST DETAILS WITH ITEM BREAKDOWN: GET /api/requests/:id
exports.getRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch parent request
    const [requests] = await db.query(
      `SELECT r.*,
              d.Name AS Disaster_Name, d.Severity AS Disaster_Severity, d.Disaster_Type,
              s.Shelter_Name, s.Capacity, s.Current_Occupancy,
              l.Address, l.City, l.State, l.Latitude, l.Longitude
       FROM Request r
       JOIN Disaster_Incident d ON r.Incident_Id = d.Incident_Id
       JOIN Shelter s ON r.Shelter_Id = s.Shelter_Id
       JOIN Location l ON s.Location_Id = l.Location_Id
       WHERE r.Request_Id = ?`,
      [id]
    );

    if (requests.length === 0) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    const request = requests[0];

    // Fetch all requested items
    const [items] = await db.query(
      `SELECT ri.Reqitem_Id,
              ri.Supply_Id,
              ri.Item_Type,
              ri.Quantity,
              ri.Allocated_Quantity,
              (ri.Quantity - ri.Allocated_Quantity) AS Remaining_Needed,
              sup.Supply_Name,
              sup.Unit,
              sup.Category,
              sup.Storage_Require
       FROM Request_Item ri
       JOIN Supply sup ON ri.Supply_Id = sup.Supply_Id
       WHERE ri.Request_Id = ?`,
      [id]
    );

    // Fetch any allocations already dispatched for this request
    const [allocations] = await db.query(
      `SELECT a.Alloc_Id, a.Alloc_Date, a.Allocated_Quantity, a.Allocation_Status,
              u.Full_Name AS Approved_By_Name,
              sup.Supply_Name, sup.Unit,
              loc.City AS Source_Warehouse_City, loc.Address AS Source_Warehouse_Address
       FROM Allocation a
       JOIN Request_Item ri ON a.Reqitem_Id = ri.Reqitem_Id
       JOIN Stock st ON a.Stock_Id = st.Stock_Id
       JOIN Supply sup ON st.Supply_Id = sup.Supply_Id
       JOIN Location loc ON st.Location_Id = loc.Location_Id
       LEFT JOIN Users u ON a.Approved_By = u.User_Id
       WHERE ri.Request_Id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...request,
        items: items,
        allocations: allocations
      }
    });
  } catch (error) {
    console.error('Error fetching request details:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 3. CREATE MULTI-ITEM REQUEST (TRANSACTION): POST /api/requests
exports.createRequest = async (req, res) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const { incidentId, shelterId, priority, items, requestDate } = req.body;

    // Validation
    if (!incidentId || !shelterId || !items || !Array.isArray(items) || items.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'incidentId, shelterId, and a non-empty array of items are required.'
      });
    }

    // Step A: Fetch disaster severity and shelter occupancy to run Triage Algorithm
    const [disasterRows] = await connection.query(
      'SELECT Severity, Name FROM Disaster_Incident WHERE Incident_Id = ?',
      [incidentId]
    );
    if (disasterRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Disaster incident not found.' });
    }

    const [shelterRows] = await connection.query(
      'SELECT Capacity, Current_Occupancy, Shelter_Name FROM Shelter WHERE Shelter_Id = ?',
      [shelterId]
    );
    if (shelterRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Shelter not found.' });
    }

    const disaster = disasterRows[0];
    const shelter = shelterRows[0];
    const urgency = priority || 'Medium';
    const reqDate = requestDate || new Date().toISOString().slice(0, 10);

    // Step B: Calculate automated triage priority score
    const priorityScore = calculatePriorityScore(
      urgency,
      disaster.Severity,
      shelter.Capacity,
      shelter.Current_Occupancy,
      new Date(reqDate)
    );

    // Step C: Insert parent Request row
    const [requestResult] = await connection.query(
      `INSERT INTO Request (Incident_Id, Shelter_Id, Request_Date, Priority, Priority_Score, Request_Status)
       VALUES (?, ?, ?, ?, ?, 'Pending')`,
      [incidentId, shelterId, reqDate, urgency, priorityScore]
    );

    const newRequestId = requestResult.insertId;

    // Step D: Insert all child items in Request_Item
    for (const item of items) {
      if (!item.supplyId || !item.quantity || item.quantity <= 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Each item must have a valid supplyId and a quantity greater than zero.`
        });
      }

      await connection.query(
        `INSERT INTO Request_Item (Request_Id, Supply_Id, Item_Type, Quantity, Allocated_Quantity)
         VALUES (?, ?, ?, ?, 0)`,
        [newRequestId, item.supplyId, item.itemType || 'Relief Supply', item.quantity]
      );
    }

    // Step E: Record into Activity Log
    const userId = req.user ? req.user.userId : null;
    await connection.query(
      `INSERT INTO Activity_Log (Action_Type, Description, User_Id) VALUES (?, ?, ?)`,
      [
        'REQUEST_CREATED',
        `Aid Request #${newRequestId} raised for "${shelter.Shelter_Name}" (${items.length} items, Priority Score: ${priorityScore}).`,
        userId
      ]
    );

    // Step F: All operations succeeded! Commit the transaction
    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Resource request registered successfully.',
      requestId: newRequestId,
      priorityScore: priorityScore,
      itemsCount: items.length
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error in createRequest transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Transaction failed. Request rolled back.',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// 4. UPDATE REQUEST STATUS: PUT /api/requests/:id/status
exports.updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['Pending', 'Approved', 'Partially Fulfilled', 'Fulfilled', 'Rejected'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values: [${allowedStatuses.join(', ')}]`
      });
    }

    await db.query('UPDATE Request SET Request_Status = ? WHERE Request_Id = ?', [status, id]);

    res.json({
      success: true,
      message: `Request #${id} status updated to "${status}".`
    });
  } catch (error) {
    console.error('Error updating request status:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 5. DELETE REQUEST: DELETE /api/requests/:id (Admin only)
exports.deleteRequest = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if any allocations exist
    const [allocs] = await db.query(
      `SELECT COUNT(*) AS count 
       FROM Allocation a
       JOIN Request_Item ri ON a.Reqitem_Id = ri.Reqitem_Id
       WHERE ri.Request_Id = ?`,
      [id]
    );

    if (allocs[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: Request #${id} has ${allocs[0].count} allocation records linked to it.`
      });
    }

    // Cascade deletes request_items automatically
    const [result] = await db.query('DELETE FROM Request WHERE Request_Id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    res.json({ success: true, message: `Request #${id} and its items removed successfully.` });
  } catch (error) {
    console.error('Error deleting request:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

