

interface BrushControlsProps {
  brushType: string;
  setBrushType: (type: string) => void;
  color: string;
  setColor: (color: string) => void;
  lineWidth: number;
  setLineWidth: (width: number) => void;
  shadowColor: string;
  setShadowColor: (color: string) => void;
  shadowBlur: number;
  setShadowBlur: (blur: number) => void;
  shadowOffset: number;
  setShadowOffset: (offset: number) => void;
  eraseModeOn: boolean;
  handleErase: () => void;
  handleToggleDrawing: () => void;
  handleClearCanvas: () => void;
  drawingModeOn: boolean;
}

export const BrushPropertiesTab: React.FC<BrushControlsProps> = ({
  brushType,
  setBrushType,
  color,
  setColor,
  lineWidth,
  setLineWidth,
  shadowColor,
  setShadowColor,
  shadowBlur,
  setShadowBlur,
  shadowOffset,
  setShadowOffset,
  eraseModeOn,
  handleErase,
  handleToggleDrawing,
  handleClearCanvas,
  drawingModeOn
}) => {
  return (
    <div className="flex-col justify-center bg-yellow-200 w-full max-h-32 rounded">
      <div className="flex gap-2">
        <div className="flex flex-col">
          <button
            onClick={handleToggleDrawing}
            className={`text-white px-4 py-2 h-12 rounded ${
              drawingModeOn ? 'bg-green-200 hover:bg-green-300' : 'bg-yellow-200 hover:bg-orange-200'
            } transition-colors duration-300`}
          >
            {drawingModeOn ? 'Drawing Mode: ON' : 'Drawing Mode: OFF'}
          </button>
          <button 
            onClick={handleClearCanvas} 
            className="bg-red-200 text-white px-4 py-2 h-12 rounded ml-2"
          >
            Clear Canvas
          </button>
        </div>

        <div className="flex flex-col">
          <label className="flex flex-col items-center ml-2 bg-gray-500">
            <span className="text-center w-full mb-2">BrushType</span>
            <select 
              value={brushType} 
              onChange={(e) => setBrushType(e.target.value)} 
              className="ml-2"
            >
              <option value="Pencil">Pencil</option>
              <option value="Circle">Circle</option>
              <option value="Spray">Spray</option>
              <option value="hline">Horizontal Lines</option>
              <option value="vline">Vertical Lines</option>
              <option value="square">Squares</option>
              <option value="diamond">Diamonds</option>
              <option value="texture">Texture</option>
            </select>
          </label>
          <button 
            onClick={handleErase} 
            className={`${
              eraseModeOn ? 'bg-gray-500 text-white' : 'bg-gray-200 text-black'
            } px-4 py-2 rounded ml-2`}
          >
            {eraseModeOn ? 'Disable Eraser' : 'Enable Eraser'}
          </button>
        </div>

        <div className="flex flex-col">
          <label className="flex flex-col items-center space-y-1 bg-gray-500">
            <span className="text-center w-full">Color:</span>
            <input 
              type="color" 
              value={color} 
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <label className="flex flex-col items-center ml-2 bg-gray-500">
            <span className="text-center w-full">Line Width:</span>
            <input 
              type="number" 
              value={lineWidth} 
              onChange={(e) => setLineWidth(parseInt(e.target.value))}
              className="w-16 h-10 p-0 border border-gray-300 rounded bg-white"
            />
          </label>
        </div>

        <div className="flex flex-col">
          <label className="flex flex-col items-center space-y-1 bg-gray-500">
            <span className="text-center w-full">Shadow Color:</span>
            <input 
              type="color" 
              value={shadowColor} 
              onChange={(e) => setShadowColor(e.target.value)}
            />
          </label>
          <label className="flex flex-col items-center ml-2 bg-gray-500">
            <span className="text-center w-full">Shadow blur:</span>
            <input 
              type="number" 
              min={0} 
              value={shadowBlur}
              onChange={(e) => setShadowBlur(parseInt(e.target.value) || 0)}
              className="w-16 h-10 p-0 border border-gray-300 rounded bg-white"
            />
          </label>
          <label className="flex flex-col items-center ml-2 bg-gray-500">
            <span className="text-center w-full">Shadow Offset:</span>
            <input
              type="number"
              min={0}
              value={shadowOffset}
              onChange={(e) => setShadowOffset(parseInt(e.target.value) || 0)}
              className="w-16 h-10 p-0 border border-gray-300 rounded bg-white"
            />
          </label>
        </div>
      </div>
    </div>
  );
};