import * as fabric from 'fabric';

export class FabricHelper {
  /**
   * Finds an object in the canvas by its ID
   */
  public static findObjectById(canvas: fabric.Canvas, id: string): fabric.Object | null {
    return canvas.getObjects().find(obj => (obj as any).id === id) || null;
  }

  /**
   * Finds a group object in the canvas by its ID
   */
  public static getObjectGroupById(canvas: fabric.Canvas, id: string): fabric.Object | null {
    return canvas.getObjects().find(obj => (obj as any).id === id && obj.type === 'group') || null;
  }

  /**
   * Updates object properties and renders the canvas
   */
  public static updateObject(canvas: fabric.Canvas, object: fabric.Object, properties: Record<string, any>): void {
    object.set(properties);
    object.setCoords();
    canvas.renderAll();
  }

  /**
   * Creates a snapshot of the current canvas state
   */
  public static createCanvasSnapshot(canvas: fabric.Canvas): string | null {
    try {
      return canvas.toDataURL({ format: 'png' });
    } catch (error) {
      return null;
    }
  }
}