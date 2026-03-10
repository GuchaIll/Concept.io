import { useState, useRef, useEffect } from 'react';
import type { SelectionAction } from '../../hooks/Selection';

export type GenerationMode = 'quick' | 'hd';
export type AssetType = 'foreground' | 'background';

interface SelectionSmartTagProps {
  hasObjectsSelected: boolean;
  activeAction: SelectionAction;
  onActionChange: (action: SelectionAction) => void;
  position: { x: number; y: number };
  onApply: (prompt?: string, model?: 'sd15' | 'sdxl', assetType?: AssetType) => void;
  onCancel: () => void;
  isGenerating?: boolean;
}

// Actions when objects are selected
const objectActions: { id: SelectionAction; icon: string; label: string }[] = [
  { id: 'transform', icon: 'open_with', label: 'Transform' },
  { id: 'edit', icon: 'auto_fix_high', label: 'Edit' },
  { id: 'liquify', icon: 'waves', label: 'Liquify' },
  { id: 'effects', icon: 'auto_awesome', label: 'Effects' },
];

// Actions when no objects are selected (empty region)
const regionActions: { id: SelectionAction; icon: string; label: string }[] = [
  { id: 'generate', icon: 'auto_fix_high', label: 'Generate' },
  { id: 'append', icon: 'add_photo_alternate', label: 'Add Asset' },
];

