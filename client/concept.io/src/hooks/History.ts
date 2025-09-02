import { useRef } from 'react';
import * as fabric from 'fabric';
import Stack from '../common/Stack';

export const useHistory = (canvas: fabric.Canvas | null) => {
  const undoStack = useRef<Stack<fabric.Object>>(new Stack());
  const redoStack = useRef<Stack<fabric.Object>>(new Stack());

  const saveToHistory = (object: fabric.Object) => {
    undoStack.current.push(object);
    //redoStack.current.clear();
  };

  const undo = () => {
    if (undoStack.current.isEmpty() || !canvas) return;
    const lastObject = undoStack.current.pop();
    if (lastObject) {
      redoStack.current.push(las tObject);
      canvas.remove(lastObject);
      canvas.renderAll();
    }
  };

  const redo = () => {
    if (redoStack.current.isEmpty() || !canvas) return;
    const lastObject = redoStack.current.pop();
    if (lastObject) {
      undoStack.current.push(lastObject);
      canvas.add(lastObject);
      canvas.renderAll();
    }
  };

  return { undo, redo, saveToHistory };
};