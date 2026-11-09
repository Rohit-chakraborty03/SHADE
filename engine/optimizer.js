/**
 * Greedy Knapsack Optimizer for Cooling Pool (Section 14.2)
 */
function planCooling(options, budget) {
  const chosen = [];
  const treatedWards = new Set();
  let spent = 0;

  const sorted = [...options].sort((a, b) => (b.value / b.cost) - (a.value / a.cost));

  for (const o of sorted) {
    if (treatedWards.has(o.ward_no)) continue; 
    if (spent + o.cost > budget) continue;
    chosen.push(o);
    treatedWards.add(o.ward_no);
    spent += o.cost;
  }

  const greedyTotalValue = chosen.reduce((sum, item) => sum + item.value, 0);

  const affordable = options.filter(o => o.cost <= budget).sort((a, b) => b.value - a.value);
  if (affordable.length > 0 && affordable[0].value > greedyTotalValue) {
    return {
      chosen: [affordable[0]],
      spent: affordable[0].cost,
      totalValue: Math.round(affordable[0].value)
    };
  }

  return { chosen, spent, totalValue: Math.round(greedyTotalValue) };
}

/**
 * Greedy Optimizer for Seasonal Relief Pool (Section 14.3)
 */
function planRelief(options, budget) {
  const chosen = [];
  const usedWardType = new Set();
  let spent = 0;

  const sorted = [...options].sort((a, b) => (b.value / b.cost) - (a.value / a.cost));

  for (const o of sorted) {
    const key = `${o.ward_no}_${o.type}`;
    if (usedWardType.has(key)) continue;
    if (spent + o.cost > budget) continue;
    chosen.push(o);
    usedWardType.add(key);
    spent += o.cost;
  }

  const totalVulnerableCovered = chosen.reduce((sum, item) => sum + item.uncovered_vulnerable_pop, 0);
  const totalReliefScore = chosen.reduce((sum, item) => sum + item.value, 0);

  return { chosen, spent, totalVulnerableCovered, totalReliefScore: Math.round(totalReliefScore) };
}

module.exports = { planCooling, planRelief };
