const { planCooling } = require('./optimizer');

/**
 * Computes Equity Audit metrics (Section 14.6):
 * Top Vulnerability Quintile share, Elderly (60+) & Children (<6) reached
 * Note: slum_budget_share_pct removed due to absent census data.
 */
function computeEquityAudit(allWards, chosenCooling, totalCoolingSpent) {
  const totalCityPop = allWards.reduce((s, w) => s + w.population, 0) || 1;
  const sortedByVuln = [...allWards].sort((a, b) => b.vulnerability - a.vulnerability);
  const topQuintileCount = Math.max(1, Math.ceil(allWards.length * 0.20));
  const topQuintileWards = new Set(sortedByVuln.slice(0, topQuintileCount).map(w => w.ward_no));

  let topQuintileBudgetSpent = 0;
  let elderlyReached = 0;
  let childrenReached = 0;
  let beneficiaryPop = 0;

  for (const pick of chosenCooling) {
    if (topQuintileWards.has(pick.ward_no)) {
      topQuintileBudgetSpent += pick.cost;
    }
    elderlyReached += Math.round(pick.population * (pick.pct_60plus || 0));
    childrenReached += Math.round(pick.population * (pick.pct_under6 || 0));
    beneficiaryPop += pick.population;
  }

  const spentDenom = totalCoolingSpent || 1;
  return {
    top_quintile_budget_share_pct: Math.round((topQuintileBudgetSpent / spentDenom) * 100),
    elderly_reached: elderlyReached,
    children_reached: childrenReached,
    population_share_reached_pct: Math.round((beneficiaryPop / totalCityPop) * 100)
  };
}

/**
 * Generates the Equity Trade-off Curve across guaranteed priority budget floors (0% to 50%)
 * (Section 14.6)
 */
function computeTradeoffCurve(allWards, options, coolingBudget, floors = [0, 0.1, 0.2, 0.3, 0.4, 0.5]) {
  const sortedByVuln = [...allWards].sort((a, b) => b.vulnerability - a.vulnerability);
  const topQuintileCount = Math.max(1, Math.ceil(allWards.length * 0.25));
  const priorityWards = new Set(sortedByVuln.slice(0, topQuintileCount).map(w => w.ward_no));

  return floors.map(f => {
    const priorityOpts = options.filter(o => priorityWards.has(o.ward_no));
    const firstPass = planCooling(priorityOpts, coolingBudget * f);

    const chosenWardsFirst = new Set(firstPass.chosen.map(c => c.ward_no));
    const restOpts = options.filter(o => !chosenWardsFirst.has(o.ward_no));
    const secondPass = planCooling(restOpts, coolingBudget - firstPass.spent);

    const combined = [...firstPass.chosen, ...secondPass.chosen];
    const totalValue = Math.round(combined.reduce((s, c) => s + c.value, 0));

    return {
      floor_pct: Math.round(f * 100),
      total_person_degrees: totalValue,
      wards_chosen: combined.length
    };
  });
}

module.exports = { computeEquityAudit, computeTradeoffCurve };
