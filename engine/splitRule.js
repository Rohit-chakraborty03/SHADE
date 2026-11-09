/**
 * Transparent policy rule converting Heat Index (°C) and IMD Alert Level
 * into a suggested Cooling vs. Relief budget split (Section 15.2)
 */
function suggestSplit(heatIndexC, alertLevel = 0) {
  if (alertLevel >= 3) return { cooling: 30, relief: 70, label: "Severe Heatwave Alert (30% Cooling / 70% Immediate Relief)" };
  if (alertLevel === 2 || heatIndexC >= 41) return { cooling: 50, relief: 50, label: "Active Heatwave Condition (50% Cooling / 50% Relief)" };
  if (alertLevel === 1 || heatIndexC >= 35) return { cooling: 70, relief: 30, label: "High Humid Heat Index (70% Cooling / 30% Relief)" };
  return { cooling: 85, relief: 15, label: "Normal Weather Baseline (85% Long-Term Cooling / 15% Relief)" };
}

module.exports = { suggestSplit };
