import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X, PackageSearch, TriangleAlert } from 'lucide-react';

const emptyDraft = {
  name: '',
  length: '',
  width: '',
  height: '',
  weight: '',
  value: '',
  fragile: false,
  maxStackWeight: '',
};

function DraftForm({ draft, setDraft, onSubmit, onCancel, submitLabel }) {
  return (
    <div className="space-y-2 p-3 rounded-lg bg-ink-800/70 border border-ink-600">
      <input
        className="input-field"
        placeholder="SKU / Item name"
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      />
      <div className="grid grid-cols-3 gap-2">
        <input type="number" min="0" step="0.1" className="input-field" placeholder="L (in)" value={draft.length} onChange={(e) => setDraft({ ...draft, length: e.target.value })} />
        <input type="number" min="0" step="0.1" className="input-field" placeholder="W (in)" value={draft.width} onChange={(e) => setDraft({ ...draft, width: e.target.value })} />
        <input type="number" min="0" step="0.1" className="input-field" placeholder="H (in)" value={draft.height} onChange={(e) => setDraft({ ...draft, height: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" min="0" step="0.1" className="input-field" placeholder="Weight (lbs)" value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: e.target.value })} />
        <input type="number" min="0" step="1" className="input-field" placeholder="Value ($)" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2 items-center">
        <input
          type="number"
          min="0"
          step="1"
          className="input-field disabled:opacity-40"
          placeholder="Max stack wt (lbs)"
          value={draft.maxStackWeight}
          disabled={draft.fragile}
          onChange={(e) => setDraft({ ...draft, maxStackWeight: e.target.value })}
        />
        <label className="flex items-center gap-2 text-xs text-steel-300 font-mono cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-signal-coral"
            checked={draft.fragile}
            onChange={(e) => setDraft({ ...draft, fragile: e.target.checked, maxStackWeight: e.target.checked ? 0 : draft.maxStackWeight })}
          />
          FRAGILE — no stack
        </label>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded-md text-steel-400 hover:text-steel-200 hover:bg-ink-700 transition-colors">
          <X size={14} /> Cancel
        </button>
        <button onClick={onSubmit} className="flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded-md bg-signal-teal/15 text-signal-teal border border-signal-teal/40 hover:bg-signal-teal/25 transition-colors">
          <Check size={14} /> {submitLabel}
        </button>
      </div>
    </div>
  );
}

export default function InventoryManager({ items, addItem, updateItem, deleteItem }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(emptyDraft);

  const toNumericItem = (d) => ({
    name: d.name || 'Unnamed Item',
    length: Number(d.length) || 0,
    width: Number(d.width) || 0,
    height: Number(d.height) || 0,
    weight: Number(d.weight) || 0,
    value: Number(d.value) || 0,
    fragile: !!d.fragile,
    maxStackWeight: d.fragile ? 0 : Number(d.maxStackWeight) || 0,
  });

  const handleAdd = () => {
    if (!draft.name.trim()) return;
    addItem(toNumericItem(draft));
    setDraft(emptyDraft);
    setAdding(false);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditDraft({ ...item });
  };

  const saveEdit = () => {
    updateItem(editingId, toNumericItem(editDraft));
    setEditingId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="label-eyebrow">Inventory Workspace</p>
          <h2 className="font-display font-semibold text-steel-200">Goods Database</h2>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-md bg-signal-teal text-ink-950 font-medium hover:brightness-110 transition-all"
        >
          <Plus size={14} /> Add Item
        </button>
      </div>

      {adding && <DraftForm draft={draft} setDraft={setDraft} onSubmit={handleAdd} onCancel={() => setAdding(false)} submitLabel="Save Item" />}

      {items.length === 0 && !adding && (
        <div className="flex flex-col items-center gap-2 py-8 text-steel-400 text-sm">
          <PackageSearch size={28} />
          No items in the database yet.
        </div>
      )}

      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
        {items.map((item) =>
          editingId === item.id ? (
            <DraftForm key={item.id} draft={editDraft} setDraft={setEditDraft} onSubmit={saveEdit} onCancel={() => setEditingId(null)} submitLabel="Update" />
          ) : (
            <div key={item.id} className="group p-3 rounded-lg bg-ink-800/50 border border-ink-700 hover:border-ink-600 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-steel-200 truncate">{item.name}</p>
                  <p className="font-mono text-[11px] text-steel-400 mt-0.5">
                    {item.length}×{item.width}×{item.height}" · {item.weight} lbs · ${item.value.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {item.fragile ? (
                      <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-signal-coral/15 text-signal-coral border border-signal-coral/30">
                        <TriangleAlert size={10} /> FRAGILE
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-700 text-steel-400 border border-ink-600">
                        MAX STACK {item.maxStackWeight} lbs
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => startEdit(item)} className="p-1.5 rounded-md text-steel-400 hover:text-signal-teal hover:bg-ink-700">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => deleteItem(item.id)} className="p-1.5 rounded-md text-steel-400 hover:text-signal-coral hover:bg-ink-700">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
