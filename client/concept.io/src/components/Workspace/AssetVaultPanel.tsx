import { useState, useMemo, useRef } from 'react';
import { useAssetContext, type IAsset } from '../../contexts/AssetContext';

interface AssetVaultPanelProps {
  onClose?: () => void;
  onAssetSelect: (asset: IAsset) => void;
}

type TabType = 'all' | 'history' | 'favorites';
type CategoryType = 'Textures' | 'Characters' | 'Props' | 'UI' | null;

interface ContextMenuPosition {
  x: number;
  y: number;
}

export const AssetVaultPanel = ({ onAssetSelect }: AssetVaultPanelProps) => {
  const {
    searchQuery,
    isLoading,
    setSearchQuery,
    getFilteredAssets,
    deleteAsset,
    createAsset,
  } = useAssetContext();

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [activeCategory, setActiveCategory] = useState<CategoryType>('Textures');
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadCategory, setUploadCategory] = useState<CategoryType>('Props');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadDimensions, setUploadDimensions] = useState({ width: 0, height: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredAssets = getFilteredAssets();

  // Group assets by category
  const assetsByCategory = useMemo(() => {
    const grouped: Record<string, IAsset[]> = {
      'Textures': [],
      'Characters': [],
      'Props': [],
      'UI': [],
    };
    
    filteredAssets.forEach(asset => {
      const category = asset.category || 'Props';
      if (grouped[category]) {
        grouped[category].push(asset);
      } else {
        grouped['Props'].push(asset);
      }
    });

    return grouped;
  }, [filteredAssets]);

  // Get assets for current category
  const currentAssets = activeCategory ? assetsByCategory[activeCategory] : filteredAssets;

  const handleDragStart = (e: React.DragEvent, asset: IAsset) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'asset',
      assetId: asset.id,
      name: asset.name,
      imageData: asset.imageData,
      width: asset.width,
      height: asset.height,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const categories: { id: CategoryType; label: string }[] = [
    { id: 'Textures', label: 'TEXTURES' },
    { id: 'Characters', label: 'CHARACTERS' },
    { id: 'Props', label: 'PROPS' },
    { id: 'UI', label: 'UI' },
  ];

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // File upload handlers
  const handleUploadClick = () => {
    closeContextMenu();
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Read file and create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      setUploadPreview(imageData);
      
      // Get image dimensions
      const img = new Image();
      img.onload = () => {
        setUploadDimensions({ width: img.width, height: img.height });
      };
      img.src = imageData;
      
      // Set default name from filename
      setUploadName(file.name.replace(/\.[^/.]+$/, '')); // Remove extension
      setShowUploadModal(true);
    };
    reader.readAsDataURL(file);
    
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleUploadConfirm = () => {
    if (!uploadPreview || !uploadName.trim()) {
      alert('Please provide a name for the asset');
      return;
    }

    // Create the asset
    const tags = uploadTags.split(',').map(t => t.trim()).filter(t => t);
    createAsset(
      uploadName.trim(),
      uploadPreview,
      tags,
      uploadCategory || 'Props',
      uploadDimensions.width,
      uploadDimensions.height
    );

    // Reset upload state
    setShowUploadModal(false);
    setUploadPreview(null);
    setUploadName('');
    setUploadCategory('Props');
    setUploadTags('');
    setUploadDimensions({ width: 0, height: 0 });
  };

  const handleUploadCancel = () => {
    setShowUploadModal(false);
    setUploadPreview(null);
    setUploadName('');
    setUploadCategory('Props');
    setUploadTags('');
    setUploadDimensions({ width: 0, height: 0 });
  };

  const handleGenerateClick = () => {
    closeContextMenu();
    // TODO: Implement AI generation feature
    alert('AI Generation feature coming soon!');
  };

  return (
    <aside 
      className="absolute right-6 top-24 bottom-24 w-72 flex flex-col gap-4 z-20"
      onContextMenu={handleContextMenu}
      onClick={closeContextMenu}
    >
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      
      <div className="glass-panel flex-1 rounded-3xl thin-border overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest uppercase text-white/50">LIBRARY</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-white/30 hover:text-white transition-colors">
              <span className="material-icons-round text-lg">person</span>
            </button>
            <button className="text-white/30 hover:text-white transition-colors">
              <span className="material-icons-round text-lg">more_vert</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:ring-1 focus:ring-primary focus:border-primary placeholder-white/30"
              placeholder="Search Nanobana assets..."
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 flex gap-4 border-b border-white/5">
          <button
            onClick={() => setActiveTab('all')}
            className={`pb-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'all' 
                ? 'text-white border-b-2 border-primary' 
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            All Assets
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'history' 
                ? 'text-white border-b-2 border-primary' 
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            History
          </button>
          <button
            onClick={() => setActiveTab('favorites')}
            className={`pb-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'favorites' 
                ? 'text-white border-b-2 border-primary' 
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Favorites
          </button>
        </div>

        {/* Category Pills */}
        <div className="px-4 py-3 flex gap-2 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
                activeCategory === cat.id
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-white/5 text-white/50 border border-white/10 hover:text-white/70 hover:bg-white/10'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Asset Grid */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-symbols-outlined text-3xl text-white/30 animate-spin">refresh</span>
            </div>
          ) : currentAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <span className="material-symbols-outlined text-4xl text-white/20">folder_open</span>
              <p className="text-white/40 text-xs">No assets found</p>
              <p className="text-white/30 text-[9px] text-center">Save layers as assets to populate vault</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {currentAssets.map(asset => (
                <div
                  key={asset.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, asset)}
                  onClick={() => onAssetSelect(asset)}
                  className="group relative aspect-square bg-white/5 border border-white/10 rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 transition-all"
                >
                  <img
                    src={asset.thumbnailData || asset.imageData}
                    alt={asset.name}
                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent">
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="text-[10px] font-medium text-white truncate">{asset.name}</p>
                    </div>
                  </div>
                  
                  {/* Quick delete on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${asset.name}"?`)) {
                        deleteAsset(asset.id);
                      }
                    }}
                    className="absolute top-2 right-2 p-1 bg-red-500/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span className="material-icons-round text-white text-xs">close</span>
                  </button>

                  {/* Generating indicator placeholder */}
                  {asset.name === 'generating' && (
                    <div className="absolute inset-0 bg-white/5 flex flex-col items-center justify-center">
                      <span className="material-symbols-outlined text-white/30 animate-spin">refresh</span>
                      <p className="text-[8px] text-white/30 mt-1 uppercase tracking-wider">Generating...</p>
                    </div>
                  )}
                </div>
              ))}

              {/* Add Asset Placeholder */}
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  handleUploadClick();
                }}
                className="aspect-square bg-white/5 border border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-white/10 transition-all"
              >
                <span className="material-symbols-outlined text-white/30 text-xl">add</span>
                <p className="text-[8px] text-white/30 uppercase tracking-wider">Add Asset</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Art Lead Message */}
        <div className="p-3 border-t border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3 bg-white/5 rounded-xl p-2">
            <div className="relative w-8 h-8 rounded-full overflow-hidden border border-white/10 shrink-0">
              <div className="w-full h-full bg-gradient-to-br from-primary/50 to-purple-500/50 flex items-center justify-center">
                <span className="text-[10px] font-bold">AL</span>
              </div>
              <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border border-background-dark rounded-full"></div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold text-primary uppercase tracking-wider">Art Lead</p>
              <p className="text-[10px] text-white/50 truncate">"Lighting looks off here, try a c..."</p>
            </div>
            <button className="text-white/30 hover:text-primary transition-colors">
              <span className="material-icons-round text-sm">expand_less</span>
            </button>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed glass-panel rounded-xl thin-border shadow-2xl py-2 min-w-[160px] z-50"
          style={{ 
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            top: Math.min(contextMenu.y, window.innerHeight - 120)
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleUploadClick}
            className="w-full px-4 py-2.5 text-left text-xs text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-3 transition-colors"
          >
            <span className="material-symbols-outlined text-base">upload</span>
            Upload Asset
          </button>
          <button
            onClick={handleGenerateClick}
            className="w-full px-4 py-2.5 text-left text-xs text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-3 transition-colors"
          >
            <span className="material-symbols-outlined text-base">auto_awesome</span>
            Generate with AI
          </button>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={handleUploadCancel}
        >
          <div 
            className="glass-panel rounded-2xl thin-border shadow-2xl w-[400px] max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Upload Asset</h3>
              <button 
                onClick={handleUploadCancel}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <span className="material-icons-round text-white/50 text-lg">close</span>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 space-y-4">
              {/* Preview */}
              {uploadPreview && (
                <div className="relative aspect-video bg-white/5 rounded-xl overflow-hidden border border-white/10">
                  <img 
                    src={uploadPreview} 
                    alt="Preview" 
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white/70">
                    {uploadDimensions.width} × {uploadDimensions.height}
                  </div>
                </div>
              )}

              {/* Name Input */}
              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-2">
                  Asset Name
                </label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder-white/30"
                  placeholder="Enter asset name..."
                />
              </div>

              {/* Category Select */}
              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-2">
                  Category
                </label>
                <div className="flex gap-2 flex-wrap">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setUploadCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
                        uploadCategory === cat.id
                          ? 'bg-primary/20 text-primary border border-primary/30'
                          : 'bg-white/5 text-white/50 border border-white/10 hover:text-white/70'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags Input */}
              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-2">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder-white/30"
                  placeholder="e.g., sci-fi, metal, rust"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/5 flex gap-3">
              <button
                onClick={handleUploadCancel}
                className="flex-1 py-2.5 bg-white/5 text-white/70 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadConfirm}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-primary/80 transition-colors"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
