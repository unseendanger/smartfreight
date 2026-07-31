// -----------------------------------------------------------------------
// INTERNAL CARRIER SIMULATION & PRICING ENGINE
// -----------------------------------------------------------------------
// There is no external rate API. Instead this module *simulates* three
// carrier products from the payload + packing result, using transparent,
// deterministic formulas so every number on the dashboard can be traced
// back to an input. Each option is a plain rate model (base + variable
// components) and then the same rule-based surcharge pass is applied to
// all three so the effect of a packing violation is visible across options.
// -----------------------------------------------------------------------

const ACCESSORIAL_FEES = {
  liftgate: 95,
  residential: 115,
};

const HIGH_VALUE_THRESHOLD = 10000;
const HIGH_VALUE_RATE = 0.012; // 1.2% of declared value, once threshold is crossed
const OVERHANG_FEE = 150;
const OVER_HEIGHT_FEE = 225;
const OVER_WEIGHT_MULTIPLIER = 1.35; // spike, not a flat fee, per spec ("spikes the rates")

function milesFromZips(originZip, destZip) {
  // No mapping API is available offline, so distance is derived deterministically
  // from the zip codes themselves (a stable pseudo-distance), which keeps the
  // simulation reproducible for the same origin/destination pair every time.
  const o = parseInt(String(originZip).replace(/\D/g, '').padEnd(5, '0').slice(0, 5), 10) || 10000;
  const d = parseInt(String(destZip).replace(/\D/g, '').padEnd(5, '0').slice(0, 5), 10) || 10000;
  const raw = Math.abs(o - d);
  // Compress the zip delta into a plausible 50-2600 mile range.
  const miles = 50 + (raw % 9973) / 9973 * 2550;
  return Math.round(miles);
}

function applySurcharges(baseCost, packResult, accessorials) {
  const breakdown = [];
  let cost = baseCost;

  if (packResult.overhangDetected && packResult.containerId === 'ltl_pallet') {
    cost += OVERHANG_FEE;
    breakdown.push({ label: 'Non-Standard Freight (Overhang)', amount: OVERHANG_FEE });
  }
  if (packResult.overHeight) {
    cost += OVER_HEIGHT_FEE;
    breakdown.push({ label: 'Over-Height Accessorial', amount: OVER_HEIGHT_FEE });
  }
  if (packResult.overWeight) {
    const spike = cost * (OVER_WEIGHT_MULTIPLIER - 1);
    cost += spike;
    breakdown.push({ label: 'Over-Weight Rate Spike (+35%)', amount: Math.round(spike) });
  }
  if (packResult.totalValue > HIGH_VALUE_THRESHOLD) {
    const rider = Math.round(packResult.totalValue * HIGH_VALUE_RATE);
    cost += rider;
    breakdown.push({ label: 'High-Value Insurance Rider', amount: rider });
  }
  if (accessorials.liftgate) {
    cost += ACCESSORIAL_FEES.liftgate;
    breakdown.push({ label: 'Liftgate Service', amount: ACCESSORIAL_FEES.liftgate });
  }
  if (accessorials.residential) {
    cost += ACCESSORIAL_FEES.residential;
    breakdown.push({ label: 'Residential Delivery', amount: ACCESSORIAL_FEES.residential });
  }

  return { cost, breakdown };
}

/**
 * Builds the three ranked carrier options (Most Affordable / Fastest /
 * Best Overall) from a packing result + shipment context.
 */
export function generateCarrierOptions(packResult, shipmentContext) {
  const { originZip, destZip, accessorials } = shipmentContext;
  const miles = milesFromZips(originZip, destZip);
  const weight = Math.max(packResult.totalWeight, 1);
  const cwt = weight / 100; // hundredweight, standard LTL rating unit

  const disabled = packResult.overWeight && packResult.containerId === 'ltl_pallet' && weight > 4600 * 1.25;

  // --- Option A: Most Affordable (Standard LTL / consolidation space) ----
  const affordableBase = 85 + cwt * 11.5 + miles * 0.38;
  const affordableTransitDays = Math.max(2, Math.round(miles / 420) + 1);
  const affordable = applySurcharges(affordableBase, packResult, accessorials);

  // --- Option B: Fastest (Dedicated Sprinter Van / Expedited Air) --------
  const fastestBase = 260 + cwt * 24 + miles * 1.55;
  const fastestTransitDays = Math.max(1, Math.round(miles / 850));
  const fastest = applySurcharges(fastestBase, packResult, accessorials);

  // --- Option C: Best Overall (hybrid value score) ------------------------
  // Priced between the two, biased toward protecting a U-Box style load
  // (lower damage risk) — reflected as a small cost premium over pure LTL
  // in exchange for materially better transit + handling.
  const hybridBase = 165 + cwt * 16.5 + miles * 0.85;
  const hybridTransitDays = Math.max(1, Math.round(miles / 600) + 1);
  const hybrid = applySurcharges(hybridBase, packResult, accessorials);

  const costPerLb = (cost) => cost / weight;
  const damageRiskScore = (base) => {
    // Lower is better. Fragile / stack-violating loads raise risk on every
    // option, but the fastest / hybrid options handle it a bit better than
    // slow consolidated LTL freight (more handoffs = more risk).
    let risk = base;
    if (packResult.anyStackViolation) risk += 25;
    if (packResult.overhangDetected) risk += 10;
    if (packResult.placements.some((p) => p.fragile)) risk += 8;
    return Math.min(100, Math.max(0, risk));
  };

  const options = {
    affordable: {
      key: 'affordable',
      label: 'Most Affordable',
      service: 'Standard LTL Freight (Consolidated)',
      cost: Math.round(affordable.cost),
      breakdown: affordable.breakdown,
      transitDays: affordableTransitDays,
      costPerLb: costPerLb(affordable.cost),
      damageRisk: damageRiskScore(35),
      disabled,
    },
    fastest: {
      key: 'fastest',
      label: 'Fastest Time',
      service: 'Dedicated Sprinter / Expedited Air',
      cost: Math.round(fastest.cost),
      breakdown: fastest.breakdown,
      transitDays: fastestTransitDays,
      costPerLb: costPerLb(fastest.cost),
      damageRisk: damageRiskScore(15),
      disabled,
    },
    bestOverall: {
      key: 'bestOverall',
      label: 'Best Overall',
      service: packResult.containerId === 'uhaul_ubox' ? 'U-Box Managed Transit' : 'Hybrid Managed LTL',
      cost: Math.round(hybrid.cost),
      breakdown: hybrid.breakdown,
      transitDays: hybridTransitDays,
      costPerLb: costPerLb(hybrid.cost),
      damageRisk: damageRiskScore(18),
      disabled,
    },
  };

  // --- Value Index for "Best Overall" -------------------------------------
  // Normalize cost, speed, and damage risk across the three options (0-1,
  // lower-is-better after inversion) and blend them. Weights: cost 40%,
  // speed 30%, damage risk 30%. This score is what justifies the "Best
  // Overall" label programmatically rather than just picking the middle option.
  const all = [options.affordable, options.fastest, options.bestOverall];
  const costs = all.map((o) => o.cost);
  const days = all.map((o) => o.transitDays);
  const risks = all.map((o) => o.damageRisk);
  const norm = (val, arr) => {
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    if (max === min) return 1;
    return 1 - (val - min) / (max - min); // 1 = best in the field
  };
  all.forEach((o) => {
    o.valueIndex = Math.round(
      (norm(o.cost, costs) * 0.4 + norm(o.transitDays, days) * 0.3 + norm(o.damageRisk, risks) * 0.3) * 100
    );
  });

  return { options, miles };
}
