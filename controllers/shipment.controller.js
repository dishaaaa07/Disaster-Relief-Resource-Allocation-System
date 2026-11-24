// ==========================================
// DRRACS - Shipment & Delivery OTP Controller
// (controllers/shipment.controller.js)
// Handles Transit Logistics & Proof-of-Delivery OTP
// ==========================================

const db = require('../config/db');

// Helper to generate a random 6-digit delivery OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// 1. GET ALL SHIPMENTS: GET /api/shipments
exports.getAllShipments = async (req, res) => {
  try {
    const { status, vehicleNumber } = req.query;

    let query = `
      SELECT sh.Ship_Id,
             sh.Alloc_Id,
             sh.Vehicle_Number,
             sh.Driver_Name,
             sh.Driver_Phone,
             sh.Delivery_OTP,
             sh.Dispatched_Date,
             sh.Expected_Arrival,
             sh.Destination_Date,
             sh.Received_Quantity,
             sh.Shipment_Status,
             a.Allocated_Quantity,
             sup.Supply_Name,
             sup.Unit,
             sup.Category,
             s.Shelter_Name,
             loc_dest.City AS Destination_City,
             loc_dest.Address AS Destination_Address,
             loc_source.City AS Origin_Warehouse_City
      FROM Shipment sh
      JOIN Allocation a ON sh.Alloc_Id = a.Alloc_Id
      JOIN Request_Item ri ON a.Reqitem_Id = ri.Reqitem_Id
      JOIN Supply sup ON ri.Supply_Id = sup.Supply_Id
      JOIN Request r ON ri.Request_Id = r.Request_Id
      JOIN Shelter s ON r.Shelter_Id = s.Shelter_Id
      JOIN Location loc_dest ON s.Location_Id = loc_dest.Location_Id
      JOIN Stock st ON a.Stock_Id = st.Stock_Id
      JOIN Location loc_source ON st.Location_Id = loc_source.Location_Id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND sh.Shipment_Status = ?';
      params.push(status);
    }
    if (vehicleNumber) {
      query += ' AND sh.Vehicle_Number LIKE ?';
      params.push(`%${vehicleNumber}%`);
    }

    query += ' ORDER BY sh.Ship_Id DESC';

    const [shipments] = await db.query(query, params);

    res.json({
      success: true,
      count: shipments.length,
      data: shipments
    });
  } catch (error) {
    console.error('Error fetching shipments:', error);
    res.status(500).json({ success: false, message: 'Server error fetching shipments.', error: error.message });
  }
};

// 2. DISPATCH A SHIPMENT: POST /api/shipments
exports.dispatchShipment = async (req, res) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const { allocId, vehicleNumber, driverName, driverPhone, expectedArrival } = req.body;

    if (!allocId || !vehicleNumber || !driverName) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'allocId, vehicleNumber, and driverName are required fields.'
      });
    }

    // Step A: Check if allocation exists and isn't already dispatched
    const [allocRows] = await connection.query(
      `SELECT a.*, sup.Supply_Name, s.Shelter_Name
       FROM Allocation a
       JOIN Request_Item ri ON a.Reqitem_Id = ri.Reqitem_Id
       JOIN Supply sup ON ri.Supply_Id = sup.Supply_Id
       JOIN Request r ON ri.Request_Id = r.Request_Id
       JOIN Shelter s ON r.Shelter_Id = s.Shelter_Id
       WHERE a.Alloc_Id = ?`,
      [allocId]
    );

    if (allocRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Allocation not found.' });
    }

    const alloc = allocRows[0];

    // Check if already dispatched
    const [existingShipment] = await connection.query(
      'SELECT Ship_Id FROM Shipment WHERE Alloc_Id = ?',
      [allocId]
    );
    if (existingShipment.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Allocation #${allocId} has already been dispatched under Shipment #${existingShipment[0].Ship_Id}.`
      });
    }

    // Step B: Generate secret 6-digit delivery verification OTP
    const deliveryOTP = generateOTP();

    // Step C: Insert shipment row
    const [shipmentResult] = await connection.query(
      `INSERT INTO Shipment (Alloc_Id, Vehicle_Number, Driver_Name, Driver_Phone, Delivery_OTP, Dispatched_Date, Expected_Arrival, Received_Quantity, Shipment_Status)
       VALUES (?, ?, ?, ?, ?, CURDATE(), ?, 0, 'In Transit')`,
      [allocId, vehicleNumber, driverName, driverPhone || 'N/A', deliveryOTP, expectedArrival || null]
    );

    const newShipId = shipmentResult.insertId;

    // Step D: Update Allocation status to 'Dispatched'
    await connection.query('UPDATE Allocation SET Allocation_Status = ? WHERE Alloc_Id = ?', ['Dispatched', allocId]);

    // Step E: Activity Log
    const userId = req.user ? req.user.userId : null;
    await connection.query(
      `INSERT INTO Activity_Log (Action_Type, Description, User_Id) VALUES (?, ?, ?)`,
      [
        'SHIPMENT_DISPATCHED',
        `Dispatched Shipment #${newShipId} (${alloc.Allocated_Quantity} units of ${alloc.Supply_Name}) via Vehicle ${vehicleNumber} to ${alloc.Shelter_Name}. OTP: ${deliveryOTP}`,
        userId
      ]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Shipment dispatched successfully. Secret delivery OTP generated.',
      shipmentId: newShipId,
      vehicleNumber: vehicleNumber,
      deliveryOTP: deliveryOTP,
      status: 'In Transit'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error dispatching shipment:', error);
    res.status(500).json({ success: false, message: 'Server error dispatching shipment.', error: error.message });
  } finally {
    connection.release();
  }
};

