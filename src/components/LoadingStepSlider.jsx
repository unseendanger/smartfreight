import { ListOrdered } from 'lucide-react';

export default function LoadingStepSlider({ placements, stepIndex, setStepIndex }) {
  const total = placements.length;
  const current = stepIndex === null ? total : stepIndex;
  const activeItem = current > 0 ? placements[current - 1] : null;

  return (
    <div className="panel px-4 py-3 flex items-center gap-4">
      <div className="flex items-center gap-2 shrink-0">
        <ListOrdered size={14} className="text-signal-amber" />
        <span className="label-eyebrow">Loading Guide</span>
      </div>

      <input
        type="range"
        min={0}
        max={total}
        step={1}
        value={current}
        onChange={(e) => {
          const v = Number(e.target.value);
          setStepIndex(v === total ? null : v);
        }}
        className="flex-1 accent-signal-amber cursor-pointer"
        disabled={total === 0}
      />

      <div className="font-mono text-xs text-steel-300 w-16 text-right shrink-0">
        {current}/{total}
      </div>

      <div className="w-56 shrink-0 text-right">
        {activeItem ? (
          <span className="text-xs text-steel-200 truncate block">
            Step {current}: <span className="text-signal-amber">{activeItem.name}</span>
          </span>
        ) : (
          <span className="text-xs text-steel-400">Full load view</span>
        )}
      </div>
    </div>
  );
}
