import { Boxes } from 'lucide-react';

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-ink-700 bg-ink-950/90 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-signal-teal/15 border border-signal-teal/40 flex items-center justify-center text-signal-teal">
          <Boxes size={18} />
        </div>
        <div>
          <h1 className="font-display font-semibold text-steel-100 leading-none">SmartFreight Optimizer</h1>
          <p className="text-[11px] font-mono text-steel-400 mt-1">Decision Hub · Local-only, no external APIs</p>
        </div>
      </div>
      <div className="flex items-center gap-2 font-mono text-[11px] text-steel-400">
        <span className="w-1.5 h-1.5 rounded-full bg-signal-teal animate-pulse" />
        LIVE SIMULATION
      </div>
    </header>
  );
}
