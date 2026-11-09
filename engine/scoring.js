/**
 * scoring.js
 * Recomputes ward vulnerability dynamically based on user-selected slider weights (Section 11).
 * NOTE: pct_slum and pct_poor_roof are ASSUMED values (no ward-level Census figures yet). The sliders work,
 * and the website labels them as assumptions. Replace them with Census 2011 values when available.
 */
function computeDynamicVulnerability(ward, weights = {}) {
  const w60 = weights.w60 ?? 1;
  const wu6 = weights.wu6 ?? 1;
  const wslum = weights.wslum ?? 1;
  const wbldg = weights.wbldg ?? 1;
  const wroof = weights.wroof ?? 1;

  const totalWeight = (w60 + wu6 + wslum + wbldg + wroof) || 1;

  // Normalized component scores (0 to 1)
  const n60 = Math.min(1, (ward.pct_60plus || 0) / 0.20);
  const nu6 = Math.min(1, (ward.pct_under6 || 0) / 0.15);
  const nslum = Math.min(1, (ward.pct_slum || 0) / 0.75);          // assumed data
  const nbldg = Math.min(1, (ward.building_density || 0));
  const nroof = Math.min(1, (ward.pct_poor_roof || 0) / 0.80);     // assumed data

  const score = (w60 * n60 + wu6 * nu6 + wslum * nslum + wbldg * nbldg + wroof * nroof) / totalWeight;
  return Number(score.toFixed(3));
}

/**
 * Cooling formula (Section 4.3):
 * person_degrees_averted = population * cooling_gain_C * vulnerability_weight
 */
function scoreCoolingOption(ward, intervention, estimateMode = 'expected', vulnerabilityOverride = null) {
  const vuln = vulnerabilityOverride !== null ? vulnerabilityOverride : ward.vulnerability;
  const gain = estimateMode === 'conservative'
    ? intervention.cooling_gain_low_c
    : intervention.cooling_gain_c;

  const personDegrees = ward.population * gain * vuln;
  return {
    ward_id: ward.id,
    ward_no: ward.ward_no,
    ward_name: ward.name,
    type: intervention.type,
    population: ward.population,
    vulnerability: vuln,
    mean_temp_c: ward.mean_temp_c,
    pct_60plus: ward.pct_60plus,
    pct_under6: ward.pct_under6,
    cooling_gain_c: gain,
    cooling_gain_mean_c: intervention.cooling_gain_c,
    cooling_gain_low_c: intervention.cooling_gain_low_c,
    cooling_gain_high_c: intervention.cooling_gain_high_c,
    gain_samples: intervention.gain_samples,
    cost: Number(intervention.cost_inr),
    value: Number(personDegrees.toFixed(1))
  };
}

/**
 * Relief formula (Section 4.3):
 * relief_need = uncovered_vulnerable_pop * heat_exposure
 */
function scoreReliefOption(ward, reliefOpt) {
  const reliefValue = reliefOpt.uncovered_vulnerable_pop * reliefOpt.heat_exposure;
  return {
    ward_id: ward.id,
    ward_no: ward.ward_no,
    ward_name: ward.name,
    type: reliefOpt.type,
    population: ward.population,
    vulnerability: ward.vulnerability,
    uncovered_vulnerable_pop: reliefOpt.uncovered_vulnerable_pop,
    straight_line_uncovered_pop: reliefOpt.straight_line_uncovered_pop,
    heat_exposure: reliefOpt.heat_exposure,
    cost: Number(reliefOpt.unit_cost_inr_per_season),
    value: Number(reliefValue.toFixed(1))
  };
}

module.exports = {
  computeDynamicVulnerability,
  scoreCoolingOption,
  scoreReliefOption
};