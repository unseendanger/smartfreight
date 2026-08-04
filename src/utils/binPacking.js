// -----------------------------------------------------------------------
// 3D BIN PACKING — LAYER-BUILDING WITH MULTI-CANDIDATE HEIGHT EVALUATION
// -----------------------------------------------------------------------
// A note on approach: true optimal 3D bin packing is an Integer Linear
// Program (ILP) — NP-hard, and solving it exactly for anything beyond a
// handful of boxes isn't realistic to run interactively in a browser tab.
// Genetic algorithms / simulated annealing get closer to optimal but need
// many generations (seconds to minutes) to converge and aren't deterministic
// run to run. So this engine uses a fast, deterministic heuristic instead —
// but the *previous* version of it (plain guillotine free-space splitting)
// had a real flaw worth naming: when it carved the leftover space "above" a
// placed box, that leftover region was pinned to that box's own footprint
// only. So a small box on the floor could only ever grow a narrow tower
// straight up above itself — it could never let a wider neighboring box
// span across it. That's exactly the "weird vertical column" pattern that
// showed up with mixed SKUs.
//
// This version builds the container in horizontal LAYERS instead:
//   1. Look at every remaining SKU's possible orientation heights and treat
//      each distinct height as a CANDIDATE layer height.
//   2. For each candidate, actually simulate packing a full layer at that
//      height — a 2D best-fit search (every remaining SKU × every open 2D
//      free rectangle × every orientation whose height fits) — and measure
//      how much volume that layer would pack.
//   3. Whichever candidate height packs the most volume WINS and gets
//      committed for real. This is the "try multiple ways of stacking and
//      keep the best one" the layer height itself is chosen by, rather than
//      always defaulting to whatever SKU happened to be evaluated first.
//   4. Within a layer, if a placed box is shorter than the chosen layer
//      height, the leftover headroom directly above THAT box's own footprint
//      is filled by a secondary pass that can stack one or more shorter
//      boxes there (e.g. two half-height boxes stacked to match a taller
//      neighbor) — again picked by best fit, not forced.
//   5. Once a layer is full (or nothing else fits it), the next layer starts
//      at the top of the current one, and the whole process repeats.
//
// Axes: x = along container length, y = along container width, z = height.
// -----------------------------------------------------------------------

import { CONTAINERS } from '../data/containers';

const PALETTE = ['#3DBFA8', '#E8A23D', '#E86A5C', '#8B7CE8', '#5CA8E8', '#E8D75C', '#6BE87C', '#E85CAE'];
const MAX_CONTAINER_INSTANCES = 60; // safety guard against pathological/oversized inputs
const EPS = 0.01; // inches — treats sub-hundredth-inch slivers as zero
const MAX_HEIGHT_CANDIDATES = 8; // how many distinct layer heights to trial per layer
const LARGE_LOAD_THRESHOLD = 250; // above this many remaining units, trial fewer candidates for performance

/** Expand shipment line items (item + qty) into individual unit boxes. */
function expandUnits(shipmentLines, itemsById) {
  const units = [];
  let counter = 0;
  shipmentLines.forEach((line) => {
    const item = itemsById[line.itemId];
    if (!item || line.qty <= 0) return;
    for (let i = 0; i < line.qty; i += 1) {
      counter += 1;
      units.push({
        unitId: `${item.id}_u${i + 1}_${counter}`,
        itemId: item.id,
        name: item.name,
        length: Number(item.length) || 1,
        width: Number(item.width) || 1,
        height: Number(item.height) || 1,
        weight: Number(item.weight) || 0,
        value: Number(item.value) || 0,
        fragile: !!item.fragile,
        maxStackWeight: Number(item.maxStackWeight) || 0,
      });
    }
  });
  return units;
}

function aabbOverlapXY(a, b) {
  return a.x < b.x + b.length && a.x + a.length > b.x && a.y < b.y + b.width && a.y + a.width > b.y;
}

