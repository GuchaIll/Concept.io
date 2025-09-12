import WebSocket, { WebSocketServer as WebSocketServerType } from 'ws';
import {Server} from 'http';
import { queryObjects } from 'v8';

// Collection of client websocket connections for current room
interface Room {
    [key : string] : WebSocket[];

}

interface CanvasEvent {
    type: string;
    payload: any;
    userId: string;
    roomId: string;
}

export class WebSocketServer {
    private wss: WebSocketServerType;
    private rooms: Room = {};

    constructor(server: Server) {
        this.wss = new WebSocketServerType({ server });
        this.setupWebSocketServer();
    }

    private setupWebSocketServer() {
        this.wss.on('connection', (ws: WebSocket) => {
            console.log('New client connected');

            ws.on('message', (message: string) => {
                try {
                    const data: CanvasEvent = JSON.parse(message.toString());
                    
                    switch(data.type) {
                        case 'join':
                            this.handleJoinRoom(ws, data);
                            break;
                        default:
                            this.broadcastToRoom(data.roomId, message, ws);
                            break;
                    }
                    
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            });

            ws.on('close', () => {
                this.removeFromRooms(ws);
                console.log('Client disconnected');
               
            });
        });
    }

    private handleJoinRoom(ws: WebSocket, data: CanvasEvent) {
        const { roomId } = data.payload;

        if (!this.rooms[roomId]) {
            this.rooms[roomId] = [];
        }

        this.rooms[roomId].push(ws);
        console.log(`Client joined room: ${roomId}`);
    }

    private broadcastToRoom(roomId: string, message: string, sender: WebSocket) {
        const clients = this.rooms[roomId] || [];
        clients.forEach(client => {
            if (client !== sender && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    private removeFromRooms(ws: WebSocket) {
        Object.keys(this.rooms).forEach(roomId => {
            this.rooms[roomId] = this.rooms[roomId].filter(client => client !== ws);
            if (this.rooms[roomId].length === 0) {
                delete this.rooms[roomId];
            }
        });
    }
}