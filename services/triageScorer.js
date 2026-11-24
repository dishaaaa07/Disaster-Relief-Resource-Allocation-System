// ==========================================
// DRRACS - Triage & Priority Scoring Service
// (services/triageScorer.js)
// ==========================================

/**
 * Calculates a dynamic priority score (0 to 100) for a relief request.
 * Higher score = higher allocation urgency.
 *
 * @param {string} urgencyLevel - 'Low', 'Medium', 'High', 'Urgent'
 * @param {string} disasterSeverity - 'Low', 'Medium', 'High', 'Critical'
 * @param {number} shelterCapacity
 * @param {number} shelterOccupancy
 * @param {Date} requestDate
 * @returns {number} Score between 10.0 and 100.0
 */
function calculatePriorityScore(urgencyLevel, disasterSeverity, shelterCapacity = 100, shelterOccupancy = 0, requestDate = new Date()) {
  let score = 0;

  // 1. Urgency Level Weight (Max 40 points)
  switch (urgencyLevel) {
    case 'Urgent': score += 40; break;
    case 'High': score += 30; break;
    case 'Medium': score += 20; break;
    case 'Low': score += 10; break;
    default: score += 15;
  }

  // 2. Disaster Incident Severity Weight (Max 30 points)
  switch (disasterSeverity) {
    case 'Critical': score += 30; break;
    case 'High': score += 20; break;
    case 'Medium': score += 12; break;
    case 'Low': score += 5; break;
    default: score += 10;
  }

  // 3. Shelter Overcrowding & Vulnerability Weight (Max 20 points)
  if (shelterCapacity > 0) {
    const occupancyRatio = shelterOccupancy / shelterCapacity;
    if (occupancyRatio >= 0.90) {
      score += 20; // Severely crowded shelter
    } else if (occupancyRatio >= 0.70) {
      score += 15;
    } else if (occupancyRatio >= 0.50) {
      score += 10;
    } else {
      score += 5;
    }
  }

  // 4. Elapsed Time Weight (Max 10 points - older pending requests gain urgency)
  const hoursElapsed = Math.max(0, (new Date() - new Date(requestDate)) / (1000 * 60 * 60));
  const timeBonus = Math.min(10, Math.floor(hoursElapsed / 6)); // +1 point for every 6 hours waiting
  score += timeBonus;

  // Clamp score between 10.0 and 100.0
  return Math.min(100.0, Math.max(10.0, score));
}

module.exports = { calculatePriorityScore };

