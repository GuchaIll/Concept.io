import type { RefObject } from 'react';

interface CanvasAreaProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export const CanvasArea = ({ canvasRef }: CanvasAreaProps) => {
  return (
    <div 
      className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
      style={{ 
        background: 'radial-gradient(circle at center, #1a1f2e 0%, #0a0c14 100%)',
      }}
    >
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
