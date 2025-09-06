import * as fabric from "fabric";


export class FabricHelper {


  public static findObjectById = 
  (canvas:fabric.Canvas,
    id: string): fabric.FabricObject | null => {
    let matchingObject = null;
    canvas.getObjects().map(obj => {
      if ((obj as any).id === id) {
        matchingObject = obj;
      }
    });
    return matchingObject;
  }

  public static getObjectGroupById = 
  (canvas: fabric.Canvas,
    id: string
  ) : fabric.FabricObject | null =>
  {
    let matchingGroup = null;
    canvas.getObjects().map(obj => {
      if ((obj as any).id === id && obj.type === 'group') {
        matchingGroup = obj;
      }
    });
    return matchingGroup;
  }

  

}