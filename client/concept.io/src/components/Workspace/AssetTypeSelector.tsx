/**
 * AssetTypeSelector - Component for selecting asset type (background/foreground)
 *
 * Foreground flow (Photoshop-style interactive mask picker):
 *   1. "loading-proposals"  â€” SAM generates all object masks
 *   2. "picking"            â€” user hovers / clicks to select region(s)
 *   3. "applying"           â€” selected masks applied to produce RGBA cutout
 *   4. "preview"            â€” side-by-side original vs result + edge settings
 *   fallback: if SAM unavailable, jumps straight to legacy auto-cutout preview
 */

import React, { useState } from 'react';
import { AssetTypeValues } from '../../types/asset.interface';
import type { CutoutSettings, AssetType } from '../../types/asset.interface';
import { useCutout } from '../../hooks/useCutout';
import type { MaskProposal } from '../../hooks/useCutout';
import MaskPicker from './MaskPicker';

type ForegroundStep = 'idle' | 'loading-proposals' | 'picking' | 'applying' | 'preview';

interface AssetTypeSelectorProps {
  imageData: string;
  onTypeSelected: (
    type: AssetType,
    processedImageData: string,
    originalImageData?: string,
    cutoutSettings?: CutoutSettings
  ) => void;
  onCancel: () => void;
}

const DEFAULT_CUTOUT_SETTINGS: CutoutSettings = {
  featherRadius: 0,
  threshold: 128,
  refineMask: true,
};

