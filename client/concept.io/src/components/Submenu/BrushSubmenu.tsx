import React from "react";
import { Pencil, Circle, SprayCan, GripHorizontal, Minus, Square, Diamond, Image } from "lucide-react";

type ToolId = "Brush" | "Shape" | "Text";

interface SubmenuItem {
    id: string;
    icon: React.ReactNode;
    label: string;
    hasSubmenu: boolean;
}

interface ToolSubmenuProps {
    toolId: ToolId;
    items: SubmenuItem[];
    onSelect: (id: string) => void;
    selectedId: string;
}

const ToolSubmenu: React.FC<ToolSubmenuProps> = ({
    toolId,
    items,
    onSelect,
    selectedId,
}) => {
   
    return (
        <div className="submenu">
            {items.map((item) => (
                <button
                    key={item.id}
                    className={`submenu-item${selectedId === item.id ? " active" : ""}`}
                    onClick={() => onSelect(item.id)}
                    aria-label={item.label}
                >
                    {item.icon}
                    <span>{item.label}</span>
                </button>
            ))}
        </div>
    );
};

// Brush submenu items
const brushItems: SubmenuItem[] = [
    { id: "Pencil", icon: <Pencil size={20} />, label: "Pencil", hasSubmenu: false },
    { id: "Circle", icon: <Circle size={20} />, label: "Circle Brush", hasSubmenu: false },
    { id: "Spray", icon: <SprayCan size={20} />, label: "Spray", hasSubmenu: false },
    { id: "hline", icon: <GripHorizontal size={20} />, label: "Horizontal Lines", hasSubmenu: false },
    { id: "vline", icon: <Minus size={20} />, label: "Vertical Lines", hasSubmenu: false },
    { id: "square", icon: <Square size={20} />, label: "Square Pattern", hasSubmenu: false },
    { id: "diamond", icon: <Diamond size={20} />, label: "Diamond Pattern", hasSubmenu: false },
    { id: "texture", icon: <Image size={20} />, label: "Texture Pattern", hasSubmenu: false },
];

interface BrushSubmenuProps {
    
    selectedBrush: string;
    onSelectBrush: (id: string) => void;
}

export const BrushSubmenu: React.FC<BrushSubmenuProps> = ({
   
    selectedBrush,
    onSelectBrush,
}) => (
    <ToolSubmenu
        toolId="Brush"
        items={brushItems}
        onSelect={onSelectBrush}
        selectedId={selectedBrush}
    />
);

