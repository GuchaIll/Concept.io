/**
 * ResultPreviewStrip — horizontal scrolling strip of edit results.
 *
 * Shows thumbnails of each generated variation. Click to preview, double-click
 * or click "Apply" to accept, "Discard all" to clear.
 */

interface ResultPreviewStripProps {
  results: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onApply: (index: number) => void;
  onDiscard: () => void;
}

export const ResultPreviewStrip = ({
  results,
  selectedIndex,
  onSelect,
  onApply,
  onDiscard,
}: ResultPreviewStripProps) => {
  if (results.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Strip */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {results.map((img, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            onDoubleClick={() => onApply(i)}
            className={`relative shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${
              selectedIndex === i
                ? 'border-primary ring-1 ring-primary/40'
                : 'border-white/10 hover:border-white/30'
            }`}
          >
            <img src={img} alt={`Result ${i + 1}`} className="w-full h-full object-cover" />
            <span className="absolute bottom-0 right-0 bg-black/60 text-[9px] text-white/70 px-1 rounded-tl">
              #{i + 1}
            </span>
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onApply(selectedIndex)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons-round text-sm">check</span>
          Apply #{selectedIndex + 1}
        </button>
        <button
          onClick={onDiscard}
          className="px-3 py-2 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
};
