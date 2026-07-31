// Preset container geometries used by both the 3D packer and the pricing engine.
// Dimensions are inches (L x W x H), weight caps are lbs.
// "footprint" (L x W) is what the LTL overhang rule checks against.
export const CONTAINERS = {
  ltl_pallet: {
    id: 'ltl_pallet',
    label: 'Standard LTL Pallet',
    shortLabel: 'Pallet',
    length: 48,
    width: 40,
    height: 72,
    maxWeight: 4600,
    footprint: { length: 48, width: 40 }, // used for the overhang fee check
    color: '#3DBFA8',
  },
  uhaul_ubox: {
    id: 'uhaul_ubox',
    label: 'U-Haul U-Box',
    shortLabel: 'U-Box',
    length: 96,
    width: 60,
    height: 90,
    maxWeight: 2000,
    footprint: { length: 96, width: 60 },
    color: '#8B7CE8',
  },
};

export const CONTAINER_LIST = Object.values(CONTAINERS);