export const SelectionSmartTag = ({
  hasObjectsSelected,
  activeAction,
  onActionChange,
  position,
  onApply,
  onCancel,
  isGenerating = false,
}: SelectionSmartTagProps) => {
  const actions = hasObjectsSelected ? objectActions : regionActions;
  const [prompt, setPrompt] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [generationMode, setGenerationMode] = useState<GenerationMode>('quick');
  const [assetType, setAssetType] = useState<AssetType>('foreground');
  const inputRef = useRef<HTMLInputElement>(null);

  // Show prompt input when generate action is selected
  useEffect(() => {
    if (activeAction === 'generate' && !hasObjectsSelected) {
      setShowPromptInput(true);
      // Focus input after a short delay
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setShowPromptInput(false);
    }
  }, [activeAction, hasObjectsSelected]);

  const handleApply = () => {
    console.log('handleApply called:', {
      activeAction,
      hasObjectsSelected,
      prompt: prompt.trim(),
      generationMode,
      assetType,
      model: generationMode === 'hd' ? 'sdxl' : 'sd15'
    });
    
    if (activeAction === 'generate' && !hasObjectsSelected) {
      if (prompt.trim()) {
        const model = generationMode === 'hd' ? 'sdxl' : 'sd15';
        console.log('Calling onApply with prompt, model, assetType:', prompt.trim(), model, assetType);
        onApply(prompt.trim(), model, assetType);
      } else {
        console.log('No prompt entered');
      }
    } else {
      console.log('Calling onApply without prompt');
      onApply();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleApply();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div 
      className="absolute z-50 flex flex-col items-center gap-2"
      style={{ 
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, 8px)'
      }}
    >
      {/* Prompt Input (for generate action) */}
      {showPromptInput && (
        <div 
          className="w-[320px] rounded-xl shadow-2xl overflow-hidden mb-2"
          style={{ 
            background: 'rgba(10, 12, 16, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-icons-round text-primary text-lg">auto_fix_high</span>
              <span className="text-xs font-bold text-white">Generate Image</span>
              {isGenerating && (
                <span className="ml-auto flex items-center gap-1 text-[10px] text-primary">
                  <span className="material-icons-round text-xs animate-spin">refresh</span>
                  Generating...
                </span>
              )}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50"
              placeholder="Describe what to generate..."
            />
            {/* Generation Mode Row */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    console.log('Quick mode selected');
                    setGenerationMode('quick');
                  }}
                  className={`text-[10px] px-2 py-1 rounded transition-colors ${
                    generationMode === 'quick'
                      ? 'bg-primary text-white font-semibold'
                      : 'text-white/40 hover:text-white hover:bg-white/10'
                  }`}
                  title="Quick generation (SD 1.5)"
                >
                  ⚡ Quick
                </button>
                <button
                  onClick={() => {
                    console.log('HD mode selected');
                    setGenerationMode('hd');
                  }}
                  className={`text-[10px] px-2 py-1 rounded transition-colors ${
                    generationMode === 'hd'
                      ? 'bg-purple-500 text-white font-semibold'
                      : 'text-white/40 hover:text-white hover:bg-white/10'
                  }`}
                  title="High quality (SDXL)"
                >
                  ✨ HD
                </button>
              </div>
              <span className="text-[10px] text-white/30">
                Press Enter to generate
              </span>
            </div>
            {/* Asset Type Row */}
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/10">
              <span className="text-[10px] text-white/50">Type:</span>
              <button
                onClick={() => setAssetType('foreground')}
                className={`text-[10px] px-2 py-1 rounded transition-colors ${
                  assetType === 'foreground'
                    ? 'bg-emerald-500 text-white font-semibold'
                    : 'text-white/40 hover:text-white hover:bg-white/10'
                }`}
                title="Foreground asset (with background removal)"
              >
                 Foreground
              </button>
              <button
                onClick={() => setAssetType('background')}
                className={`text-[10px] px-2 py-1 rounded transition-colors ${
                  assetType === 'background'
                    ? 'bg-sky-500 text-white font-semibold'
                    : 'text-white/40 hover:text-white hover:bg-white/10'
                }`}
                title="Background asset (keep full image)"
              >
                 Background
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Selector */}
      <div 
        className="flex items-center gap-1 p-1 rounded-xl shadow-2xl"
        style={{ 
          background: 'rgba(10, 12, 16, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => {
              if (action.id === activeAction && action.id === 'generate' && prompt.trim()) {
                // If Generate is already selected and we have a prompt, trigger generation
                handleApply();
              } else {
                onActionChange(action.id);
              }
            }}
            disabled={isGenerating}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all disabled:opacity-50 ${
              activeAction === action.id
                ? 'bg-primary text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
            title={action.label}
          >
            <span className="material-icons-round text-lg">{action.icon}</span>
            <span className="text-xs font-medium">{action.label}</span>
          </button>
        ))}
        
        {/* Divider */}
        <div className="w-px h-6 bg-white/10 mx-1" />
        
        {/* Apply/Generate Button */}
        <button
          onClick={handleApply}
          disabled={isGenerating || (activeAction === 'generate' && !prompt.trim())}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            activeAction === 'generate' && prompt.trim()
              ? 'bg-primary text-white hover:bg-primary/90'
              : 'bg-primary/20 text-primary hover:bg-primary hover:text-white'
          }`}
          title={activeAction === 'generate' ? 'Generate Image' : 'Apply'}
        >
          {isGenerating ? (
            <>
              <span className="material-icons-round text-lg animate-spin">refresh</span>
              <span className="text-xs font-medium">Generating...</span>
            </>
          ) : activeAction === 'generate' && !hasObjectsSelected ? (
            <>
              <span className="material-icons-round text-lg">auto_fix_high</span>
              <span className="text-xs font-medium">Generate</span>
            </>
          ) : (
            <span className="material-icons-round text-lg">check</span>
          )}
        </button>
        
        {/* Cancel Button */}
        <button
          onClick={onCancel}
          disabled={isGenerating}
          className="flex items-center gap-1 px-2 py-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
          title="Cancel (Esc)"
        >
          <span className="material-icons-round text-lg">close</span>
        </button>
      </div>
      
      {/* Hint Text */}
      <div className="text-[10px] text-white/40 bg-black/40 px-2 py-1 rounded">
        {hasObjectsSelected 
          ? activeAction === 'edit'
            ? 'Click Edit to open inpaint / outpaint editor'
            : 'Objects selected • Choose action'
          : activeAction === 'generate'
            ? 'Type a prompt and press Enter'
            : 'Empty region • Generate or add asset'}
      </div>
    </div>
  );
};