// 3. VERIFY DELIVERY VIA SECRET OTP: POST /api/shipments/:id/verify-delivery
exports.verifyDelivery = async (req, res) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const { id } = req.params;
    const { otp, receivedQuantity } = req.body;

    if (!otp) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Please provide the 6-digit Delivery OTP.' });
    }

    // Fetch shipment
    const [shipments] = await connection.query(
      `SELECT sh.*, a.Allocated_Quantity, a.Alloc_Id, sup.Supply_Name, s.Shelter_Name
       FROM Shipment sh
       JOIN Allocation a ON sh.Alloc_Id = a.Alloc_Id
       JOIN Request_Item ri ON a.Reqitem_Id = ri.Reqitem_Id
       JOIN Supply sup ON ri.Supply_Id = sup.Supply_Id
       JOIN Request r ON ri.Request_Id = r.Request_Id
       JOIN Shelter s ON r.Shelter_Id = s.Shelter_Id
       WHERE sh.Ship_Id = ? FOR UPDATE`,
      [id]
    );

    if (shipments.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Shipment not found.' });
    }

    const shipment = shipments[0];

    if (shipment.Shipment_Status === 'Delivered') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'This shipment has already been verified and delivered.' });
    }

    // Cryptographic / string OTP check
    if (shipment.Delivery_OTP.trim() !== otp.toString().trim()) {
      await connection.rollback();
      return res.status(401).json({
        success: false,
        message: 'Invalid OTP! Verification failed. Goods cannot be released without matching OTP.'
      });
    }

    const finalReceivedQty = receivedQuantity !== undefined ? receivedQuantity : shipment.Allocated_Quantity;

    // Step A: Mark Shipment as 'Delivered'
    await connection.query(
      `UPDATE Shipment 
       SET Shipment_Status = 'Delivered', Destination_Date = CURDATE(), Received_Quantity = ?
       WHERE Ship_Id = ?`,
      [finalReceivedQty, id]
    );

    // Step B: Mark Allocation as 'Delivered'
    await connection.query(
      `UPDATE Allocation SET Allocation_Status = 'Delivered' WHERE Alloc_Id = ?`,
      [shipment.Alloc_Id]
    );

    // Step C: Activity Log
    const userId = req.user ? req.user.userId : null;
    await connection.query(
      `INSERT INTO Activity_Log (Action_Type, Description, User_Id) VALUES (?, ?, ?)`,
      [
        'DELIVERY_CONFIRMED',
        `Shipment #${id} verified via OTP and marked DELIVERED at "${shipment.Shelter_Name}" (${finalReceivedQty} units received).`,
        userId
      ]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Proof of Delivery verified! Shipment marked as DELIVERED.',
      shipmentId: id,
      receivedQuantity: finalReceivedQty,
      status: 'Delivered'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error verifying delivery:', error);
    res.status(500).json({ success: false, message: 'Server error during delivery verification.', error: error.message });
  } finally {
    connection.release();
  }
};

