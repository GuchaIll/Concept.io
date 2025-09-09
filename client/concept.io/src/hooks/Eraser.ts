import {useState, useRef} from 'react';
import * as fabric from 'fabric';
import { EraserBrush } from "@erase2d/fabric";

export const useEraser = (canvas: fabric.Canvas | null) => {
    const [EraseModeOn, setEraseModeOn] = useState(false);

    const eraserBrush = useRef<EraserBrush | null>(null);

    const toggleEraseMode = () => {
        if (!canvas) return;
        
        if (!EraseModeOn) {
            if (!eraserBrush.current) {
                eraserBrush.current = new EraserBrush(canvas);
                eraserBrush.current.width = 30;
                eraserBrush.current.color = 'rgba(0,0,0,1)';
            }
            canvas.freeDrawingBrush = eraserBrush.current;
            canvas.isDrawingMode = true;
            setEraseModeOn(true);
        }
        else {
            canvas.isDrawingMode = false;
            setEraseModeOn(false);
        }
    };

    return { EraseModeOn, toggleEraseMode };
}