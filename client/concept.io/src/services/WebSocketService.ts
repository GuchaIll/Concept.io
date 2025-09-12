import * as fabric from 'fabric';

type CanvasEvent = {
    type: 'object:added' | 'object:modified' | 'object:removed' | 'canvas:clear' | 'layer:updated';
    payload: any;
    userId: string;
    roomId: string;
};

export class WebSocketService
{
    private ws: WebSocket;
    private canvas: fabric.Canvas | null = null;
    private userId: string;
    private roomId: string;

    constructor(url : string, userId: string, roomId: string) {
        this.ws = new WebSocket(url);
        this.userId = userId;
        this.roomId = roomId;
        this.setupWebSocket();
    }

    private setupWebSocket() {
        this.ws.onopen = () => {
            console.log('Connected to WebSocket server');
            this.joinRoom();
        }

        this.ws.onmessage = (message) => {
            const data: CanvasEvent = JSON.parse(message.data);
            if(data.userId !== this.userId)
            {
                this.handleCanvasEvent(data);
            }
        };

        this.ws.onclose = () => {
            console.log('Disconnected from WebSocket server');
        };

        
    }

    private joinRoom() {
        this.ws.send(JSON.stringify({
            type: 'join',
            payload: { roomId: this.roomId },
            userId: this.userId,
            
        }));
    }

    public setCanvas(canvas: fabric.Canvas) {
        this.canvas = canvas;
        this.setUpCanvasListeners();
    }
    private setUpCanvasListeners() {
        if(!this.canvas) return;
        
        this.canvas.on('object:added', (e) => {
            if((e as any).target?.websocketIgnore) return;
            this.sendCanvasEvent('object:added', e.target.toJSON());
        });

        this.canvas.on('object:modified', (e) => {
            if((e as any).target?.websocketIgnore) return;
            this.sendCanvasEvent('object:modified', e.target.toJSON());
        });

        this.canvas.on('object:removed', (e) => {
            if((e as any).target?.websocketIgnore) return;
            this.sendCanvasEvent('object:removed', e.target.toJSON());
        });

    }

    private handleCanvasEvent(event: CanvasEvent) { 
        if(!this.canvas) return;

        switch(event.type) {
            case 'object:added':
                fabric.util.enlivenObjects([event.payload]).then((objects) => {
                    objects
                        .filter((obj): obj is fabric.Object => obj instanceof fabric.Object)
                        .forEach((obj) => {
                            (obj as any).websocketIgnore = true;
                            this.canvas?.add(obj);
                            this.canvas?.requestRenderAll();
                            setTimeout(() => { delete (obj as any).websocketIgnore; }, 0);
                        });
                });
                break;

        case 'object:modified':
            const targetObj = this.canvas.getObjects().find(obj => obj.id === event.payload.id);
            if (targetObj) {
                fabric.util.enlivenObjects([event.payload]).then((objects) => {
                    const newObj = objects[0];
                    if (newObj) {
                        targetObj.set(newObj.toObject());
                        this.canvas?.renderAll();
                    }
                });
            }
            break;

            case 'object:removed':
                this.canvas?.getObjects().forEach((obj) => {
                    if (obj.id === event.payload.id) {
                        this.canvas?.remove(obj);
                    }
                });
                this.canvas?.requestRenderAll();
                break;
            case 'layer:updated':
        
                break;
        }
    }

    private sendCanvasEvent(type: CanvasEvent['type'], payload: any) {
        this.ws.send(JSON.stringify({
            type,
            payload,
            userId: this.userId,
            roomId: this.roomId,
        }));
    }
        
}


