import { useEffect, useState, useCallback } from 'react';
import { loadState, saveState, SEED_ITEMS } from '../data/storage';

let idCounter = 0;
const newId = () => {
  idCounter += 1;
  return `itm_${Date.now()}_${idCounter}`;
};

export function useInventory() {
  const [items, setItems] = useState(() => loadState('inventory', SEED_ITEMS));

  useEffect(() => {
    saveState('inventory', items);
  }, [items]);

  const addItem = useCallback((item) => {
    setItems((prev) => [...prev, { ...item, id: newId() }]);
  }, []);

  const updateItem = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const deleteItem = useCallback((id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  return { items, addItem, updateItem, deleteItem };
}
