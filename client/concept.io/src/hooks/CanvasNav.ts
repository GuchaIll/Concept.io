import {useState} from 'react';
import { useCanvasContext } from '../contexts/CanvasContext';

export const useCanvasNav = () => 
{
    const { canvas } = useCanvasContext();
    const [angle, setAngle] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [translation, setTranslation] = useState({ x: 0, y: 0 });

    const zoomIn = () => 
    {
        if (!canvas) return;
        const newZoom = zoomLevel * 1.1;
        setZoomLevel(newZoom);
        canvas.setZoom(newZoom);
    }

    const rotateClockwiseByAngle = (deltaAngle: Number) =>  
    {
        if (!canvas) return;
        setAngle(angle + Number(deltaAngle));
        canvas.getObjects().forEach((obj) => {
            obj.rotate((obj.angle ?? 0) + Number(deltaAngle));
            obj.setCoords();
        });

    }

    const rotateClockwiseByAbsoluteAngle = (absoluteAngle: Number) =>
    {
        if (!canvas) return;
        const angleDiff = Number(absoluteAngle) - Number(angle ?? 0);
        setAngle(Number(absoluteAngle));
        canvas.getObjects().forEach((obj) => {
            obj.rotate((obj.angle ?? 0) + Number(angleDiff));
            obj.setCoords();
        });

    }

    const rotateCounterClockwiseByAngle = (deltaAngle: Number) =>
    {
        if (!canvas) return;
        setAngle(angle - Number(deltaAngle));
        canvas.getObjects().forEach((obj) => {
            obj.rotate((obj.angle ?? 0) - Number(deltaAngle));
            obj.setCoords();
        });

    }

    const rotateCounterClockwiseByAbsoluteAngle = (absoluteAngle: Number) =>
    {
        if (!canvas) return;
        setAngle(Number(absoluteAngle));
        canvas.getObjects().forEach((obj) => {
            obj.rotate((obj.angle ?? 0) - Number(absoluteAngle));
            obj.setCoords();
        });
    }
    
    return {
        zoomIn,
        rotateClockwiseByAngle,
        rotateClockwiseByAbsoluteAngle,
        rotateCounterClockwiseByAngle,
        rotateCounterClockwiseByAbsoluteAngle,
        zoomLevel,
        angle,
        translation,
        setTranslation,
    }
}

