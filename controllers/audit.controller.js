// ==========================================
// DRRACS - Audit Trail & Dashboard Metrics Controller
// (controllers/audit.controller.js)
// ==========================================

const db = require('../config/db');

// 1. GET RECENT ACTIVITY LOGS: GET /api/audit-logs
exports.getActivityLogs = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;

    const [logs] = await db.query(
      `SELECT l.Log_Id,
              l.Action_Type,
              l.Description,
              l.Created_At,
              u.Full_Name AS Actor_Name,
              u.Role AS Actor_Role,
              u.Email AS Actor_Email
       FROM Activity_Log l
       LEFT JOIN Users u ON l.User_Id = u.User_Id
       ORDER BY l.Created_At DESC
       LIMIT ?`,
      [limit]
    );

    res.json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ success: false, message: 'Server error fetching audit logs.', error: error.message });
  }
};

// 2. GET UNIFIED DASHBOARD METRICS: GET /api/audit-logs/metrics
exports.getDashboardMetrics = async (req, res) => {
  try {
    // 1. Active Disasters Count
    const [disasterCount] = await db.query("SELECT COUNT(*) AS count FROM Disaster_Incident WHERE Status = 'Active'");
    
    // 2. Total Registered Shelters & Population
    const [shelterStats] = await db.query(
      "SELECT COUNT(*) AS totalShelters, COALESCE(SUM(Current_Occupancy), 0) AS totalOccupancy, COALESCE(SUM(Capacity), 0) AS totalCapacity FROM Shelter"
    );

    // 3. Requests breakdown
    const [requestStats] = await db.query(
      `SELECT 
         COUNT(*) AS totalRequests,
         COUNT(CASE WHEN Request_Status = 'Pending' THEN 1 END) AS pendingRequests,
         COUNT(CASE WHEN Priority = 'Urgent' AND Request_Status != 'Fulfilled' THEN 1 END) AS urgentRequests,
         COUNT(CASE WHEN Request_Status = 'Fulfilled' THEN 1 END) AS fulfilledRequests
       FROM Request`
    );

    // 4. In-Transit Shipments
    const [shipmentStats] = await db.query(
      "SELECT COUNT(*) AS count FROM Shipment WHERE Shipment_Status = 'In Transit'"
    );

    // 5. Total Available Stock Units
    const [stockStats] = await db.query(
      "SELECT COALESCE(SUM(Quantity), 0) AS totalUnitsAvailable FROM Stock"
    );

    // 6. Top 5 Most Requested Supplies (for Chart.js)
    const [topRequestedSupplies] = await db.query(
      `SELECT sup.Supply_Name, COALESCE(SUM(ri.Quantity), 0) AS Requested_Qty, COALESCE(SUM(ri.Allocated_Quantity), 0) AS Allocated_Qty
       FROM Supply sup
       JOIN Request_Item ri ON sup.Supply_Id = ri.Supply_Id
       GROUP BY sup.Supply_Id
       ORDER BY Requested_Qty DESC
       LIMIT 5`
    );

    // 7. Request Status Distribution (for Doughnut Chart)
    const [statusDistribution] = await db.query(
      `SELECT Request_Status AS status, COUNT(*) AS count FROM Request GROUP BY Request_Status`
    );

    res.json({
      success: true,
      metrics: {
        activeDisasters: disasterCount[0].count,
        totalShelters: shelterStats[0].totalShelters,
        shelterPopulationAssisted: shelterStats[0].totalOccupancy,
        totalShelterCapacity: shelterStats[0].totalCapacity,
        totalRequests: requestStats[0].totalRequests,
        pendingRequests: requestStats[0].pendingRequests,
        urgentRequests: requestStats[0].urgentRequests,
        fulfilledRequests: requestStats[0].fulfilledRequests,
        shipmentsInTransit: shipmentStats[0].count,
        totalAvailableStockUnits: stockStats[0].totalUnitsAvailable
      },
      charts: {
        topRequestedSupplies: topRequestedSupplies,
        requestStatusDistribution: statusDistribution
      }
    });

  } catch (error) {
    console.error('Error calculating dashboard metrics:', error);
    res.status(500).json({ success: false, message: 'Server error generating metrics.', error: error.message });
  }
};

