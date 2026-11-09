const { planCooling } = require('./optimizer');

/**
 * Runs the optimizer across all 50 ensemble members to compute Pick Stability
 */
function computePickStability(options, coolingBudget) {
  if (!options.length || !options[0].gain_samples) return {};

  const numSamples = options[0].gain_samples.length;
  const wardCounts = new Map();

  for (let k = 0; k < numSamples; k++) {
    const sampledOptions = options.map(o => ({
      ...o,
      value: o.population * o.gain_samples[k] * o.vulnerability
    }));

    const res = planCooling(sampledOptions, coolingBudget);
    for (const pick of res.chosen) {
      wardCounts.set(pick.ward_no, (wardCounts.get(pick.ward_no) || 0) + 1);
    }
  }

  const stabilityMap = {};
  for (const [wardNo, count] of wardCounts.entries()) {
    stabilityMap[wardNo] = Number((count / numSamples).toFixed(2));
  }
  return stabilityMap;
}

module.exports = { computePickStability };
