// -----------------------------------------------------------------------
// 3D BIN PACKING HEURISTIC
// -----------------------------------------------------------------------
// This is a deterministic "layer + shelf" heuristic, not an exhaustive
// bin-packing solver (true 3D bin packing is NP-hard). It's the same family
// of approach warehouse slotting tools use for a fast, explainable plan:
//
//   1. Sort every unit box heaviest-first so mass naturally lands low
//      (this is what keeps the center of gravity near the floor).
//   2. Walk boxes into horizontal "layers" (Z bands). Within a layer, boxes
//      are packed left-to-right, then wrapped into new "shelf rows" along
//      the width axis (this is a classic 2D shelf-packing sweep applied
//      per layer).
//   3. A new layer starts once a row can't fit within the container's
//      width, and the layer's height climbs to the tallest box placed in it.
//   4. Every placement is checked against the container footprint (for the
//      LTL overhang rule), the container height, the running weight total,
//      and the max-stack-weight rule of whatever box(es) it's resting on.
//
// Axes used throughout the file (and the 3D viewer):
//   x = along container length   y = along container width   z = height
// -----------------------------------------------------------------------

import { CONTAINERS } from '../data/containers';

const PALETTE = ['#3DBFA8', '#E8A23D', '#E86A5C', '#8B7CE8', '#5CA8E8', '#E8D75C', '#6BE87C', '#E85CAE'];

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
 * Runs the packing heuristic for a given container id and shipment lines.
 * Returns placements plus derived metrics used by the pricing engine and
 * the 3D visualizer / step slider.
 */
export function runPacking(containerId, shipmentLines, itemsById) {
  const container = CONTAINERS[containerId];
  const units = expandUnits(shipmentLines, itemsById);

  // Heaviest first => mass settles into the lowest layers (center-of-gravity rule).
  // Ties broken by base footprint area (largest first) for a tighter shelf pack.
  units.sort((a, b) => b.weight - a.weight || b.length * b.width - a.length * a.width);

  const placements = [];
  let cursorX = 0;
  let cursorY = 0;
  let cursorZ = 0;
  let rowDepth = 0; // tallest-in-Y footprint of the current shelf row (in units.width terms, actually row's width extent)
  let layerHeight = 0; // tallest box height placed in the current Z layer
  let colorIndex = 0;
  const colorByItem = {};

  let totalWeight = 0;
  let totalVolume = 0;
  let overWeight = false;
  let overHeight = false;
  let overhangDetected = false;
  let anyStackViolation = false;

  units.forEach((unit) => {
    if (!colorByItem[unit.itemId]) {
      colorByItem[unit.itemId] = PALETTE[colorIndex % PALETTE.length];
      colorIndex += 1;
    }

    // Does it fit in the current row along X? If not, wrap to a new row.
    if (cursorX + unit.length > container.length && cursorX !== 0) {
      cursorX = 0;
      cursorY += rowDepth;
      rowDepth = 0;
    }
    // Does the row fit in the current layer along Y? If not, start a new layer (up).
    if (cursorY + unit.width > container.width && cursorY !== 0) {
      cursorX = 0;
      cursorY = 0;
      cursorZ += layerHeight;
      layerHeight = 0;
      rowDepth = 0;
    }

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

    // --- Rule checks -----------------------------------------------------
    if (placement.x + placement.length > container.footprint.length || placement.y + placement.width > container.footprint.width) {
      placement.overhang = true;
      overhangDetected = true;
    }
    if (placement.z + placement.height > container.height) {
      placement.overHeight = true;
      overHeight = true;
    }

    // Stack-weight check: find whatever this box is resting directly on top of
    // (touching supports whose top surface == this box's z and whose footprint
    // overlaps), then confirm none of them are fragile / over their max stack weight.
    if (placement.z > 0) {
      const supports = placements.filter((p) => Math.abs(p.z + p.height - placement.z) < 0.01 && aabbOverlapXY(p, placement));
      supports.forEach((support) => {
        if (support.fragile || support.maxStackWeight <= 0) {
          placement.stackViolation = true;
        } else if (placement.weight > support.maxStackWeight) {
          placement.stackViolation = true;
        }
      });
      if (placement.stackViolation) anyStackViolation = true;
    }

    placements.push(placement);

    totalWeight += unit.weight;
    totalVolume += unit.length * unit.width * unit.height;
    if (totalWeight > container.maxWeight) overWeight = true;

    cursorX += unit.length;
    rowDepth = Math.max(rowDepth, unit.width);
    layerHeight = Math.max(layerHeight, unit.height);
  });

  const containerVolume = container.length * container.width * container.height;
  const cubeUtilization = containerVolume > 0 ? Math.min(100, (totalVolume / containerVolume) * 100) : 0;

  // Weighted center of gravity, expressed as a % offset from container center
  // on each horizontal axis (0% = perfectly centered). Height-wise we report
  // the mean weighted z as a fraction of container height (lower = more stable).
  let cgX = 0;
  let cgY = 0;
  let cgZ = 0;
  if (totalWeight > 0) {
    placements.forEach((p) => {
      const centerX = p.x + p.length / 2;
      const centerY = p.y + p.width / 2;
      const centerZ = p.z + p.height / 2;
      cgX += centerX * p.weight;
      cgY += centerY * p.weight;
      cgZ += centerZ * p.weight;
    });
    cgX /= totalWeight;
    cgY /= totalWeight;
    cgZ /= totalWeight;
  }

  return {
    containerId,
    container,
    placements,
    totalWeight,
    totalVolume,
    containerVolume,
    cubeUtilization,
    overWeight,
    overHeight,
    overhangDetected,
    anyStackViolation,
    totalValue: placements.reduce((sum, p) => sum + p.value, 0),
    centerOfGravity: {
      x: cgX,
      y: cgY,
      z: cgZ,
      xPct: container.length ? ((cgX - container.length / 2) / (container.length / 2)) * 100 : 0,
      yPct: container.width ? ((cgY - container.width / 2) / (container.width / 2)) * 100 : 0,
      heightPct: container.height ? (cgZ / container.height) * 100 : 0,
    },
    unitCount: placements.length,
  };
}
