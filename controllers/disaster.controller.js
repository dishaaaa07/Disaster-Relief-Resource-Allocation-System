// ==========================================
// DRRACS - Disaster Incident Controller
// (controllers/disaster.controller.js)
// ==========================================

const db = require('../config/db');

// 1. GET ALL DISASTERS: GET /api/disasters
exports.getAllDisasters = async (req, res) => {
  try {
    const { status, severity } = req.query;
    let query = 'SELECT * FROM Disaster_Incident WHERE 1=1';
    const params = [];

    // Optional filters: ?status=Active or ?severity=High
    if (status) {
      query += ' AND Status = ?';
      params.push(status);
    }
    if (severity) {
      query += ' AND Severity = ?';
      params.push(severity);
    }

    query += ' ORDER BY Start_Date DESC';

    const [disasters] = await db.query(query, params);

    res.json({
      success: true,
      count: disasters.length,
      data: disasters
    });
  } catch (error) {
    console.error('Error fetching disasters:', error);
    res.status(500).json({ success: false, message: 'Server error fetching disasters.', error: error.message });
  }
};

// 2. GET SINGLE DISASTER DETAILS: GET /api/disasters/:id
exports.getDisasterById = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the incident
    const [disasters] = await db.query('SELECT * FROM Disaster_Incident WHERE Incident_Id = ?', [id]);

    if (disasters.length === 0) {
      return res.status(404).json({ success: false, message: 'Disaster incident not found.' });
    }

    const disaster = disasters[0];

    // Also fetch all aid requests tied to this disaster
    const [requests] = await db.query(
      `SELECT r.Request_Id, r.Request_Date, r.Priority, r.Priority_Score, r.Request_Status,
              s.Shelter_Name, l.City, l.State
       FROM Request r
       JOIN Shelter s ON r.Shelter_Id = s.Shelter_Id
       JOIN Location l ON s.Location_Id = l.Location_Id
       WHERE r.Incident_Id = ?
       ORDER BY r.Priority_Score DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...disaster,
        requests: requests
      }
    });
  } catch (error) {
    console.error('Error fetching disaster details:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 3. CREATE NEW DISASTER: POST /api/disasters (Admin only)
exports.createDisaster = async (req, res) => {
  try {
    const { name, disasterType, startDate, severity, status } = req.body;

    if (!name || !disasterType || !startDate) {
      return res.status(400).json({
        success: false,
        message: 'Name, disasterType, and startDate are required fields.'
      });
    }

    const [result] = await db.query(
      `INSERT INTO Disaster_Incident (Name, Disaster_Type, Start_Date, Severity, Status)
       VALUES (?, ?, ?, ?, ?)`,
      [
        name,
        disasterType,
        startDate,
        severity || 'Medium',
        status || 'Active'
      ]
    );

    // Also record into Activity_Log
    if (req.user) {
      await db.query(
        `INSERT INTO Activity_Log (Action_Type, Description, User_Id) VALUES (?, ?, ?)`,
        ['DISASTER_DECLARED', `New incident declared: "${name}" (${disasterType})`, req.user.userId]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Disaster incident registered successfully.',
      incidentId: result.insertId
    });
  } catch (error) {
    console.error('Error creating disaster:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 4. UPDATE DISASTER: PUT /api/disasters/:id
exports.updateDisaster = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, disasterType, severity, status } = req.body;

    const [existing] = await db.query('SELECT * FROM Disaster_Incident WHERE Incident_Id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Disaster incident not found.' });
    }

    const current = existing[0];

    await db.query(
      `UPDATE Disaster_Incident 
       SET Name = ?, Disaster_Type = ?, Severity = ?, Status = ?
       WHERE Incident_Id = ?`,
      [
        name || current.Name,
        disasterType || current.Disaster_Type,
        severity || current.Severity,
        status || current.Status,
        id
      ]
    );

    res.json({
      success: true,
      message: 'Disaster incident updated successfully.'
    });
  } catch (error) {
    console.error('Error updating disaster:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 5. DELETE DISASTER: DELETE /api/disasters/:id (Admin only)
exports.deleteDisaster = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if there are active requests attached before deleting
    const [requests] = await db.query('SELECT COUNT(*) AS count FROM Request WHERE Incident_Id = ?', [id]);
    if (requests[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: Disaster has ${requests[0].count} relief requests attached. Mark status as 'Resolved' instead.`
      });
    }

    const [result] = await db.query('DELETE FROM Disaster_Incident WHERE Incident_Id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Disaster incident not found.' });
    }

    res.json({ success: true, message: 'Disaster incident removed successfully.' });
  } catch (error) {
    console.error('Error deleting disaster:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

// 6. CITIZEN EMERGENCY SOS REPORT: POST /api/disasters/citizen-report (Citizen role)
exports.reportFromCitizen = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const {
      disasterType,
      title,
      description,
      severity = 'High',
      address,
      city = 'Gwalior',
      state = 'Madhya Pradesh',
      latitude,
      longitude,
      affectedPeople = 5,
      requiredSupplies = []
    } = req.body;
    const reporterName = req.user.name;
    const reporterPhone = req.user.phone || '';

    if (!disasterType || !address) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Disaster incident type and address / landmark are required for emergency distress reporting.'
      });
    }

    // A. Create Location entity for this ground incident
    const lat = latitude ? parseFloat(latitude) : (26.2234 + (Math.random() - 0.5) * 0.05);
    const lng = longitude ? parseFloat(longitude) : (78.2270 + (Math.random() - 0.5) * 0.05);
    const affectedCount = parseInt(affectedPeople, 10) || 5;

    const [locResult] = await connection.query(
      `INSERT INTO Location (Address, City, State, Location_Type, Latitude, Longitude, Affected_Population, Verification_Status)
       VALUES (?, ?, ?, 'Affected Area', ?, ?, ?, 'Pending')`,
      [address, city, state, lat, lng, affectedCount]
    );
    const locationId = locResult.insertId;

    // B. Register the Disaster_Incident
    const incidentName = title ? `[SOS] ${title}` : `[SOS Citizen Alert] ${disasterType} at ${address}`;
    const today = new Date().toISOString().split('T')[0];

    const [incidentResult] = await connection.query(
      `INSERT INTO Disaster_Incident (Disaster_Type, Name, Start_Date, Severity, Status)
       VALUES (?, ?, ?, ?, 'Active')`,
      [disasterType, incidentName, today, severity]
    );
    const incidentId = incidentResult.insertId;

    // C. Link to nearest / default Shelter
    const [shelters] = await connection.query(
      `SELECT s.Shelter_Id 
       FROM Shelter s 
       JOIN Location l ON s.Location_Id = l.Location_Id 
       WHERE l.City = ? 
       LIMIT 1`,
      [city]
    );
    let shelterId = shelters.length > 0 ? shelters[0].Shelter_Id : 1;

    // D. Multi-factor Emergency Priority Calculation (Score 75.00 to 98.50)
    let priorityScore = 75.0;
    if (severity === 'Critical') priorityScore = 95.0;
    else if (severity === 'High') priorityScore = 86.5;
    else if (severity === 'Medium') priorityScore = 72.0;
    else priorityScore = 58.0;

    if (affectedCount >= 20) priorityScore = Math.min(99.0, priorityScore + 4.0);
    else if (affectedCount >= 10) priorityScore = Math.min(99.0, priorityScore + 2.5);

    // E. Create Emergency Aid Requisition
    const [reqResult] = await connection.query(
      `INSERT INTO Request (Incident_Id, Shelter_Id, Request_Date, Priority, Priority_Score, Request_Status)
       VALUES (?, ?, ?, 'Urgent', ?, 'Pending')`,
      [incidentId, shelterId, today, priorityScore]
    );
    const requestId = reqResult.insertId;

    // F. Attach requested emergency supply line-items
    let supplyIds = Array.isArray(requiredSupplies) && requiredSupplies.length > 0 
      ? requiredSupplies.map(id => parseInt(id, 10)) 
      : [1, 2]; // Default to Water and Food

    for (const supId of supplyIds) {
      const [supRows] = await connection.query('SELECT Supply_Name FROM Supply WHERE Supply_Id = ?', [supId]);
      const supName = supRows.length > 0 ? supRows[0].Supply_Name : 'Emergency Relief Aid';
      const quantity = Math.max(15, affectedCount * 2);
      await connection.query(
        `INSERT INTO Request_Item (Request_Id, Supply_Id, Item_Type, Quantity, Allocated_Quantity)
         VALUES (?, ?, ?, ?, 0)`,
        [requestId, supId, supName, quantity]
      );
    }

    // G. Audit Trail Logging in Activity_Log
    const ticketNumber = `SOS-2026-${String(incidentId).padStart(4, '0')}`;
    const logDesc = `🚨 CITIZEN SOS SIGNAL [#${ticketNumber}]: Distress call lodged by ${reporterName} (${reporterPhone || 'No phone'}) for ${disasterType} at ${address}, ${city}. ${affectedCount} lives affected. Priority ${priorityScore}. Immediate dispatch alert triggered.`;
    await connection.query(
      `INSERT INTO Activity_Log (Action_Type, Description, User_Id) VALUES ('CITIZEN_SOS', ?, ?)`,
      [logDesc, req.user.userId]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Citizen emergency distress signal registered and broadcast to Central Operations Command.',
      ticketNumber: ticketNumber,
      incidentId: incidentId,
      locationId: locationId,
      requestId: requestId,
      data: {
        ticketNumber,
        incidentName,
        disasterType,
        severity,
        address,
        city,
        state,
        latitude: lat,
        longitude: lng,
        affectedCount,
        priorityScore,
        reporterName,
        reporterPhone,
        description: description || ''
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error in citizen distress report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record emergency citizen report.',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// 7. TRACK CITIZEN SOS REPORT: GET /api/disasters/track/:ticket (Authenticated)
exports.trackCitizenReport = async (req, res) => {
  try {
    const { ticket } = req.params;
    if (!ticket) {
      return res.status(400).json({ success: false, message: 'Ticket number or identifier is required.' });
    }

    // Ticket format can be "SOS-2026-0001", a numeric ID, or text search
    let incidentId = null;
    const match = ticket.match(/SOS-\d{4}-(\d+)/i);
    if (match) {
      incidentId = parseInt(match[1], 10);
    } else if (/^\d+$/.test(ticket.trim())) {
      incidentId = parseInt(ticket.trim(), 10);
    }

    let incidentRows = [];
    if (incidentId) {
      const [rows] = await db.query(
        'SELECT * FROM Disaster_Incident WHERE Incident_Id = ?',
        [incidentId]
      );
      incidentRows = rows;
    }

    if (incidentRows.length === 0) {
      // Search by partial Name or Type
      const [rows] = await db.query(
        'SELECT * FROM Disaster_Incident WHERE Name LIKE ? OR Disaster_Type LIKE ? ORDER BY Incident_Id DESC LIMIT 1',
        [`%${ticket}%`, `%${ticket}%`]
      );
      incidentRows = rows;
    }

    if (incidentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No active disaster report found matching reference "${ticket}". Please check the Ticket ID and retry.`
      });
    }

    const incident = incidentRows[0];
    const realId = incident.Incident_Id;
    const formattedTicket = `SOS-2026-${String(realId).padStart(4, '0')}`;

    // Associated Request & Shelter
    const [requests] = await db.query(
      `SELECT r.*, s.Shelter_Name, l.Address AS Shelter_Address, l.City AS Shelter_City, l.State AS Shelter_State
       FROM Request r
       LEFT JOIN Shelter s ON r.Shelter_Id = s.Shelter_Id
       LEFT JOIN Location l ON s.Location_Id = l.Location_Id
       WHERE r.Incident_Id = ?
       ORDER BY r.Request_Id DESC LIMIT 1`,
      [realId]
    );

    let requestData = null;
    let items = [];
    let shipments = [];

    if (requests.length > 0) {
      requestData = requests[0];
      const reqId = requestData.Request_Id;

      // Request Items
      const [itemRows] = await db.query(
        `SELECT ri.*, s.Supply_Name, s.Unit, s.Category
         FROM Request_Item ri
         JOIN Supply s ON ri.Supply_Id = s.Supply_Id
         WHERE ri.Request_Id = ?`,
        [reqId]
      );
      items = itemRows;

      // Shipments linked via Allocations
      const [shipRows] = await db.query(
        `SELECT sh.*, a.Allocated_Quantity, sup.Supply_Name
         FROM Shipment sh
         JOIN Allocation a ON sh.Alloc_Id = a.Alloc_Id
         JOIN Request_Item ri ON a.Reqitem_Id = ri.Reqitem_Id
         JOIN Supply sup ON ri.Supply_Id = sup.Supply_Id
         WHERE ri.Request_Id = ?`,
        [reqId]
      );
      shipments = shipRows;
    }

    // Determine current tracking stage
    let currentStage = 1;
    let stageTitle = 'Distress Beacon Received';
    if (shipments.some(s => s.Shipment_Status === 'Delivered')) {
      currentStage = 5;
      stageTitle = 'Relief Supplies Delivered';
    } else if (shipments.some(s => s.Shipment_Status === 'In Transit')) {
      currentStage = 4;
      stageTitle = 'Relief Convoy in Transit';
    } else if (items.some(i => i.Allocated_Quantity > 0)) {
      currentStage = 3;
      stageTitle = 'Aid Allocation Approved';
    } else if (requestData && requestData.Priority_Score) {
      currentStage = 2;
      stageTitle = 'Emergency Triage Scored';
    }

    res.json({
      success: true,
      data: {
        ticketNumber: formattedTicket,
        incident: incident,
        request: requestData,
        items: items,
        shipments: shipments,
        currentStage: currentStage,
        stageTitle: stageTitle
      }
    });

  } catch (error) {
    console.error('Error tracking citizen report:', error);
    res.status(500).json({ success: false, message: 'Server error tracking citizen report.', error: error.message });
  }
};

