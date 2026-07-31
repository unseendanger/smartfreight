import { useEffect, useState, useCallback } from 'react';
import { loadState, saveState } from '../data/storage';

const DEFAULT_SHIPMENT = {
  containerId: 'ltl_pallet',
  lines: [], // [{ itemId, qty }]
  originZip: '30301',
  destZip: '90210',
  accessorials: { liftgate: false, residential: false },
};

export function useShipment() {
  const [shipment, setShipment] = useState(() => loadState('shipment', DEFAULT_SHIPMENT));

  useEffect(() => {
    saveState('shipment', shipment);
  }, [shipment]);

  const setContainerId = useCallback((containerId) => {
    setShipment((prev) => ({ ...prev, containerId }));
  }, []);

  const setQty = useCallback((itemId, qty) => {
    setShipment((prev) => {
      const clean = Math.max(0, Math.floor(Number(qty) || 0));
      const existing = prev.lines.find((l) => l.itemId === itemId);
      let lines;
      if (!existing) {
        lines = clean > 0 ? [...prev.lines, { itemId, qty: clean }] : prev.lines;
      } else if (clean === 0) {
        lines = prev.lines.filter((l) => l.itemId !== itemId);
      } else {
        lines = prev.lines.map((l) => (l.itemId === itemId ? { ...l, qty: clean } : l));
      }
      return { ...prev, lines };
    });
  }, []);

  const setDestination = useCallback((field, value) => {
    setShipment((prev) => ({ ...prev, [field]: value }));
  }, []);

  const setAccessorial = useCallback((field, value) => {
    setShipment((prev) => ({ ...prev, accessorials: { ...prev.accessorials, [field]: value } }));
  }, []);

  const clearLines = useCallback(() => {
    setShipment((prev) => ({ ...prev, lines: [] }));
  }, []);

  return { shipment, setContainerId, setQty, setDestination, setAccessorial, clearLines };
}
