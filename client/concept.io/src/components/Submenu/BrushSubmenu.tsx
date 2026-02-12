import { memo } from "react";
import { Pencil, Circle, SprayCan, GripHorizontal, Minus, Square, Diamond, Image } from "lucide-react";
import { useBrush } from "../../hooks/Brush";
import type { LucideIcon } from 'lucide-react';

type BrushType = "Pencil" | "Circle" | "Spray" | "hline" | "vline" | "square" | "diamond" | "texture";

interface BrushItem {
    type: BrushType;
    icon: LucideIcon;
    label: string;
    hasSubmenu?: boolean;
}

const brushItems: BrushItem[] = [
    { type: "Pencil", icon: Pencil, label: "Pencil" },
    { type: "Circle", icon: Circle, label: "Circle Brush" },
    { type: "Spray", icon: SprayCan, label: "Spray" },
    { type: "hline", icon: GripHorizontal, label: "Horizontal Lines" },
    { type: "vline", icon: Minus, label: "Vertical Lines" },
    { type: "square", icon: Square, label: "Square Pattern", hasSubmenu: false },
    { type: "diamond", icon: Diamond, label: "Diamond Pattern", hasSubmenu: false },
    { type: "texture", icon: Image, label: "Texture Pattern", hasSubmenu: false },
];

export const BrushSubmenu = memo((brushProps : ReturnType<typeof useBrush>) => {
    
    const { lineWidth, setLineWidth, brushOpacity, setBrushOpacity, brushType, setBrushType } = brushProps;

    return (
        <div className="space-y-4">
            {/* Brush Library */}
            <div>
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide mb-2 block">Brush Library</label>
                <div className="grid grid-cols-4 gap-2">
                    {brushItems.map((brush) => (
                        <button
                            key={brush.type}
                            onClick={() => setBrushType(brush.type)}
                            className={`p-2 rounded-lg transition-colors ${
                                brushType === brush.type 
                                    ? 'bg-primary/30 text-primary' 
                                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                            }`}
                            title={brush.label}
                        >
                            <brush.icon size={16} />
                        </button>
                    ))}
                </div>
            </div>
            
            {/* Brush Width */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Width</label>
                    <span className="text-[10px] text-white/40">{lineWidth}px</span>
                </div>
                <input
                    type="range"
                    min="1"
                    max="100"
                    value={lineWidth}
                    onChange={(e) => setLineWidth(Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none 
                        [&::-webkit-slider-thumb]:w-3 
                        [&::-webkit-slider-thumb]:h-3 
                        [&::-webkit-slider-thumb]:rounded-full 
                        [&::-webkit-slider-thumb]:bg-primary 
                        [&::-webkit-slider-thumb]:cursor-pointer"
                />
            </div>
            
            {/* Brush Opacity */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Opacity</label>
                    <span className="text-[10px] text-white/40">{Math.round(brushOpacity * 100)}%</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={brushOpacity}
                    onChange={(e) => setBrushOpacity(Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none 
                        [&::-webkit-slider-thumb]:w-3 
                        [&::-webkit-slider-thumb]:h-3 
                        [&::-webkit-slider-thumb]:rounded-full 
                        [&::-webkit-slider-thumb]:bg-white/80 
                        [&::-webkit-slider-thumb]:cursor-pointer"
                />
            </div>
        </div>
    );
});

