// -----------------------------------------------------------------------
// 3D BIN PACKING HEURISTIC (multi-container aware)
// -----------------------------------------------------------------------
// This is a deterministic "layer + shelf" heuristic, not an exhaustive
// bin-packing solver (true 3D bin packing is NP-hard). It's the same family
// of approach warehouse slotting tools use for a fast, explainable plan:
//
//   1. Sort every unit box heaviest-first so mass naturally lands low
//      (this is what keeps the center of gravity near the floor).
//   2. Walk boxes into horizontal "layers" (Z bands). Within a layer, boxes
//      are packed left-to-right, then wrapped into new "shelf rows" along
//      the width axis (a classic 2D shelf-packing sweep applied per layer).
//   3. A new layer starts once a row can't fit within the container's
//      width, and the layer's height climbs to the tallest box placed in it.
//   4. If adding the next box would exceed the container's HEIGHT or
//      WEIGHT cap, that box is deferred instead of forced in — once every
//      remaining box has been tried against the current container, a brand
//      new container instance opens and packing continues there. This is
//      what lets a shipment automatically become "3 pallets" or "2 U-Boxes"
//      instead of overflowing a single one.
//   5. Every placement is still checked against the container footprint
//      (LTL overhang rule) and the max-stack-weight rule of whatever it's
//      resting on, per instance.
//
// Axes used throughout the file (and the 3D viewer):
//   x = along container length   y = along container width   z = height
// -----------------------------------------------------------------------

import { CONTAINERS } from '../data/containers';

const PALETTE = ['#3DBFA8', '#E8A23D', '#E86A5C', '#8B7CE8', '#5CA8E8', '#E8D75C', '#6BE87C', '#E85CAE'];
const MAX_CONTAINER_INSTANCES = 60; // safety guard against pathological/oversized inputs

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

