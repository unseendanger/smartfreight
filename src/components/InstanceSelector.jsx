import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';

export default function InstanceSelector({ instances, containerLabel, selected, setSelected }) {
  if (instances.length <= 1) return null;
  const inst = instances[selected];

  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <button
        onClick={() => setSelected((s) => Math.max(0, s - 1))}
        disabled={selected === 0}
        className="w-6 h-6 flex items-center justify-center rounded-md bg-ink-800 text-steel-300 hover:bg-ink-700 disabled:opacity-30"
      >
        <ChevronLeft size={13} />
      </button>
      <span className="text-steel-200 px-1">
        {containerLabel} {selected + 1} <span className="text-steel-400">of {instances.length}</span>
      </span>
      <button
        onClick={() => setSelected((s) => Math.min(instances.length - 1, s + 1))}
        disabled={selected === instances.length - 1}
        className="w-6 h-6 flex items-center justify-center rounded-md bg-ink-800 text-steel-300 hover:bg-ink-700 disabled:opacity-30"
      >
        <ChevronRight size={13} />
      </button>
      {(inst?.overhang || inst?.stackViolation) && (
        <span className="flex items-center gap-1 text-signal-coral">
          <TriangleAlert size={12} /> flagged
        </span>
      )}
    </div>
  );
}
