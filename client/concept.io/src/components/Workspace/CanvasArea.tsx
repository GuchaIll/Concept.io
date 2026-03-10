import type { RefObject, DragEvent } from 'react';
import { useState, useCallback } from 'react';

interface CanvasAreaProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onAssetDrop?: (assetData: { assetId: string; name: string; imageData: string; width: number; height: number }, x: number, y: number) => void;
}

export const CanvasArea = ({ canvasRef, onAssetDrop }: CanvasAreaProps) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if it's an asset being dragged
    if (e.dataTransfer.types.includes('application/json')) {
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const data = e.dataTransfer.getData('application/json');
      if (data) {
        const assetData = JSON.parse(data);
        if (assetData.type === 'asset' && onAssetDrop) {
          // Get drop position relative to canvas
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            onAssetDrop(assetData, x, y);
          }
        }
      }
    } catch (err) {
      console.error('Failed to handle asset drop:', err);
    }
  }, [onAssetDrop, canvasRef]);

  return (
    <div 
      className={`absolute inset-0 z-0 flex items-center justify-center overflow-hidden transition-colors ${
        isDragOver ? 'bg-primary/10' : ''
      }`}
      style={{ 
        background: isDragOver 
          ? 'radial-gradient(circle at center, rgba(43, 108, 238, 0.1) 0%, #0a0c14 100%)'
          : 'radial-gradient(circle at center, #1a1f2e 0%, #0a0c14 100%)',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone indicator */}
      {isDragOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
          <div className="bg-primary/20 border-2 border-dashed border-primary rounded-xl p-8">
            <div className="text-center">
              <span className="material-symbols-outlined text-4xl text-primary mb-2">add_to_photos</span>
              <p className="text-primary font-medium">Drop to add asset layer</p>
            </div>
          </div>
        </div>
      )}

      {/* Canvas wrapper - allows canvas to be centered initially but expand freely when zooming */}
      <div 
        className="relative flex items-center justify-center"
        style={{
          // Initial margins to center canvas away from UI
          // These only affect initial positioning - canvas can grow beyond these when zooming
          marginLeft: '90px',   // Space for left tool rail
          marginRight: '300px', // Space for right layers panel
          marginTop: '80px',    // Space for top bar
          marginBottom: '100px' // Space for bottom action bar
        }}
      >
        <div 
          className="rounded-lg overflow-visible"
          style={{
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}
        >
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  );
};
