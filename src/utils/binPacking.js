// -----------------------------------------------------------------------
// 3D BIN PACKING — GUILLOTINE FREE-SPACE PARTITIONING
// -----------------------------------------------------------------------
// A note on approach: true optimal 3D bin packing is an Integer Linear
// Program (ILP) — NP-hard, and solving it exactly for anything beyond a
// handful of boxes is not something that can run interactively in a
// browser tab. Genetic algorithms / simulated annealing get closer to
// optimal but need many generations (seconds to minutes) to converge and
// are non-deterministic run to run, which doesn't fit "instantly recompute
// on every quantity change." So this engine uses the practical middle
// ground real packing tools reach for: a GUILLOTINE / TREE-BASED FREE-SPACE
// PARTITIONING heuristic with best-fit search — a fast, deterministic
// approximation that gets close to optimal utilization on typical loads.
//
// How it works:
//   1. The container starts as ONE free rectangular region (the "root" of
//      the space tree).
//   2. For each unit box (heaviest first, for center-of-gravity), the
//      engine searches every open free region and every one of the box's
//      6 orthogonal orientations (90° turns on any axis), and picks the
//      (region, orientation) pair that WASTES THE LEAST volume — this is
//      "best-fit" placement, which is what closes up the gaps a naive
//      row-by-row sweep leaves behind.
//   3. Placing the box there is a "guillotine cut": the remaining space in
//      that region is split into up to 3 new smaller free regions (one to
//      the right, one in front, one above), which get added back into the
//      space tree for later boxes — including smaller boxes that come
//      later and can slot into leftover slivers.
//   4. Free regions that are fully contained inside another free region are
//      pruned so the space tree doesn't grow unbounded.
//   5. If nothing fits a region without breaking the height or weight cap,
//      the unit is deferred to the next container instance (see the
//      multi-container loop in runPacking below).
//
// Axes: x = along container length, y = along container width, z = height.
// -----------------------------------------------------------------------

import { CONTAINERS } from '../data/containers';

const PALETTE = ['#3DBFA8', '#E8A23D', '#E86A5C', '#8B7CE8', '#5CA8E8', '#E8D75C', '#6BE87C', '#E85CAE'];
const MAX_CONTAINER_INSTANCES = 60; // safety guard against pathological/oversized inputs
const EPS = 0.01; // inches — treats sub-hundredth-inch slivers as zero

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
// orthogonal 90° rotations only, as requested, so an item can lie flat,
// stand on end, or turn sideways to slot into a tight leftover space.
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

/** Removes any free region that's fully enclosed inside another free region. */
function pruneContainedRegions(regions) {
  return regions.filter((a, i) => {
    return !regions.some((b, j) => {
      if (i === j) return false;
      return (
        a.x >= b.x - EPS &&
        a.y >= b.y - EPS &&
        a.z >= b.z - EPS &&
        a.x + a.length <= b.x + b.length + EPS &&
        a.y + a.width <= b.y + b.width + EPS &&
        a.z + a.height <= b.z + b.height + EPS
      );
    });
  });
}

/**
 * Searches every free region × every orientation of `unit` and returns the
 * best-fit placement: the one that wastes the least volume in its region,
 * tie-broken toward the floor (lower z) for stability, then toward the
 * region already closest to the origin so the pack stays contiguous rather
 * than scattering boxes across far-apart regions.
 */
function findBestFit(freeRegions, unit) {
  let best = null;
  freeRegions.forEach((region, regionIndex) => {
    orientationsFor(unit).forEach(([ol, ow, oh]) => {
      if (ol > region.length + EPS || ow > region.width + EPS || oh > region.height + EPS) return;
      const wasted = region.length * region.width * region.height - ol * ow * oh;
      const candidate = { regionIndex, region, ol, ow, oh, wasted };
      if (
        !best ||
        region.z < best.region.z - EPS ||
        (Math.abs(region.z - best.region.z) <= EPS &&
          (wasted < best.wasted - EPS ||
            (Math.abs(wasted - best.wasted) <= EPS && region.y < best.region.y - EPS) ||
            (Math.abs(wasted - best.wasted) <= EPS && Math.abs(region.y - best.region.y) <= EPS && region.x < best.region.x - EPS)))
      ) {
        best = candidate;
      }
    });
  });
  return best;
}

/**
 * Packs as many units as will fit into ONE container instance using
 * guillotine free-space partitioning. Units that don't fit anywhere
 * (would blow the height or weight cap) are returned as `leftover` so the
 * caller can open a new container instance.
 *
 * The very first unit of an instance is always placed even if it alone
 * exceeds a limit (e.g. a single item taller than the container) — there's
 * nowhere else to put it, so it's placed and flagged rather than dropped.
 */
