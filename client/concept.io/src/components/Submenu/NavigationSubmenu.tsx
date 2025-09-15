import { memo } from "react";
import { 
    Move, 
    RotateCcw, 
    ZoomIn, 
    FlipHorizontal, 
    FlipVertical, 
    ZoomOut,
    RotateCw,
    Maximize2
} from "lucide-react";
import { useCanvasContext } from "../../contexts/CanvasContext";
import type { LucideIcon } from 'lucide-react';

interface NavItem {
    type: string;
    icon: LucideIcon;
    label: string;
    action: () => void;
    keyBind?: string;
}

export const NavigationSubmenu = memo(() => {
    const { canvas } = useCanvasContext();

    const handleZoom = (zoomIn: boolean) => {
        if (!canvas) return;
        const zoom = canvas.getZoom();
        canvas.setZoom(zoomIn ? zoom * 1.1 : zoom * 0.9);
    };
    
    //Rotate all objects on the canvas
    const handleRotate = (clockwise: boolean) => {
        if (!canvas) return;
        //const angle = canvas.angle ?? 0;
        //canvas.angle = angle + (clockwise ? 90 : -90);
    };

    const handleHorizontalFlip = (horizontal: boolean) => {
        if (!canvas) return;
        const objects = canvas.getObjects();
        objects.forEach((obj) => {
            obj.set('flipX', horizontal ? !obj.flipX : obj.flipX);
        });
        canvas.requestRenderAll();
    };

    const handleVerticalFlip = (vertical: boolean) => {
        if (!canvas) return;
        const objects = canvas.getObjects();
        objects.forEach((obj) => {
            obj.set('flipY', vertical ? !obj.flipY : obj.flipY);
        });
        canvas.requestRenderAll();
    }
    

    const handleReset = () => {
        if (!canvas) return;
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        canvas.setZoom(1);
        const objects = canvas.getObjects();
        objects.forEach((obj) => {
            obj.set({
                flipX: false,
                flipY: false,
            });
        });
        canvas.requestRenderAll();
    };

    const navItems: NavItem[] = [
        { type: "move", icon: Move, label: "Move Canvas", action: () => {/* Implement move functionality here if needed */}, keyBind: 'Alt+Drag' },
        { type: "zoomIn", icon: ZoomIn, label: "Zoom In", action: () => handleZoom(true), keyBind: 'scrollUp' },
        { type: "zoomOut", icon: ZoomOut, label: "Zoom Out", action: () => handleZoom(false), keyBind: 'scrollDown' },
        { type: "rotateLeft", icon: RotateCcw, label: "Rotate Left", action: () => handleRotate(false), keyBind: 'Shift+R' },
        { type: "rotateRight", icon: RotateCw, label: "Rotate Right", action: () => handleRotate(true), keyBind: 'Ctrl+Shift+R' },
        { type: "flipH", icon: FlipHorizontal, label: "Flip Horizontal", action: () => handleHorizontalFlip(true), keyBind: 'Ctrl+H' },
        { type: "flipV", icon: FlipVertical, label: "Flip Vertical", action: () => handleVerticalFlip(true), keyBind: 'Ctrl+V' },
        { type: "reset", icon: Maximize2, label: "Reset View", action: handleReset, keyBind: 'Ctrl+R' },
    ];

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 min-w-[500px] bg-white rounded-lg shadow-xl p-3 dark:bg-gray-800 z-50">
            <div className="grid grid-cols-8 gap-4">
                {navItems.map((item) => (
                    <div>
                    <button
                        key={item.type}
                        onClick={item.action}
                        className="w-12 h-12 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        title={item.label}
                    >
                        <item.icon size={20} />
                    </button>
                    <span className="text-xs text-center">{item.keyBind}</span>
                    </div>
                ))}
            </div>
        </div>
    );
});

NavigationSubmenu.displayName = 'NavigationSubmenu';