// All 6 ways a rectangular box can be oriented (every axis permutation).
// [length, width, height] for each — this is what lets the packer lay an
// item on its side, stand it up, or turn it 90° to fit a tight gap instead
// of only ever placing it in its original "flat" orientation.
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
  // De-dupe identical permutations (cubes, or items with two equal sides).
  const seen = new Set();
  return perms.filter(([ol, ow, oh]) => {
    const key = `${ol}x${ow}x${oh}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Simulates dropping a box of given (ol, ow, oh) at the current cursor,
 * applying the same row-wrap / layer-wrap rules used everywhere else.
 * Returns the landing position plus how "disruptive" the placement was
 * (0 = slots into the current row, 1 = wraps to a new row, 2 = wraps to
 * a whole new layer) so callers can prefer the least disruptive fit.
 */
function simulateDrop(container, ol, ow, oh, cursorX, cursorY, cursorZ, rowDepth, layerHeight) {
  let simX = cursorX;
  let simY = cursorY;
  let simZ = cursorZ;
  let simRowDepth = rowDepth;
  let simLayerHeight = layerHeight;
  let wrapLevel = 0;

  if (simX + ol > container.length && simX !== 0) {
    simX = 0;
    simY += simRowDepth;
    simRowDepth = 0;
    wrapLevel = 1;
  }
  if (simY + ow > container.width && simY !== 0) {
    simX = 0;
    simY = 0;
    simZ += simLayerHeight;
    simLayerHeight = 0;
    simRowDepth = 0;
    wrapLevel = 2;
  }

  return {
    x: simX,
    y: simY,
    z: simZ,
    rowDepth: simRowDepth,
    layerHeight: simLayerHeight,
    wrapLevel,
    fitsFootprint: simX + ol <= container.length && simY + ow <= container.width,
    leftoverRow: container.length - (simX + ol),
  };
}

/**
 * Tries every orientation of a unit against the current cursor and picks
 * the one that packs tightest: prefer whichever disturbs the layout least
 * (doesn't force a new row/layer), then whichever leaves the least wasted
 * space in the row, then the lowest profile (shorter height first, which
 * keeps more headroom for stacking and helps center of gravity).
 */
function chooseBestOrientation(container, unit, cursorX, cursorY, cursorZ, rowDepth, layerHeight, isFirstInInstance) {
  const candidates = [];
  orientationsFor(unit).forEach(([ol, ow, oh]) => {
    const drop = simulateDrop(container, ol, ow, oh, cursorX, cursorY, cursorZ, rowDepth, layerHeight);
    const exceedsHeight = drop.z + oh > container.height;
    // Once at least one item is already in this instance, an orientation
    // that busts the height cap is skipped entirely — it'll be retried
    // (fresh cursor) in the next container instance instead.
    if (!isFirstInInstance && exceedsHeight) return;
    candidates.push({ ol, ow, oh, drop, exceedsHeight });
  });

  if (candidates.length === 0) {
    // Nothing fits height-wise even after trying every rotation, but this
    // is the first item in the instance — place the shortest orientation
    // anyway (least overflow) and flag it rather than lose the item.
    const shortest = orientationsFor(unit).reduce((best, o) => (o[2] < best[2] ? o : best));
    const [ol, ow, oh] = shortest;
    const drop = simulateDrop(container, ol, ow, oh, cursorX, cursorY, cursorZ, rowDepth, layerHeight);
    return { ol, ow, oh, drop, exceedsHeight: true };
  }

  candidates.sort((a, b) => {
    if (a.drop.wrapLevel !== b.drop.wrapLevel) return a.drop.wrapLevel - b.drop.wrapLevel;
    if (a.drop.leftoverRow !== b.drop.leftoverRow) return a.drop.leftoverRow - b.drop.leftoverRow;
    return a.oh - b.oh;
  });
  return candidates[0];
}

/**
 * Packs as many units as will fit into ONE container instance using the
 * layer+shelf sweep. Units that don't fit (would blow the height or weight
 * cap) are returned as `leftover` so the caller can open a new instance.
 *
 * The very first unit of an instance is always placed even if it alone
 * exceeds a limit (e.g. a single item taller than the container) — there's
 * nowhere else to put it, so it's placed and flagged rather than dropped
 * silently or looped on forever.
 */
function packOneContainer(container, units, colorByItem, colorState) {
  const placements = [];
  const leftover = [];
  let cursorX = 0;
  let cursorY = 0;
  let cursorZ = 0;
  let rowDepth = 0;
  let layerHeight = 0;
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

    // Try every rotation of this unit against the current cursor and take
    // whichever orientation packs tightest (see chooseBestOrientation).
    const choice = chooseBestOrientation(container, unit, cursorX, cursorY, cursorZ, rowDepth, layerHeight, placements.length === 0);
    const { ol, ow, oh, drop, exceedsHeight } = choice;
    const wouldExceedWeight = totalWeight + unit.weight > container.maxWeight;

    // Defer to the next container instance — unless this instance is still
    // completely empty, in which case there's nowhere else for it to go.
    if (placements.length > 0 && (exceedsHeight || wouldExceedWeight)) {
      leftover.push(unit);
      return;
    }

    cursorX = drop.x;
    cursorY = drop.y;
    cursorZ = drop.z;
    rowDepth = drop.rowDepth;
    layerHeight = drop.layerHeight;

    const placement = {
      unitId: unit.unitId,
      itemId: unit.itemId,
      name: unit.name,
      x: cursorX,
      y: cursorY,
      z: cursorZ,
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
    if (placement.z + placement.height > container.height) {
      placement.overHeight = true;
      overHeight = true; // only happens on a lone oversized item — see guard above
    }
    if (placement.weight > container.maxWeight) {
      overWeight = true; // only happens on a lone overweight item
    }

    if (placement.z > 0) {
      const supports = placements.filter((p) => Math.abs(p.z + p.height - placement.z) < 0.01 && aabbOverlapXY(p, placement));
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

    cursorX += ol;
    rowDepth = Math.max(rowDepth, ow);
    layerHeight = Math.max(layerHeight, oh);
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
  // (center-of-gravity rule). Ties broken by base footprint area (largest first).
  units.sort((a, b) => b.weight - a.weight || b.length * b.width - a.length * a.width);

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