export const AssetTypeSelector: React.FC<AssetTypeSelectorProps> = ({
  imageData,
  onTypeSelected,
  onCancel,
}) => {
  const [selectedType, setSelectedType] = useState<AssetType>(AssetTypeValues.Background);
  const [fgStep, setFgStep] = useState<ForegroundStep>('idle');
  const [proposals, setProposals] = useState<MaskProposal[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [appliedSettings, setAppliedSettings] = useState<CutoutSettings>(DEFAULT_CUTOUT_SETTINGS);

  const { isProcessing, error, getProposals, applyMask, processImage } = useCutout();

  // â”€â”€ Kick off foreground processing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleStartForeground = async () => {
    setFgStep('loading-proposals');
    setProposals([]);
    setPreviewImage(null);

    const result = await getProposals(imageData, 12);

    if (result.success && result.proposals.length > 0) {
      setProposals(result.proposals);
      setFgStep('picking');
    } else {
      // SAM unavailable â€” fall back to legacy auto-cutout
      console.warn('[AssetTypeSelector] No proposals from SAM, falling back to processImage');
      setFgStep('applying');
      const cutout = await processImage(imageData, DEFAULT_CUTOUT_SETTINGS);
      if (cutout.success && cutout.imageData) {
        setPreviewImage(cutout.imageData);
      }
      setFgStep('preview');
    }
  };

  // â”€â”€ User confirmed mask selection â†’ apply â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleMaskConfirm = async (maskData: string[], settings: Partial<CutoutSettings>) => {
    const finalSettings = { ...DEFAULT_CUTOUT_SETTINGS, ...settings };
    setAppliedSettings(finalSettings);
    setFgStep('applying');

    const result = await applyMask(imageData, maskData, finalSettings);
    if (result.success && result.imageData) {
      setPreviewImage(result.imageData);
    }
    setFgStep('preview');
  };

  const handleReprocess = () => {
    setFgStep('idle');
    setProposals([]);
    setPreviewImage(null);
  };

  const handleConfirm = () => {
    if (selectedType === AssetTypeValues.Foreground) {
      onTypeSelected(selectedType, previewImage || imageData, imageData, appliedSettings);
    } else {
      onTypeSelected(selectedType, imageData);
    }
  };

  const handleTypeSelect = (type: AssetType) => {
    setSelectedType(type);
    if (type === AssetTypeValues.Foreground && fgStep === 'idle') {
      handleStartForeground();
    }
  };

  // â”€â”€ Derived flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const isForeground = selectedType === AssetTypeValues.Foreground;
  const isPicking = fgStep === 'picking';
  const isBusy = fgStep === 'loading-proposals' || fgStep === 'applying' || isProcessing;
  const modalWidth = isPicking ? 'w-[820px]' : 'w-[600px]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className={`bg-[#1a2130] rounded-2xl border border-white/10 ${modalWidth} max-h-[90vh] overflow-y-auto transition-all duration-200`}>

        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#1a2130] z-10">
          <div>
            <h2 className="text-sm font-bold tracking-widest uppercase text-white/60">Select Asset Type</h2>
            <p className="text-xs text-white/40 mt-1">
              {isPicking
                ? 'Hover to preview Â· Click to select Â· Shift+click for multi-select'
                : 'Choose how this asset will be used'}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/30 bg-white/5 hover:bg-white/10"
          >
            <span className="material-icons-round text-lg">close</span>
          </button>
        </div>

        {/* Type Selection */}
        <div className="p-4 flex gap-4">
          <button
            onClick={() => handleTypeSelect(AssetTypeValues.Background)}
            className={`flex-1 p-4 rounded-xl border transition-all ${
              selectedType === AssetTypeValues.Background
                ? 'border-primary bg-primary/10'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className={`material-icons-round text-2xl ${
                selectedType === AssetTypeValues.Background ? 'text-primary' : 'text-white/40'
              }`}>wallpaper</span>
              <span className={`font-semibold ${
                selectedType === AssetTypeValues.Background ? 'text-white' : 'text-white/60'
              }`}>Background</span>
            </div>
            <p className="text-xs text-white/40 text-left">
              Full image without transparency. Use for backdrops, environments, and base plates.
            </p>
          </button>

          <button
            onClick={() => handleTypeSelect(AssetTypeValues.Foreground)}
            className={`flex-1 p-4 rounded-xl border transition-all ${
              isForeground ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className={`material-icons-round text-2xl ${isForeground ? 'text-primary' : 'text-white/40'}`}>
                auto_fix_high
              </span>
              <span className={`font-semibold ${isForeground ? 'text-white' : 'text-white/60'}`}>
                Foreground
              </span>
            </div>
            <p className="text-xs text-white/40 text-left">
              Background removed for layering. Use for characters, props, and objects.
            </p>
          </button>
        </div>

        {/* â”€â”€ Foreground steps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}

        {/* Loading proposals */}
        {isForeground && fgStep === 'loading-proposals' && (
          <div className="px-4 pb-4">
            <div className="border border-white/10 rounded-xl p-8 flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-white/60">Analyzing image with SAMâ€¦</p>
              <p className="text-xs text-white/30">Generating object masks for interactive selection</p>
            </div>
          </div>
        )}

        {/* Interactive mask picker */}
        {isForeground && fgStep === 'picking' && (
          <div className="px-4 pb-4">
            <div className="border border-white/10 rounded-xl overflow-hidden">
              <div className="p-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-icons-round text-primary text-lg">select_all</span>
                  <span className="text-xs font-bold text-white/60 uppercase tracking-wider">
                    Select Object
                  </span>
                </div>
                <span className="text-xs text-white/30">{proposals.length} regions detected by SAM</span>
              </div>
              <MaskPicker
                imageData={imageData}
                proposals={proposals}
                onConfirm={handleMaskConfirm}
                onCancel={onCancel}
              />
            </div>
          </div>
        )}

        {/* Applying mask */}
        {isForeground && fgStep === 'applying' && (
          <div className="px-4 pb-4">
            <div className="border border-white/10 rounded-xl p-8 flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-white/60">Applying maskâ€¦</p>
            </div>
          </div>
        )}

        {/* Preview */}
        {isForeground && fgStep === 'preview' && (
          <div className="px-4 pb-4">
            <div className="border border-white/10 rounded-xl overflow-hidden">
              <div className="p-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs font-bold text-white/60 uppercase tracking-wider">
                  Cutout Preview
                </span>
                <button
                  onClick={handleReprocess}
                  className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                >
                  <span className="material-icons-round text-sm">refresh</span>
                  Re-select
                </button>
              </div>

              <div className="flex">
                <div className="flex-1 p-4 border-r border-white/5">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Original</p>
                  <div className="aspect-video bg-[#0a0e17] rounded-lg overflow-hidden flex items-center justify-center">
                    <img src={imageData} alt="Original" className="max-w-full max-h-full object-contain" />
                  </div>
                </div>
                <div className="flex-1 p-4">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Cutout</p>
                  <div
                    className="aspect-video rounded-lg overflow-hidden flex items-center justify-center"
                    style={{
                      backgroundImage: 'linear-gradient(45deg,#333 25%,transparent 25%),linear-gradient(-45deg,#333 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#333 75%),linear-gradient(-45deg,transparent 75%,#333 75%)',
                      backgroundSize: '20px 20px',
                      backgroundPosition: '0 0,0 10px,10px -10px,-10px 0',
                      backgroundColor: '#222',
                    }}
                  >
                    {error ? (
                      <div className="text-center p-4">
                        <span className="material-icons-round text-red-400 text-2xl mb-2">error</span>
                        <p className="text-xs text-red-400">{error}</p>
                      </div>
                    ) : previewImage ? (
                      <img src={previewImage} alt="Cutout" className="max-w-full max-h-full object-contain" />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {(selectedType === AssetTypeValues.Background || fgStep === 'preview') && (
          <div className="p-4 border-t border-white/5 flex items-center justify-end gap-3">
            <button onClick={onCancel} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isBusy}
              className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span className="material-icons-round text-sm">check</span>
              Confirm
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetTypeSelector;
