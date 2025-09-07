import { useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import Stack from '../common/Stack';

/**
 * Maximum number of history states to keep
 */
const MAX_HISTORY_STATES = 50;

/**
 * Custom hook for managing canvas history (undo/redo)
 */
export function useHistory(canvas: fabric.Canvas | null) {
  const undoStack = useRef<Stack<fabric.Object>>(new Stack(MAX_HISTORY_STATES));
  const redoStack = useRef<Stack<fabric.Object>>(new Stack(MAX_HISTORY_STATES));

  /**
   * Save an object to the history stack
   */
  const saveToHistory = useCallback((object: fabric.Object): void => {
    undoStack.current.push(object);
    redoStack.current.clear();
  }, []);

  /**
   * Undo the last action
   */
  const undo = useCallback((): void => {
    if (undoStack.current.isEmpty() || !canvas) return;

    const lastObject = undoStack.current.pop();
    if (lastObject) {
      redoStack.current.push(lastObject);
      canvas.remove(lastObject);
      canvas.renderAll();
    }
  }, [canvas]);

  /**
   * Redo the last undone action
   */
  const redo = useCallback((): void => {
    if (redoStack.current.isEmpty() || !canvas) return;

    const lastObject = redoStack.current.pop();
    if (lastObject) {
      undoStack.current.push(lastObject);
      canvas.add(lastObject);
      canvas.renderAll();
    }
  }, [canvas]);

  /**
   * Check if undo is available
   */
  const canUndo = useCallback((): boolean => {
    return !undoStack.current.isEmpty();
  }, []);

  /**
   * Check if redo is available
   */
  const canRedo = useCallback((): boolean => {
    return !redoStack.current.isEmpty();
  }, []);

  /**
   * Clear all history
   */
  const clearHistory = useCallback((): void => {
    undoStack.current.clear();
    redoStack.current.clear();
  }, []);

  return { 
    undo, 
    redo, 
    saveToHistory,
    canUndo,
    canRedo,
    clearHistory
  };
}