import { CONTAINER_LIST } from '../data/containers';

export default function ContainerTabs({ activeId, onSelect }) {
  return (
    <div className="flex gap-1.5 p-1 rounded-lg bg-ink-800/70 border border-ink-700 w-fit">
      {CONTAINER_LIST.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
            activeId === c.id ? 'bg-signal-teal text-ink-950 font-medium' : 'text-steel-400 hover:text-steel-200'
          }`}
        >
          {c.shortLabel}
          <span className="opacity-60 ml-1.5">{c.length}×{c.width}×{c.height}"</span>
        </button>
      ))}
    </div>
  );
}
