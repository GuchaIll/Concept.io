import {useState} from 'react'
import * as fabric from 'fabric'
import type {RGBAColor} from './Color'

export const EyeDropper = (canvas : fabric.Canvas | null) => {

    const [isEyeDropperActive, setIsEyeDropperActive] = useState<boolean>(false);
    const [selectedColor, setSelectedColor] = useState<string>('#000000');

    const handleEyeDropperTool = () => 
    {
        if(!canvas) return;

        if(!isEyeDropperActive)
        {
            setIsEyeDropperActive(true);
            //canvas.isDrawingMode = false;
            //canvas.selection = false;
            canvas.on('mouse:down', handleColorPick);
        }
        else{
            setIsEyeDropperActive(false);
            canvas.off('mouse:down', handleColorPick);
        }
    }

    const handleColorPick = (event: any) => {
        if (!canvas) return;

        const pointer = canvas.getViewportPoint(event);
        const pixel = canvas.contextContainer.getImageData(pointer.x, pointer.y, 1, 1).data;
        const rgba: RGBAColor = {
            r: pixel[0],
            g: pixel[1],
            b: pixel[2],
            a: pixel[3]
        };
        setSelectedColor(`rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`);
        handleEyeDropperTool();
    }

    return (
        {isEyeDropperActive, selectedColor, handleEyeDropperTool}
  )
}