// All 6 ways a rectangular box can be oriented (every axis permutation) —
// orthogonal 90° rotations only, so an item can lie flat, stand on end, or
// turn sideways to slot into a tight leftover space.
function orientationsFor(unit) {
  const { length: l, width: w, height: h } = unit;
  const perms = [
    [l, w, h],
    [w, l, h],
    [l, h, w],
    [h, l, w],
    [w, h, l],
    [h, w, l],
  ];
  const seen = new Set();
  return perms.filter(([ol, ow, oh]) => {
    const key = `${ol}x${ow}x${oh}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Removes any 2D free rectangle that's fully enclosed inside another one. */
function pruneContained2D(rects) {
  return rects.filter((a, i) => {
    return !rects.some((b, j) => {
      if (i === j) return false;
      return a.x >= b.x - EPS && a.y >= b.y - EPS && a.x + a.length <= b.x + b.length + EPS && a.y + a.width <= b.y + b.width + EPS;
    });
  });
}

/** Snapshot of item-type groups for a simulation pass — pops don't affect the real queues. */
function cloneGroupsForSim(groups) {
  const clone = new Map();
  groups.forEach((g, itemId) => clone.set(itemId, { itemId, queue: g.queue.slice() }));
  return clone;
}

/**
 * Packs a single horizontal layer of a given height H: a 2D best-fit search
 * across every remaining SKU × every open free rectangle × every orientation
 * whose height fits within H, plus a secondary pass that stacks shorter
 * items directly above a placed box to use any leftover headroom under H.
 * Operates on whatever `groups` map it's given — pass a real one to commit
 * for real, or a cloned one (see cloneGroupsForSim) to just simulate and
 * measure how good this candidate H would be without consuming anything.
 */
function packLayer(container, H, groups, weightBudget, nonStackable) {
  let freeRects = [{ x: 0, y: 0, length: container.length, width: container.width }];
  const placements = [];
  let weightUsed = 0;
  let volumePacked = 0;

  const anyRemaining = () => Array.from(groups.values()).some((g) => g.queue.length > 0);

  while (anyRemaining()) {
    let best = null;
    groups.forEach((group) => {
      if (group.queue.length === 0) return;
      const template = group.queue[0];
      if (template.weight > weightBudget - weightUsed + EPS) return;

      freeRects.forEach((rect, rectIndex) => {
        orientationsFor(template).forEach(([ol, ow, oh]) => {
          if (oh > H + EPS) return;
          if (ol > rect.length + EPS || ow > rect.width + EPS) return;
          const wasted2D = rect.length * rect.width - ol * ow;
          const heightWaste = H - oh; // prefer an orientation that uses more of this layer's height
          const candidate = { group, rect, rectIndex, ol, ow, oh, wasted2D, heightWaste, weight: template.weight };
          if (
            !best ||
            wasted2D < best.wasted2D - EPS ||
            (Math.abs(wasted2D - best.wasted2D) <= EPS &&
              (heightWaste < best.heightWaste - EPS ||
                (Math.abs(heightWaste - best.heightWaste) <= EPS &&
                  (rect.y < best.rect.y - EPS || (Math.abs(rect.y - best.rect.y) <= EPS && rect.x < best.rect.x - EPS)))))
          ) {
            best = candidate;
          }
        });
      });
    });

    if (!best) break; // nothing else fits this layer's footprint/height/weight budget

    const { group, rect, rectIndex, ol, ow, oh } = best;
    const unit = group.queue.shift();
    placements.push({
      unitId: unit.unitId,
      itemId: unit.itemId,
      name: unit.name,
      x: rect.x,
      y: rect.y,
      z: 0, // layer-local; the caller offsets this by the layer's cursorZ
      length: ol,
      width: ow,
      height: oh,
      rotated: ol !== unit.length || ow !== unit.width || oh !== unit.height,
      weight: unit.weight,
      value: unit.value,
      fragile: unit.fragile,
      maxStackWeight: unit.maxStackWeight,
    });
    weightUsed += unit.weight;
    volumePacked += ol * ow * oh;

    // 2D guillotine split of the consumed rectangle (right + front strips).
    freeRects.splice(rectIndex, 1);
    const carved = [];
    if (rect.length - ol > EPS) carved.push({ x: rect.x + ol, y: rect.y, length: rect.length - ol, width: rect.width });
    if (rect.width - ow > EPS) carved.push({ x: rect.x, y: rect.y + ow, length: ol, width: rect.width - ow });
    freeRects.push(...carved);
    freeRects = pruneContained2D(freeRects);

    // Fill any headroom directly above this box (within its own footprint)
    // with shorter items — e.g. two half-height boxes stacked to match a
    // taller neighbor's height. Bounded by H, so it can never run away into
    // a full-height tower the way the old per-item guillotine cut did.
    // Skipped entirely in non-stackable mode: nothing may rest on anything.
    let headroom = nonStackable ? 0 : H - oh;
    let stackZ = oh;
    while (headroom > EPS) {
      let subBest = null;
      groups.forEach((subGroup) => {
        if (subGroup.queue.length === 0) return;
        const t2 = subGroup.queue[0];
        if (t2.weight > weightBudget - weightUsed + EPS) return;
        orientationsFor(t2).forEach(([sl, sw, sh]) => {
          if (sh > headroom + EPS) return;
          if (sl > ol + EPS || sw > ow + EPS) return; // stays within the footprint of the box below it
          const wastedFootprint = ol * ow - sl * sw;
          const candidate = { group: subGroup, sl, sw, sh, wastedFootprint };
          if (!subBest || wastedFootprint < subBest.wastedFootprint - EPS || (Math.abs(wastedFootprint - subBest.wastedFootprint) <= EPS && sh > subBest.sh)) {
            subBest = candidate;
          }
        });
      });
      if (!subBest) break;
      const { group: subGroup, sl, sw, sh } = subBest;
      const subUnit = subGroup.queue.shift();
      placements.push({
        unitId: subUnit.unitId,
        itemId: subUnit.itemId,
        name: subUnit.name,
        x: rect.x,
        y: rect.y,
        z: stackZ,
        length: sl,
        width: sw,
        height: sh,
        rotated: sl !== subUnit.length || sw !== subUnit.width || sh !== subUnit.height,
        weight: subUnit.weight,
        value: subUnit.value,
        fragile: subUnit.fragile,
        maxStackWeight: subUnit.maxStackWeight,
      });
      weightUsed += subUnit.weight;
      volumePacked += sl * sw * sh;
      headroom -= sh;
      stackZ += sh;
    }
  }

  return { placements, weightUsed, volumePacked };
}

/**
 * Packs as many units as will fit into ONE container instance by building
 * horizontal layers (see packLayer). For each layer, several candidate
 * heights are actually simulated and whichever packs the most volume is
 * committed — this is the "try multiple stacking combinations, keep the
 * best" step. Units that don't fit anywhere (height or weight cap) are
 * returned as `leftover` so the caller can open a new container instance.
 *
 * `nonStackable`, when true, stops after a single layer per instance — no
 * item may be stacked on or above another, matching a real "non-stackable"
 * LTL freight classification. This naturally uses far less of the
 * container's height and needs more container instances overall.
 */
function packOneContainer(container, units, colorByItem, colorState, nonStackable) {
  const realGroups = new Map();
  units.forEach((unit) => {
    if (!realGroups.has(unit.itemId)) realGroups.set(unit.itemId, { itemId: unit.itemId, queue: [] });
    realGroups.get(unit.itemId).queue.push(unit);
  });

  const anyRemaining = () => Array.from(realGroups.values()).some((g) => g.queue.length > 0);
  const ensureColor = (itemId) => {
    if (!colorByItem[itemId]) {
      colorByItem[itemId] = PALETTE[colorState.i % PALETTE.length];
      colorState.i += 1;
    }
    return colorByItem[itemId];
  };

  const placements = [];
  let cursorZ = 0;
  let totalWeight = 0;
  let totalVolume = 0;

  while (anyRemaining() && cursorZ < container.height - EPS) {
    const remainingHeightBudget = container.height - cursorZ;
    const weightBudget = container.maxWeight - totalWeight;

    // Candidate layer heights: every orientation height any remaining SKU
    // could offer, clamped to what's left of the container.
    const candidateSet = new Set();
    realGroups.forEach((g) => {
      if (g.queue.length === 0) return;
      orientationsFor(g.queue[0]).forEach(([, , oh]) => {
        if (oh <= remainingHeightBudget + EPS) candidateSet.add(Math.min(oh, remainingHeightBudget));
      });
    });

    let chosenH = null;
    if (candidateSet.size > 0) {
      const totalRemainingCount = Array.from(realGroups.values()).reduce((s, g) => s + g.queue.length, 0);
      const trialCap = totalRemainingCount > LARGE_LOAD_THRESHOLD ? 3 : MAX_HEIGHT_CANDIDATES;
      const candidates = Array.from(candidateSet)
        .sort((a, b) => b - a)
        .slice(0, trialCap);

      let bestTrial = null;
      candidates.forEach((H) => {
        const simGroups = cloneGroupsForSim(realGroups);
        const res = packLayer(container, H, simGroups, weightBudget, nonStackable);
        if (res.placements.length === 0) return;
        if (!bestTrial || res.volumePacked > bestTrial.volumePacked + EPS || (Math.abs(res.volumePacked - bestTrial.volumePacked) <= EPS && H > bestTrial.H)) {
          bestTrial = { H, volumePacked: res.volumePacked };
        }
      });
      if (bestTrial) chosenH = bestTrial.H;
    }

    if (chosenH === null) {
      if (placements.length === 0) {
        // Nothing fits even the very first layer — this SKU alone is
        // taller than the empty container. Place it anyway (shortest
        // orientation) and flag it for review rather than losing it.
        const group = Array.from(realGroups.values()).find((g) => g.queue.length > 0);
        const unit = group.queue.shift();
        const shortest = orientationsFor(unit).reduce((b, o) => (o[2] < b[2] ? o : b));
        const [ol, ow, oh] = shortest;
        placements.push({
          unitId: unit.unitId,
          itemId: unit.itemId,
          name: unit.name,
          x: 0,
          y: 0,
          z: 0,
          length: ol,
          width: ow,
          height: oh,
          rotated: ol !== unit.length || ow !== unit.width || oh !== unit.height,
          weight: unit.weight,
          value: unit.value,
          fragile: unit.fragile,
          maxStackWeight: unit.maxStackWeight,
          color: ensureColor(unit.itemId),
          overhang: false,
          overHeight: true,
          stackViolation: false,
          loadSequence: 1,
        });
        totalWeight += unit.weight;
        totalVolume += ol * ow * oh;
      }
      break; // nothing more fits this instance — rest carries to the next one
    }

    const committed = packLayer(container, chosenH, realGroups, weightBudget, nonStackable);
    committed.placements.forEach((p) => {
      placements.push({
        ...p,
        z: p.z + cursorZ,
        color: ensureColor(p.itemId),
        overhang: false,
        overHeight: false,
        stackViolation: false,
        loadSequence: placements.length + 1,
      });
    });
    totalWeight += committed.weightUsed;
    totalVolume += committed.volumePacked;
    cursorZ += chosenH;

    if (nonStackable) break; // one layer only — no item may sit on/above another
  }

  // Post-process rule checks across every placement now that the instance's
  // full geometry is known (overhang, height cap, and what's resting on what).
  placements.forEach((p) => {
    if (p.x + p.length > container.footprint.length || p.y + p.width > container.footprint.width) p.overhang = true;
    if (p.z + p.height > container.height + EPS) p.overHeight = true;
  });
  placements.forEach((p) => {
    if (p.z <= EPS) return;
    const supports = placements.filter((s) => s !== p && Math.abs(s.z + s.height - p.z) < EPS && aabbOverlapXY(s, p));
    supports.forEach((support) => {
      if (support.fragile || support.maxStackWeight <= 0 || p.weight > support.maxStackWeight) {
        p.stackViolation = true;
      }
    });
  });

  const overhang = placements.some((p) => p.overhang);
  const overHeight = placements.some((p) => p.overHeight);
  const overWeight = placements.some((p) => p.weight > container.maxWeight);
  const stackViolation = placements.some((p) => p.stackViolation);

  const leftover = [];
  realGroups.forEach((group) => leftover.push(...group.queue));

  return { placements, leftover, totalWeight, totalVolume, overhang, overHeight, overWeight, stackViolation };
}

function computeCenterOfGravity(placements, totalWeight, container) {
  let cgX = 0;
  let cgY = 0;
  let cgZ = 0;
  if (totalWeight > 0) {
    placements.forEach((p) => {
      cgX += (p.x + p.length / 2) * p.weight;
      cgY += (p.y + p.width / 2) * p.weight;
      cgZ += (p.z + p.height / 2) * p.weight;
    });
    cgX /= totalWeight;
    cgY /= totalWeight;
    cgZ /= totalWeight;
  }
  return {
    x: cgX,
    y: cgY,
    z: cgZ,
    xPct: container.length ? ((cgX - container.length / 2) / (container.length / 2)) * 100 : 0,
    yPct: container.width ? ((cgY - container.width / 2) / (container.width / 2)) * 100 : 0,
    heightPct: container.height ? (cgZ / container.height) * 100 : 0,
  };
}

/**
 * Runs the packing heuristic for a given container id and shipment lines.
 * Automatically spans as many container INSTANCES as the load requires
 * (e.g. "Pallet 1 of 3") rather than overflowing a single one.
 *
 * `heightOverrideInches` lets the caller raise a pallet's usable height up
 * to its `maxHeightCap`. Ignored for containers with a fixed physical
 * height (e.g. the U-Box, a real product with real dimensions).
 *
 * `nonStackable` forces single-layer packing per instance — see
 * packOneContainer for what that models.
 */
export function runPacking(containerId, shipmentLines, itemsById, heightOverrideInches = null, nonStackable = false) {
  const baseContainer = CONTAINERS[containerId];
  let effectiveHeight = baseContainer.height;
  if (heightOverrideInches && baseContainer.maxHeightCap) {
    effectiveHeight = Math.min(baseContainer.maxHeightCap, Math.max(baseContainer.standardHeight ?? baseContainer.height, heightOverrideInches));
  }
  // Never mutate the shared CONTAINERS preset — build a fresh object per run.
  const container = { ...baseContainer, height: effectiveHeight };

  const units = expandUnits(shipmentLines, itemsById);

  // Heaviest first => mass settles into the lowest layers of each instance
  // (center-of-gravity rule). Ties broken by largest volume first, which is
  // the standard "best-fit decreasing" ordering for space-efficient packing.
  // (This ordering only affects which group is checked first when several
  // tie exactly on fit quality — the layer/best-fit search itself considers
  // every SKU on every pass, which is what makes mixed packing possible.)
  units.sort((a, b) => b.weight - a.weight || b.length * b.width * b.height - a.length * a.width * a.height);

  const colorByItem = {};
  const colorState = { i: 0 };
  const containerVolume = container.length * container.width * container.height;

  const instances = [];
  let remaining = units;
  let guard = 0;

  while (remaining.length > 0 && guard < MAX_CONTAINER_INSTANCES) {
    guard += 1;
    const result = packOneContainer(container, remaining, colorByItem, colorState, nonStackable);
    const totalValue = result.placements.reduce((sum, p) => sum + p.value, 0);
    instances.push({
      index: instances.length,
      container,
      placements: result.placements,
      totalWeight: result.totalWeight,
      totalVolume: result.totalVolume,
      totalValue,
      cubeUtilization: containerVolume ? Math.min(100, (result.totalVolume / containerVolume) * 100) : 0,
      overhang: result.overhang,
      overHeight: result.overHeight,
      overWeight: result.overWeight,
      stackViolation: result.stackViolation,
      unitCount: result.placements.length,
      centerOfGravity: computeCenterOfGravity(result.placements, result.totalWeight, container),
    });
    remaining = result.leftover;
  }

  const totalWeight = instances.reduce((s, inst) => s + inst.totalWeight, 0);
  const totalVolume = instances.reduce((s, inst) => s + inst.totalVolume, 0);
  const totalValue = instances.reduce((s, inst) => s + inst.totalValue, 0);
  const unitCount = instances.reduce((s, inst) => s + inst.unitCount, 0);
  const overhangDetected = instances.some((inst) => inst.overhang);
  const overHeight = instances.some((inst) => inst.overHeight);
  const overWeight = instances.some((inst) => inst.overWeight);
  const anyStackViolation = instances.some((inst) => inst.stackViolation);
  const cubeUtilization = instances.length
    ? instances.reduce((s, inst) => s + inst.cubeUtilization, 0) / instances.length
    : 0;

  return {
    containerId,
    container,
    instances,
    totalContainers: instances.length,
    totalWeight,
    totalVolume,
    totalValue,
    containerVolume,
    cubeUtilization,
    overWeight,
    overHeight,
    overhangDetected,
    anyStackViolation,
    unitCount,
    nonStackable,
  };
}
