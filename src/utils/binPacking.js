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

    // Simulate where this unit WOULD land (shelf wrap, then layer wrap)
    // without committing yet, so we can check the height/weight caps first.
    let simX = cursorX;
    let simY = cursorY;
    let simZ = cursorZ;
    let simRowDepth = rowDepth;
    let simLayerHeight = layerHeight;

    if (simX + unit.length > container.length && simX !== 0) {
      simX = 0;
      simY += simRowDepth;
      simRowDepth = 0;
    }
    if (simY + unit.width > container.width && simY !== 0) {
      simX = 0;
      simY = 0;
      simZ += simLayerHeight;
      simLayerHeight = 0;
      simRowDepth = 0;
    }

    const wouldExceedHeight = simZ + unit.height > container.height;
    const wouldExceedWeight = totalWeight + unit.weight > container.maxWeight;

    // Defer to the next container instance — unless this instance is still
    // completely empty, in which case there's nowhere else for it to go.
    if (placements.length > 0 && (wouldExceedHeight || wouldExceedWeight)) {
      leftover.push(unit);
      return;
    }

    cursorX = simX;
    cursorY = simY;
    cursorZ = simZ;
    rowDepth = simRowDepth;
    layerHeight = simLayerHeight;

    const placement = {
      unitId: unit.unitId,
      itemId: unit.itemId,
      name: unit.name,
      x: cursorX,
      y: cursorY,
      z: cursorZ,
      length: unit.length,
      width: unit.width,
      height: unit.height,
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
    totalVolume += unit.length * unit.width * unit.height;

    cursorX += unit.length;
    rowDepth = Math.max(rowDepth, unit.width);
    layerHeight = Math.max(layerHeight, unit.height);
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
