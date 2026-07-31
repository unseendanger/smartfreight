import { DollarSign, Zap, Trophy, Clock, ShieldAlert, ChevronDown } from 'lucide-react';
import { useState } from 'react';

const ICONS = { affordable: DollarSign, fastest: Zap, bestOverall: Trophy };
const ACCENTS = {
  affordable: { text: 'text-signal-teal', border: 'border-signal-teal/40', bg: 'bg-signal-teal/10', ring: 'ring-signal-teal/30' },
  fastest: { text: 'text-signal-coral', border: 'border-signal-coral/40', bg: 'bg-signal-coral/10', ring: 'ring-signal-coral/30' },
  bestOverall: { text: 'text-signal-amber', border: 'border-signal-amber/40', bg: 'bg-signal-amber/10', ring: 'ring-signal-amber/30' },
};

export default function DecisionCard({ option, isBest }) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[option.key];
  const accent = ACCENTS[option.key];

  return (
    <div className={`panel p-4 relative overflow-hidden ${isBest ? `ring-1 ${accent.ring}` : ''}`}>
      {isBest && (
        <span className="absolute top-0 right-0 text-[9px] font-mono px-2 py-0.5 bg-signal-amber text-ink-950 font-semibold rounded-bl-lg">
          RECOMMENDED
        </span>
      )}
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${accent.bg} ${accent.text}`}>
          <Icon size={14} />
        </div>
        <div>
          <p className={`font-display text-sm font-semibold ${accent.text}`}>{option.label}</p>
          <p className="text-[11px] text-steel-400">{option.service}</p>
        </div>
      </div>

      {option.disabled ? (
        <div className="flex items-center gap-2 text-signal-coral text-xs font-mono py-3">
          <ShieldAlert size={14} /> DISABLED — exceeds physical weight threshold
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between mt-3">
            <span className="font-mono text-2xl font-semibold text-steel-100">${option.cost.toLocaleString()}</span>
            <span className="flex items-center gap-1 text-xs text-steel-400 font-mono">
              <Clock size={12} /> {option.transitDays}d transit
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] font-mono">
            <div className="bg-ink-800/60 rounded-md px-2 py-1.5">
              <p className="text-steel-400">$/lb</p>
              <p className="text-steel-200">${option.costPerLb.toFixed(2)}</p>
            </div>
            <div className="bg-ink-800/60 rounded-md px-2 py-1.5">
              <p className="text-steel-400">Value Index</p>
              <p className={accent.text}>{option.valueIndex}/100</p>
            </div>
          </div>

          {option.breakdown.length > 0 && (
            <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 mt-3 text-[11px] font-mono text-steel-400 hover:text-steel-200">
              <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
              {option.breakdown.length} penalty fee{option.breakdown.length > 1 ? 's' : ''} applied
            </button>
          )}
          {open && (
            <div className="mt-2 space-y-1 border-t border-ink-700 pt-2">
              {option.breakdown.map((b, i) => (
                <div key={i} className="flex justify-between text-[11px] font-mono text-steel-400">
                  <span>{b.label}</span>
                  <span className="text-signal-coral">+${b.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