function packOneContainer(container, units, colorByItem, colorState) {
  let freeRegions = [{ x: 0, y: 0, z: 0, length: container.length, width: container.width, height: container.height }];
  const placements = [];
  const leftover = [];
  let totalWeight = 0;
  let totalVolume = 0;
  let overhang = false;
  let overHeight = false;
  let overWeight = false;
  let stackViolation = false;

  units.forEach((unit) => {
    if (!colorByItem[unit.itemId]) {
      colorByItem[unit.itemId] = PALETTE[colorState.i % PALETTE.length];
      colorState.i += 1;
    }

    const wouldExceedWeight = totalWeight + unit.weight > container.maxWeight;
    if (placements.length > 0 && wouldExceedWeight) {
      leftover.push(unit);
      return;
    }

    let fit = findBestFit(freeRegions, unit);
    let forcedOverflow = false;

    if (!fit) {
      if (placements.length > 0) {
        // Doesn't fit anywhere in this instance — try again in the next one.
        leftover.push(unit);
        return;
      }
      // First item in the instance and it doesn't fit even the whole empty
      // container in any rotation — place it anyway (shortest-height
      // orientation, to minimize the overflow) and flag it for review.
      const shortest = orientationsFor(unit).reduce((b, o) => (o[2] < b[2] ? o : b));
      const [ol, ow, oh] = shortest;
      fit = { regionIndex: 0, region: freeRegions[0], ol, ow, oh, wasted: 0 };
      forcedOverflow = true;
    }

    const { region, ol, ow, oh, regionIndex } = fit;

    const placement = {
      unitId: unit.unitId,
      itemId: unit.itemId,
      name: unit.name,
      x: region.x,
      y: region.y,
      z: region.z,
      length: ol,
      width: ow,
      height: oh,
      rotated: ol !== unit.length || ow !== unit.width || oh !== unit.height,
      weight: unit.weight,
      value: unit.value,
      fragile: unit.fragile,
      maxStackWeight: unit.maxStackWeight,
      color: colorByItem[unit.itemId],
      overhang: false,
      overHeight: false,
      stackViolation: false,
      loadSequence: placements.length + 1,
    };

    if (placement.x + placement.length > container.footprint.length || placement.y + placement.width > container.footprint.width) {
      placement.overhang = true;
      overhang = true;
    }
    if (forcedOverflow || placement.z + placement.height > container.height) {
      placement.overHeight = true;
      overHeight = true; // only happens on a lone oversized item — see guard above
    }
    if (placement.weight > container.maxWeight) {
      overWeight = true; // only happens on a lone overweight item
    }

    if (placement.z > 0) {
      const supports = placements.filter((p) => Math.abs(p.z + p.height - placement.z) < EPS && aabbOverlapXY(p, placement));
      supports.forEach((support) => {
        if (support.fragile || support.maxStackWeight <= 0 || placement.weight > support.maxStackWeight) {
          placement.stackViolation = true;
        }
      });
      if (placement.stackViolation) stackViolation = true;
    }

    placements.push(placement);
    totalWeight += unit.weight;
    totalVolume += ol * ow * oh;

    // --- Guillotine split: carve the consumed region into up to 3 leftover
    // free regions (right / front / above) and fold them back into the tree.
    freeRegions.splice(regionIndex, 1);
    const carved = [];
    if (region.length - ol > EPS) {
      carved.push({ x: region.x + ol, y: region.y, z: region.z, length: region.length - ol, width: region.width, height: region.height });
    }
    if (region.width - ow > EPS) {
      carved.push({ x: region.x, y: region.y + ow, z: region.z, length: ol, width: region.width - ow, height: region.height });
    }
    if (region.height - oh > EPS) {
      carved.push({ x: region.x, y: region.y, z: region.z + oh, length: ol, width: ow, height: region.height - oh });
    }
    freeRegions.push(...carved);
    freeRegions = pruneContainedRegions(freeRegions);
  });

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
 */
export function runPacking(containerId, shipmentLines, itemsById) {
  const container = CONTAINERS[containerId];
  const units = expandUnits(shipmentLines, itemsById);

  // Heaviest first => mass settles into the lowest layers of each instance
  // (center-of-gravity rule). Ties broken by largest volume first, which is
  // the standard "best-fit decreasing" ordering for space-efficient packing.
  units.sort((a, b) => b.weight - a.weight || b.length * b.width * b.height - a.length * a.width * a.height);

  const colorByItem = {};
  const colorState = { i: 0 };
  const containerVolume = container.length * container.width * container.height;

  const instances = [];
  let remaining = units;
  let guard = 0;

  while (remaining.length > 0 && guard < MAX_CONTAINER_INSTANCES) {
    guard += 1;
    const result = packOneContainer(container, remaining, colorByItem, colorState);
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
  };
}
