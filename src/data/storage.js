// Thin persistence layer over LocalStorage. Every read is defensive (bad JSON
// or a missing key just falls back to the provided default) so a corrupted
// browser storage entry never crashes the app.
const NAMESPACE = 'smartfreight';

const key = (name) => `${NAMESPACE}:${name}`;

export function loadState(name, fallback) {
  try {
    const raw = window.localStorage.getItem(key(name));
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] failed to load "${name}", using fallback`, err);
    return fallback;
  }
}

export function saveState(name, value) {
  try {
    window.localStorage.setItem(key(name), JSON.stringify(value));
  } catch (err) {
    console.warn(`[storage] failed to save "${name}"`, err);
  }
}

export function clearState(name) {
  window.localStorage.removeItem(key(name));
}

// Seed data so the app isn't a blank slate on first load.
export const SEED_ITEMS = [
  {
    id: 'itm_001',
    name: 'Industrial Motor Housing',
    length: 24,
    width: 18,
    height: 16,
    weight: 145,
    value: 2200,
    fragile: false,
    maxStackWeight: 400,
  },
  {
    id: 'itm_002',
    name: 'Server Rack Chassis',
    length: 30,
    width: 24,
    height: 20,
    weight: 210,
    value: 8500,
    fragile: true,
    maxStackWeight: 0,
  },
  {
    id: 'itm_003',
    name: 'Glass Panel Crate',
    length: 40,
    width: 30,
    height: 6,
    weight: 90,
    value: 3100,
    fragile: true,
    maxStackWeight: 0,
  },
  {
    id: 'itm_004',
    name: 'Packaged Steel Fittings (Box)',
    length: 16,
    width: 12,
    height: 12,
    weight: 38,
    value: 410,
    fragile: false,
    maxStackWeight: 250,
  },
];
