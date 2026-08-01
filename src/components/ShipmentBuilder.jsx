import { Minus, Plus, MapPin, Truck, ArrowUpDown } from 'lucide-react';
import { CONTAINERS } from '../data/containers';

export default function ShipmentBuilder({ items, shipment, setQty, setDestination, setAccessorial, setPalletHeight }) {
  const qtyFor = (itemId) => shipment.lines.find((l) => l.itemId === itemId)?.qty || 0;
  const { standardHeight, maxHeightCap } = CONTAINERS.ltl_pallet;
  const isPallet = shipment.containerId === 'ltl_pallet';
  const extraInches = shipment.palletHeight - standardHeight;

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
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="w-14 bg-ink-900 border border-ink-600 rounded-md text-center font-mono text-sm text-signal-teal py-1 focus:border-signal-teal focus:ring-1 focus:ring-signal-teal/40 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={qty}
                      onChange={(e) => setQty(item.id, e.target.value)}
                      onFocus={(e) => e.target.select()}
                    />
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

      {isPallet && (
        <div className="border-t border-ink-700 pt-4">
          <p className="label-eyebrow flex items-center gap-1.5"><ArrowUpDown size={11} /> Pallet Height</p>
          <p className="text-[11px] text-steel-400 mt-1 mb-2">
            Standard is {standardHeight}". Carriers will quote up to {maxHeightCap}" as a non-standard pallet — raising it can mean fewer
            pallets, traded off against an extended-height surcharge per pallet.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={standardHeight}
              max={maxHeightCap}
              step={1}
              value={shipment.palletHeight}
              onChange={(e) => setPalletHeight(e.target.value)}
              className="flex-1 accent-signal-amber cursor-pointer"
            />
            <span className="font-mono text-sm text-signal-amber w-16 text-right shrink-0">{shipment.palletHeight}"</span>
          </div>
          {extraInches > 0 && (
            <p className="text-[11px] font-mono text-signal-amber mt-1.5">+{extraInches}" over standard — surcharge applies per pallet</p>
          )}
        </div>
      )}

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
