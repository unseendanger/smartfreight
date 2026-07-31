import { Gauge, Scale, Box, TriangleAlert, RadioTower, Layers } from 'lucide-react';
import DecisionCard from './DecisionCard';

function ReadoutTile({ icon: Icon, label, value, sub, warn }) {
  return (
    <div className={`bg-ink-800/60 rounded-lg p-3 border ${warn ? 'border-signal-coral/50' : 'border-ink-700'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className={warn ? 'text-signal-coral' : 'text-steel-400'} />
        <span className="label-eyebrow">{label}</span>
      </div>
      <p className={`font-mono text-lg font-semibold ${warn ? 'text-signal-coral' : 'text-steel-100'}`}>{value}</p>
      {sub && <p className="text-[11px] text-steel-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ControlTower({ packResult, carrierResult }) {
  const { options } = carrierResult;
  const bestKey = Object.values(options).reduce((best, o) => (o.valueIndex > (options[best]?.valueIndex ?? -1) ? o.key : best), 'bestOverall');

  const totalPenalties = Object.values(options).reduce((sum, o) => sum + o.breakdown.reduce((s, b) => s + b.amount, 0), 0);
  const totalBase = Object.values(options).reduce((sum, o) => sum + (o.cost - o.breakdown.reduce((s, b) => s + b.amount, 0)), 0);

  const violations = [];
  if (packResult.overhangDetected) violations.push('Item(s) exceed the container footprint — overhang flagged.');
  if (packResult.overHeight) violations.push('A single item is taller than this container on its own — it can\'t be split, so it\'s placed and flagged for manual review.');
  if (packResult.overWeight) violations.push('A single item alone exceeds this container\'s max weight rating — flagged for manual review.');
  if (packResult.anyStackViolation) violations.push('A fragile or stack-limited item has weight resting on top of it.');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <RadioTower size={15} className="text-signal-teal" />
        <div>
          <p className="label-eyebrow">Live Monitor</p>
          <h2 className="font-display font-semibold text-steel-200">Logistics Control Tower</h2>
        </div>
      </div>

      {packResult.totalContainers > 1 && (
        <div className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 p-3 flex items-start gap-2 text-xs text-signal-amber">
          <Box size={14} className="mt-0.5 shrink-0" />
          <span>
            This load exceeds one {packResult.container.shortLabel}'s capacity — automatically split across{' '}
            <strong>{packResult.totalContainers} {packResult.container.shortLabel}s</strong>. Page through them in the 3D viewer above.
          </span>
        </div>
      )}

      {violations.length > 0 && (
        <div className="rounded-lg border border-signal-coral/40 bg-signal-coral/10 p-3 space-y-1">
          {violations.map((v, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-signal-coral">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              <span>{v}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <DecisionCard option={options.affordable} isBest={bestKey === 'affordable'} />
        <DecisionCard option={options.fastest} isBest={bestKey === 'fastest'} />
        <DecisionCard option={options.bestOverall} isBest={bestKey === 'bestOverall'} />
      </div>

      <div>
        <p className="label-eyebrow mb-2">Efficiency Readouts</p>
        <div className="grid grid-cols-5 gap-3">
          <ReadoutTile
            icon={Layers}
            label={`${packResult.container.shortLabel}s Required`}
            value={packResult.totalContainers}
            sub={packResult.totalContainers > 1 ? 'Auto-split load' : 'Fits in one'}
            warn={false}
          />
          <ReadoutTile icon={Box} label="Avg Cube Utilization" value={`${packResult.cubeUtilization.toFixed(1)}%`} sub={`${packResult.unitCount} units loaded`} />
          <ReadoutTile
            icon={Scale}
            label="Total Weight"
            value={`${packResult.totalWeight.toLocaleString()} lbs`}
            sub={`${packResult.container.maxWeight.toLocaleString()} lbs cap / unit`}
            warn={packResult.overWeight}
          />
          <ReadoutTile icon={Gauge} label="Base Cost (avg)" value={`$${Math.round(totalBase / 3).toLocaleString()}`} sub="Across 3 options" />
          <ReadoutTile icon={TriangleAlert} label="Penalty Fees" value={`$${totalPenalties.toLocaleString()}`} sub="Total across options" warn={totalPenalties > 0} />
        </div>
      </div>
    </div>
  );
}
