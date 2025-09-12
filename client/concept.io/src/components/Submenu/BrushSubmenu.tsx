import { memo } from "react";
import { Pencil, Circle, SprayCan, GripHorizontal, Minus, Square, Diamond, Image } from "lucide-react";
import { useCanvasContext } from "../../contexts/CanvasContext";
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

export const BrushSubmenu = memo(() => {
    const { canvas } = useCanvasContext();
    const { lineWidth, setLineWidth, brushOpacity, setBrushOpacity, brushType, setBrushType } = useBrush(canvas);

    return (
        <div className="absolute left-[200%] ml-2 bg-white rounded-lg shadow-lg p-3 space-y-6 dark:bg-gray-800">
            <div className="grid grid-cols-4 gap-2">
                {brushItems.map((brush) => (
                    <button
                        key={brush.type}
                        onClick={() => setBrushType(brush.type)}
                        className={`p-2 rounded ${brushType === brush.type ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}
                        title={brush.label}
                    >
                        <brush.icon size={20} />
                    </button>
                ))}
            </div>
            <div className="space-y-2">
                <div>
                    <label className="text-sm">Brush Width</label>
                    <input
                        type="range"
                        min="1"
                        max="50"
                        value={lineWidth}
                        onChange={(e) => setLineWidth(Number(e.target.value))}
                        className="w-full"
                    />
                </div>
                <div>
                    <label className="text-sm">Brush Opacity</label>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={brushOpacity}
                        onChange={(e) => setBrushOpacity(Number(e.target.value))}
                        className="w-full"
                    />
                </div>
            </div>
        </div>
    );
});

