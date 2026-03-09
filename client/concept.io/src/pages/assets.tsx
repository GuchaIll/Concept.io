import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssetContext, ASSET_CATEGORIES, type IAsset } from '../contexts/AssetContext';
import { useSession } from '../contexts/SessionContext';
import { useWebSocket } from '../hooks/useWebSocket';

const AssetVaultPage = () => {
  const navigate = useNavigate();
  const { projectId, userId } = useSession();
  const [activeTab, setActiveTab] = useState<'all' | 'recent' | 'favorites' | 'shared'>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [_draggedAsset, setDraggedAsset] = useState<IAsset | null>(null);

  // Connect to WebSocket
  const { socket, isConnected, error: wsError } = useWebSocket({
    projectId,
    userId,
    autoConnect: true,
  });

  // Use asset context
  const {
    selectedAssetId,
    searchQuery,
    isLoading,
    error,
    selectAsset,
    deleteAsset,
    setSearchQuery,
    getFilteredAssets,
    getAllTags,
    setSelectedTags,
    selectedTags,
    setSocket,
  } = useAssetContext();

  // Connect socket to asset context
  useMemo(() => {
    setSocket(socket);
  }, [socket, setSocket]);

  // Get filtered and grouped assets
  const filteredAssets = getFilteredAssets();
  const allTags = getAllTags();

  // Group assets by category
  const assetsByCategory = useMemo(() => {
    const grouped: Record<string, IAsset[]> = {};
    
    filteredAssets.forEach(asset => {
      const category = asset.category || 'Other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(asset);
    });

    return grouped;
  }, [filteredAssets]);

  // Handle asset click
  const handleAssetClick = (assetId: string) => {
    selectAsset(assetId === selectedAssetId ? null : assetId);
  };

  // Handle drag start for placing asset on canvas
  const handleDragStart = (e: React.DragEvent, asset: IAsset) => {
    setDraggedAsset(asset);
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

  // Handle placing asset on canvas
  const handlePlaceOnCanvas = (asset: IAsset) => {
    // Navigate to canvas with the asset to place
    navigate('/canvas', { 
      state: { 
        placeAsset: {
          assetId: asset.id,
          name: asset.name,
          imageData: asset.imageData,
          width: asset.width,
          height: asset.height,
        }
      }
    });
  };

  // Handle tag filter
  const handleTagClick = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  // Handle close/back
  const handleClose = () => {
    navigate('/canvas');
  };

  return (
    <div className="bg-[#0a0e17] text-slate-100 font-display overflow-hidden h-screen flex flex-col">
      {/* Header */}
      <div className="h-12 w-full flex items-center justify-between px-6 bg-[#0a0e17] border-b border-[#2d364d]/30">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleClose}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <span className="material-icons-round text-xl">arrow_back</span>
          </button>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
            <span className="text-xs text-slate-500">{isConnected ? 'Connected' : 'Connecting...'}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <div className="w-6 h-6 rounded-full border-2 border-[#0a0e17] bg-primary flex items-center justify-center text-[10px] font-bold">JD</div>
            <div className="w-6 h-6 rounded-full border-2 border-[#0a0e17] bg-purple-500 flex items-center justify-center text-[10px] font-bold">AK</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Search & Filters */}
        <div className="p-4 bg-[#0a0e17]/80 backdrop-blur-md z-30">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">folder_shared</span>
              Asset Vault
            </h1>
            <button 
              onClick={() => setShowUploadModal(true)}
              className="p-2 bg-primary hover:bg-primary/80 rounded-lg text-white transition-colors"
            >
              <span className="material-symbols-outlined text-xl">add</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#121826] border border-[#2d364d] rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-600 transition-all"
              placeholder="Search assets..."
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mt-4 overflow-x-auto hide-scrollbar pb-1">
            <button 
              onClick={() => setActiveTab('all')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                activeTab === 'all' 
                  ? 'bg-primary text-white' 
                  : 'bg-[#121826] border border-[#2d364d] text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button 
              onClick={() => setActiveTab('recent')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                activeTab === 'recent' 
                  ? 'bg-primary text-white' 
                  : 'bg-[#121826] border border-[#2d364d] text-slate-400 hover:text-white'
              }`}
            >
              Recent
            </button>
            <button 
              onClick={() => setActiveTab('favorites')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                activeTab === 'favorites' 
                  ? 'bg-primary text-white' 
                  : 'bg-[#121826] border border-[#2d364d] text-slate-400 hover:text-white'
              }`}
            >
              Favorites
            </button>
            <button 
              onClick={() => setActiveTab('shared')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                activeTab === 'shared' 
                  ? 'bg-primary text-white' 
                  : 'bg-[#121826] border border-[#2d364d] text-slate-400 hover:text-white'
              }`}
            >
              Shared
            </button>
          </div>

          {/* Tag Filters */}
          {allTags.length > 0 && (
            <div className="flex gap-2 mt-3 overflow-x-auto hide-scrollbar pb-1">
              {allTags.slice(0, 10).map(tag => (
                <button
                  key={tag.name}
                  onClick={() => handleTagClick(tag.name)}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${
                    selectedTags.includes(tag.name)
                      ? 'text-white'
                      : 'bg-[#121826] border border-[#2d364d] text-slate-400 hover:text-white'
                  }`}
                  style={selectedTags.includes(tag.name) ? { backgroundColor: tag.color } : {}}
                >
                  #{tag.name} ({tag.count})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Asset Grid */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-24">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <span className="material-symbols-outlined text-4xl text-slate-600 animate-spin">refresh</span>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <span className="material-symbols-outlined text-6xl text-slate-600">folder_open</span>
              <p className="text-slate-500 text-sm">No assets found</p>
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-4 py-2 bg-primary hover:bg-primary/80 rounded-lg text-sm font-medium transition-colors"
              >
                Add Your First Asset
              </button>
            </div>
          ) : (
            Object.entries(assetsByCategory).map(([category, categoryAssets]) => (
              <section key={category} className="mb-8">
                <div className="flex items-center justify-between mb-4 sticky top-0 bg-[#0a0e17]/95 py-2 z-10">
                  <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-primary">#{category}</h2>
                  <span className="text-[10px] text-slate-500 font-medium">{categoryAssets.length} ASSETS</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {categoryAssets.map(asset => (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, asset)}
                      onClick={() => handleAssetClick(asset.id)}
                      onDoubleClick={() => handlePlaceOnCanvas(asset)}
                      className={`group relative aspect-square bg-[#121826] border rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-105 ${
                        selectedAssetId === asset.id 
                          ? 'border-primary ring-2 ring-primary/30' 
                          : 'border-[#2d364d] hover:border-primary/50'
                      }`}
                    >
                      <img
                        src={asset.thumbnailData || asset.imageData}
                        alt={asset.name}
                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-2.5">
                        <p className="text-[10px] font-medium text-slate-100 truncate">{asset.name}</p>
                        {asset.tags.length > 0 && (
                          <div className="flex gap-1 mt-1 overflow-hidden">
                            {asset.tags.slice(0, 2).map(tag => (
                              <span key={tag} className="text-[8px] text-primary/80">#{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Quick Actions (on hover) */}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlaceOnCanvas(asset);
                          }}
                          className="p-1.5 bg-primary rounded-lg text-white hover:bg-primary/80 transition-colors"
                          title="Place on Canvas"
                        >
                          <span className="material-symbols-outlined text-sm">add_to_photos</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete "${asset.name}"?`)) {
                              deleteAsset(asset.id);
                            }
                          }}
                          className="p-1.5 bg-red-500/80 rounded-lg text-white hover:bg-red-500 transition-colors"
                          title="Delete"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add Asset Card */}
                  <div
                    onClick={() => setShowUploadModal(true)}
                    className="aspect-square bg-[#121826] border border-dashed border-[#2d364d]/50 rounded-xl flex flex-col items-center justify-center gap-2 group hover:border-primary transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-slate-500 group-hover:text-primary">add_circle</span>
                    <p className="text-[9px] font-bold text-slate-500 group-hover:text-primary uppercase tracking-widest">Add Asset</p>
                  </div>
                </div>
              </section>
            ))
          )}
        </div>
      </main>

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadAssetModal
          onClose={() => setShowUploadModal(false)}
        />
      )}

      {/* Bottom Safe Area */}
      <div className="fixed bottom-0 w-full h-6 flex justify-center items-end pb-2 bg-transparent pointer-events-none">
        <div className="w-32 h-1 bg-slate-700 rounded-full opacity-50" />
      </div>

      {/* Error Display */}
      {(error || wsError) && (
        <div className="fixed top-20 right-6 z-50 bg-red-500/20 border border-red-500/50 px-4 py-2 rounded-lg">
          <p className="text-sm text-red-400">{error || (wsError ? String(wsError) : 'Connection error')}</p>
        </div>
      )}
    </div>
  );
};

// Upload Asset Modal Component
const UploadAssetModal = ({ onClose }: { onClose: () => void }) => {
  const { createAsset } = useAssetContext();
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [category, setCategory] = useState<string>('Props');
  const [imageData, setImageData] = useState<string>('');
  const [imageDimensions, setImageDimensions] = useState({ width: 100, height: 100 });
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setImageData(dataUrl);

        // Get image dimensions
        const img = new Image();
        img.onload = () => {
          setImageDimensions({ width: img.width, height: img.height });
          if (!name) {
            setName(file.name.replace(/\.[^/.]+$/, '')); // Remove extension
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageData || !name) return;

    setIsUploading(true);

    const tagList = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    createAsset(
      name,
      imageData,
      tagList,
      category,
      imageDimensions.width,
      imageDimensions.height
    );

    setIsUploading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#121826] border border-[#2d364d] rounded-2xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-[#2d364d] flex items-center justify-between">
          <h2 className="text-lg font-bold">Add New Asset</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Image Upload */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Image</label>
            <div 
              className={`relative aspect-video border-2 border-dashed rounded-xl flex items-center justify-center overflow-hidden transition-colors ${
                imageData ? 'border-primary' : 'border-[#2d364d] hover:border-primary/50'
              }`}
            >
              {imageData ? (
                <img src={imageData} alt="Preview" className="w-full h-full object-contain" />
              ) : (
                <div className="text-center p-4">
                  <span className="material-symbols-outlined text-4xl text-slate-500 mb-2">upload_file</span>
                  <p className="text-sm text-slate-400">Click or drop image here</p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#0a0e17] border border-[#2d364d] rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary"
              placeholder="Asset name"
              required
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#0a0e17] border border-[#2d364d] rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary"
            >
              {ASSET_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full bg-[#0a0e17] border border-[#2d364d] rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary"
              placeholder="e.g., sci-fi, metal, dark"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!imageData || !name || isUploading}
            className="w-full py-3 bg-primary hover:bg-primary/80 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition-colors"
          >
            {isUploading ? 'Uploading...' : 'Add Asset'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AssetVaultPage;
