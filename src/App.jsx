import { useMemo, useState } from 'react';
import Header from './components/Header';
import InventoryManager from './components/InventoryManager';
import ShipmentBuilder from './components/ShipmentBuilder';
import ContainerViewer3D from './components/ContainerViewer3D';
import ContainerTabs from './components/ContainerTabs';
import LoadingStepSlider from './components/LoadingStepSlider';
import ControlTower from './components/ControlTower';
import { useInventory } from './hooks/useInventory';
import { useShipment } from './hooks/useShipment';
import { runPacking } from './utils/binPacking';
import { generateCarrierOptions } from './utils/pricingEngine';
import { Warehouse, Truck } from 'lucide-react';

export default function App() {
  const { items, addItem, updateItem, deleteItem } = useInventory();
  const { shipment, setContainerId, setQty, setDestination, setAccessorial } = useShipment();
  const [leftTab, setLeftTab] = useState('inventory');
  const [stepIndex, setStepIndex] = useState(null); // null = show full load

  const itemsById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);

  const packResult = useMemo(
    () => runPacking(shipment.containerId, shipment.lines, itemsById),
    [shipment.containerId, shipment.lines, itemsById]
  );

  const carrierResult = useMemo(
    () =>
      generateCarrierOptions(packResult, {
        originZip: shipment.originZip,
        destZip: shipment.destZip,
        accessorials: shipment.accessorials,
      }),
    [packResult, shipment.originZip, shipment.destZip, shipment.accessorials]
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 grid grid-cols-12 gap-4 p-4 max-w-[1800px] mx-auto w-full">
        {/* LEFT: Input tab */}
        <aside className="col-span-3 panel p-4 h-fit">
          <div className="flex gap-1 p-1 rounded-lg bg-ink-800/70 border border-ink-700 mb-4">
            <button
              onClick={() => setLeftTab('inventory')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-mono transition-colors ${
                leftTab === 'inventory' ? 'bg-signal-teal text-ink-950 font-medium' : 'text-steel-400 hover:text-steel-200'
              }`}
            >
              <Warehouse size={13} /> Inventory
            </button>
            <button
              onClick={() => setLeftTab('shipment')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-mono transition-colors ${
                leftTab === 'shipment' ? 'bg-signal-teal text-ink-950 font-medium' : 'text-steel-400 hover:text-steel-200'
              }`}
            >
              <Truck size={13} /> Shipment
            </button>
          </div>

          {leftTab === 'inventory' ? (
            <InventoryManager items={items} addItem={addItem} updateItem={updateItem} deleteItem={deleteItem} />
          ) : (
            <ShipmentBuilder items={items} shipment={shipment} setQty={setQty} setDestination={setDestination} setAccessorial={setAccessorial} />
          )}
        </aside>

        {/* CENTER: 3D canvas */}
        <section className="col-span-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <ContainerTabs activeId={shipment.containerId} onSelect={setContainerId} />
            <span className="font-mono text-[11px] text-steel-400">
              {packResult.unitCount} unit{packResult.unitCount === 1 ? '' : 's'} · {packResult.cubeUtilization.toFixed(1)}% cube used
            </span>
          </div>

          <div className="panel flex-1 min-h-[420px]">
            {packResult.unitCount === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-steel-400 text-sm">
                Select item quantities under the Shipment tab to build a load.
              </div>
            ) : (
              <ContainerViewer3D packResult={packResult} stepIndex={stepIndex} />
            )}
          </div>

          <LoadingStepSlider placements={packResult.placements} stepIndex={stepIndex} setStepIndex={setStepIndex} />
        </section>

        {/* RIGHT: Control tower */}
        <section className="col-span-4 panel p-4 h-fit">
          <ControlTower packResult={packResult} carrierResult={carrierResult} />
        </section>
      </main>
    </div>
  );
}
