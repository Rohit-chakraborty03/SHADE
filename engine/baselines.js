const { planCooling } = require('./optimizer');

/**
 * Helper to select wards in a fixed naive order until budget runs out
 */
function runOrderedSelection(options, budget, sortFn) {
  const sorted = [...options].sort(sortFn);
  const chosen = [];
  const treated = new Set();
  let spent = 0;

  for (const o of sorted) {
    if (treated.has(o.ward_no)) continue;
    if (spent + o.cost > budget) continue;
    chosen.push(o);
    treated.add(o.ward_no);
    spent += o.cost;
  }

  const personDegrees = chosen.reduce((s, c) => s + c.value, 0);
  const peopleReached = chosen.reduce((s, c) => s + c.population, 0);
  const avgVulnerability = chosen.length
    ? chosen.reduce((s, c) => s + c.vulnerability, 0) / chosen.length
    : 0;

  return {
    chosenCount: chosen.length,
    spent,
    personDegrees: Math.round(personDegrees),
    peopleReached,
    avgVulnerability: Number(avgVulnerability.toFixed(2))
  };
}

function compareBaselines(options, coolingBudget) {
  const optRes = planCooling(options, coolingBudget);
  const optPeople = optRes.chosen.reduce((s, c) => s + c.population, 0);
  const optVuln = optRes.chosen.length
    ? optRes.chosen.reduce((s, c) => s + c.vulnerability, 0) / optRes.chosen.length
    : 0;

  const hottest = runOrderedSelection(options, coolingBudget, (a, b) => b.mean_temp_c - a.mean_temp_c);
  const populated = runOrderedSelection(options, coolingBudget, (a, b) => b.population - a.population);
  const vulnerable = runOrderedSelection(options, coolingBudget, (a, b) => b.vulnerability - a.vulnerability);

  let randPD = 0, randPop = 0, randVuln = 0;
  for (let r = 1; r <= 10; r++) {
    const res = runOrderedSelection(options, coolingBudget, (a, b) => {
      const ha = ((a.ward_no * 37 + r * 13) % 101);
      const hb = ((b.ward_no * 37 + r * 13) % 101);
      return ha - hb;
    });
    randPD += res.personDegrees;
    randPop += res.peopleReached;
    randVuln += res.avgVulnerability;
  }

  return [
    { strategy: "S.H.A.D.E. Optimizer", personDegrees: optRes.totalValue, peopleReached: optPeople, avgVulnerability: Number(optVuln.toFixed(2)) },
    { strategy: "Hottest First", personDegrees: hottest.personDegrees, peopleReached: hottest.peopleReached, avgVulnerability: hottest.avgVulnerability },
    { strategy: "Most Populated First", personDegrees: populated.personDegrees, peopleReached: populated.peopleReached, avgVulnerability: populated.avgVulnerability },
    { strategy: "Most Vulnerable First", personDegrees: vulnerable.personDegrees, peopleReached: vulnerable.peopleReached, avgVulnerability: vulnerable.avgVulnerability },
    { strategy: "Random Baseline (Avg)", personDegrees: Math.round(randPD / 10), peopleReached: Math.round(randPop / 10), avgVulnerability: Number((randVuln / 10).toFixed(2)) }
  ];
}

module.exports = { compareBaselines };
