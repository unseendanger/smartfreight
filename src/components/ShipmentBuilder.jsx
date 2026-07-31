import { Minus, Plus, MapPin, Truck } from 'lucide-react';

export default function ShipmentBuilder({ items, shipment, setQty, setDestination, setAccessorial }) {
  const qtyFor = (itemId) => shipment.lines.find((l) => l.itemId === itemId)?.qty || 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="label-eyebrow">Current Shipment Order</p>
        <h2 className="font-display font-semibold text-steel-200 mb-2">Select Quantities</h2>
        {items.length === 0 ? (
          <p className="text-sm text-steel-400">Add items to the goods database first.</p>
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => {
              const qty = qtyFor(item.id);
              return (
                <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-ink-800/50 border border-ink-700">
                  <span className="text-sm text-steel-300 truncate">{item.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setQty(item.id, qty - 1)}
                      className="w-6 h-6 flex items-center justify-center rounded-md bg-ink-700 text-steel-300 hover:bg-ink-600 disabled:opacity-30"
                      disabled={qty === 0}
                    >
                      <Minus size={12} />
                    </button>
                    <span className="font-mono text-sm w-5 text-center text-signal-teal">{qty}</span>
                    <button onClick={() => setQty(item.id, qty + 1)} className="w-6 h-6 flex items-center justify-center rounded-md bg-ink-700 text-steel-300 hover:bg-ink-600">
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-ink-700 pt-4">
        <p className="label-eyebrow flex items-center gap-1.5"><MapPin size={11} /> Route</p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className="text-[11px] font-mono text-steel-400">Origin Zip</label>
            <input className="input-field mt-1" value={shipment.originZip} onChange={(e) => setDestination('originZip', e.target.value)} maxLength={10} />
          </div>
          <div>
            <label className="text-[11px] font-mono text-steel-400">Destination Zip</label>
            <input className="input-field mt-1" value={shipment.destZip} onChange={(e) => setDestination('destZip', e.target.value)} maxLength={10} />
          </div>
        </div>
      </div>

      <div className="border-t border-ink-700 pt-4">
        <p className="label-eyebrow flex items-center gap-1.5"><Truck size={11} /> Accessorials</p>
        <div className="space-y-2 mt-2">
          <label className="flex items-center justify-between px-3 py-2 rounded-lg bg-ink-800/50 border border-ink-700 cursor-pointer">
            <span className="text-sm text-steel-300">Liftgate Required</span>
            <input type="checkbox" className="accent-signal-teal w-4 h-4" checked={shipment.accessorials.liftgate} onChange={(e) => setAccessorial('liftgate', e.target.checked)} />
          </label>
          <label className="flex items-center justify-between px-3 py-2 rounded-lg bg-ink-800/50 border border-ink-700 cursor-pointer">
            <span className="text-sm text-steel-300">Residential Delivery</span>
            <input type="checkbox" className="accent-signal-teal w-4 h-4" checked={shipment.accessorials.residential} onChange={(e) => setAccessorial('residential', e.target.checked)} />
          </label>
        </div>
      </div>
    </div>
  );
}
