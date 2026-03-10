/**
 * MaskPicker — Photoshop-style interactive mask selection.
 *
 * SAM generates ALL object masks as coloured overlays.  The user hovers to
 * preview and clicks (or shift+clicks) to build a selection.  Confirmed
 * mask data is returned to the parent for /cutout/apply.
 */

import React, { useCallback, useRef, useState } from 'react';
import type { MaskProposal } from '../../hooks/useCutout';
import type { CutoutSettings } from '../../types/asset.interface';

interface MaskPickerProps {
  imageData: string;
  proposals: MaskProposal[];
  onConfirm: (maskData: string[], settings: Partial<CutoutSettings>) => void;
  onCancel: () => void;
}

const DEFAULT_SETTINGS: CutoutSettings = {
  featherRadius: 0,
  threshold: 128,
  refineMask: true,
};

const MaskPicker: React.FC<MaskPickerProps> = ({
  imageData,
  proposals,
  onConfirm,
  onCancel,
}) => {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [settings, setSettings] = useState<CutoutSettings>(DEFAULT_SETTINGS);
  const imgRef = useRef<HTMLImageElement>(null);

  // ── Hover: find which proposal's bbox contains the cursor ───────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const img = imgRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;

    // All proposals whose bbox contains the cursor
    const hits = proposals.filter(({ bbox: [bx, by, bw, bh] }) =>
      rx >= bx && rx <= bx + bw && ry >= by && ry <= by + bh
    );

    if (!hits.length) {
      setHoveredId(null);
    } else {
      // Prefer the most specific (smallest area) hit
      const best = hits.reduce((a, b) => (a.areaRatio < b.areaRatio ? a : b));
      setHoveredId(best.id);
    }
  }, [proposals]);

  // ── Click: toggle selection (shift = multi-select) ───────────────
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (hoveredId === null) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (e.shiftKey) {
        if (next.has(hoveredId)) next.delete(hoveredId);
        else next.add(hoveredId);
      } else {
        // Single-click: replace selection (unless re-clicking same mask)
        if (next.has(hoveredId) && next.size === 1) next.clear();
        else { next.clear(); next.add(hoveredId); }
      }
      return next;
    });
  }, [hoveredId]);

  const handleConfirm = useCallback(() => {
    if (!selectedIds.size) return;
    const maskData = [...selectedIds]
      .map(id => proposals.find(p => p.id === id)?.mask)
      .filter(Boolean) as string[];
    onConfirm(maskData, settings);
  }, [selectedIds, proposals, settings, onConfirm]);

  const hoveredProposal = proposals.find(p => p.id === hoveredId) ?? null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-4">
        {/* ── Image + overlays ──────────────────────────────────── */}
        <div
          className="relative flex-1 rounded-xl overflow-hidden bg-[#0a0e17] select-none"
          style={{ cursor: hoveredId !== null ? 'crosshair' : 'default' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredId(null)}
          onClick={handleClick}
        >
          <img
            ref={imgRef}
            src={imageData}
            alt="Source"
            className="w-full h-auto block"
            draggable={false}
          />

          {/* Coloured overlays — stacked on top, pointer-events disabled */}
          {proposals.map(p => {
            const isHovered = p.id === hoveredId;
            const isSelected = selectedIds.has(p.id);
            const opacity = isSelected ? 0.72 : isHovered ? 0.58 : 0.12;

            return (
              <img
                key={p.id}
                src={p.overlay}
                alt=""
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{
                  opacity,
                  transition: 'opacity 80ms ease',
                  mixBlendMode: isSelected || isHovered ? 'normal' : 'multiply',
                }}
                draggable={false}
              />
            );
          })}

          {/* Selected-mask border pulse */}
          {selectedIds.size > 0 && hoveredId !== null && selectedIds.has(hoveredId) && (
            <div className="absolute inset-0 pointer-events-none border-2 border-white/60 rounded-xl animate-pulse" />
          )}

          {/* Hover tooltip */}
          {hoveredProposal && (
            <div className="absolute top-2 left-2 z-10 bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1 text-xs text-white pointer-events-none">
              <span
                className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                style={{ background: `rgb(${hoveredProposal.color.join(',')})` }}
              />
              {(hoveredProposal.areaRatio * 100).toFixed(1)}% area
              {' · '}score {hoveredProposal.compositeScore.toFixed(2)}
              <span className="ml-2 text-white/50">
                {selectedIds.has(hoveredId!) ? '✓ selected — click to deselect' : 'click to select'}
              </span>
            </div>
          )}

          {/* Empty state */}
          {!proposals.length && (
            <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
              SAM unavailable — use auto-cutout instead
            </div>
          )}
        </div>

        {/* ── Proposal list ─────────────────────────────────────── */}
        <div className="w-44 flex-shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
            {proposals.length} regions detected
          </p>
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
            {proposals.map(p => {
              const isSelected = selectedIds.has(p.id);
              const isHovered = p.id === hoveredId;

              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    });
                  }}
                  onMouseEnter={() => setHoveredId(p.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                    isSelected
                      ? 'bg-white/15 text-white'
                      : isHovered
                      ? 'bg-white/10 text-white/80'
                      : 'text-white/50 hover:bg-white/5'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ background: `rgb(${p.color.join(',')})` }}
                  />
                  <span className="text-xs flex-1 truncate">
                    {(p.areaRatio * 100).toFixed(1)}%
                  </span>
                  {isSelected && (
                    <span className="material-icons-round text-sm text-primary">check_circle</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selection hint */}
          <p className="text-[10px] text-white/30 mt-2 leading-relaxed">
            Click to select · Shift+click to add · Click list items to toggle
          </p>
        </div>
      </div>

      {/* ── Edge settings ──────────────────────────────────────── */}
      <div className="border-t border-white/5 pt-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-white/40">Edge Settings</p>

        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50 w-20 flex-shrink-0">Feather</span>
          <input
            type="range" min="0" max="10"
            value={settings.featherRadius}
            onChange={e => setSettings(s => ({ ...s, featherRadius: +e.target.value }))}
            className="flex-1 accent-primary"
          />
          <span className="text-xs text-white/40 w-10 text-right">{settings.featherRadius}px</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50 w-20 flex-shrink-0">Threshold</span>
          <input
            type="range" min="0" max="255"
            value={settings.threshold}
            onChange={e => setSettings(s => ({ ...s, threshold: +e.target.value }))}
            className="flex-1 accent-primary"
          />
          <span className="text-xs text-white/40 w-10 text-right">{settings.threshold}</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50 w-20 flex-shrink-0">Refine edges</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.refineMask}
              onChange={e => setSettings(s => ({ ...s, refineMask: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
          </label>
        </div>
      </div>

      {/* ── Action bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <span className="text-xs text-white/40">
          {selectedIds.size === 0
            ? 'No regions selected'
            : `${selectedIds.size} region${selectedIds.size > 1 ? 's' : ''} selected`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedIds.size}
            className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-semibold
                       hover:bg-primary/80 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed
                       flex items-center gap-1.5"
          >
            <span className="material-icons-round text-sm">cut</span>
            Apply Cutout
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaskPicker;
