import * as fabric from 'fabric';
import {UserSessionProfile} from './userSessionProfile'


type CanvasEvent = {
    type: 'object:added' | 'object:modified' | 'object:removed' | 'canvas:clear' | 'layer:updated';
    payload: any;
    userId: string;
    roomId: string;
};

type MessageEvent = {
    type: 'message:added' | 'message:modified' | 'message:removed' | 'message:placeholder';
    payload: any;
}



export class WebSocketService
{
    private ws: WebSocket;
    private canvas: fabric.Canvas | null = null;
    private userId: string;
    private roomId: string;
    static instance: WebSocketService | null = null;
    
    private onMessageAdded?: (message: any) => void;
    private onMessageModified?: (message: any) => void;
    private onMessageRemoved?: (message: any) => void;

    constructor(url : string, userId: string, roomId: string) {
        
        this.ws = new WebSocket(url);
        this.userId = userId;
        this.roomId = roomId;   
        this.setupWebSocket();
    }

    static getInstance() {
        if (WebSocketService.instance == null) {
            
            WebSocketService.instance = new WebSocketService(UserSessionProfile.wsURL, UserSessionProfile.userId, UserSessionProfile.roomId );
            //WebSocketService.instance.setCanvas(canvas);
            
        }
        return WebSocketService.instance;   
    }

    private setupWebSocket() {
        this.ws.onopen = () => {
            console.log('Connected to WebSocket server');
            this.joinRoom();
        }

        this.ws.onmessage = (message) => {
            console.log(message);
            const data: CanvasEvent = JSON.parse(message['data']);
            if(data.userId !== this.userId)
            {
                this.handleCanvasEvent(data);
            }
        };

        this.ws.onclose = () => {
            console.log('Disconnected from WebSocket server');
        };

        
    }
    
    setCallbacks( callbacks : {
        onMessageAdded?: (message: any) => void,
        onMessageModified?: (message: any) => void,
        onMessageRemoved?: (message: any) => void,
    })
    {
        this.onMessageAdded = callbacks.onMessageAdded;
        this.onMessageModified = callbacks.onMessageModified;
        this.onMessageRemoved = callbacks.onMessageRemoved;
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
    

    
    //When user began typing new message in chat, send a message box with placeholder text
    //Remove placeholder if the user stops typing
    private initiateMessageEvent(user: IUser, message: string, placeHolder: boolean)
    {
        const payload = {
            userId: user.id,
            userName: user.name,
            message,
            placeHolder,
        }
        this.sendMessageEvent('message:placeholder', payload, placeHolder);
    }
   private handleMessageEvent(messageEvent : MessageEvent) {
        
        switch(messageEvent.type) {
            case 'message:added':
                this.onMessageAdded?.(messageEvent.payload);
                break;
                case 'message:modified':
                    this.onMessageModified?.(messageEvent.payload);
                    break;
                    case 'message:removed':
                        this.onMessageRemoved?.(messageEvent.payload);
                        break;
                        case 'message:placeholder':
                            this.onMessageAdded?.(messageEvent.payload);
                            break;
        }
        
        
        
   }
        
       

    private handleCanvasEvent(event: CanvasEvent) { 
        if(!this.canvas) return;
        
        console.log("client received event: ", event.type);
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
    
    private sendMessageEvent(type: MessageEvent['type'], payload: any, placeHolder: boolean) {
        this.ws.send(JSON.stringify({
            type,
            payload,
            userId: this.userId,
            roomId: this.roomId,
            placeHolder,
        }))
    }
        
}


