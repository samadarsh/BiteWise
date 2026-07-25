interface MarqueeStripProps {
  items: string[];
  className?: string;
}

/** Infinite horizontal scroll of chips. Pure CSS animation (see .animate-marquee in globals.css) so it never blocks the main thread. */
export function MarqueeStrip({ items, className }: MarqueeStripProps) {
  const track = [...items, ...items];

  return (
    <div className={`group relative overflow-hidden ${className ?? ""}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent sm:w-28" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent sm:w-28" />
      <div className="flex w-max animate-marquee gap-3 group-hover:[animation-play-state:paused]">
        {track.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="shrink-0 rounded-full border border-border-strong bg-surface px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
