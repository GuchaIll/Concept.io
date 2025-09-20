import WebSocket, { WebSocketServer as WebSocketServerType } from 'ws';
import {Server} from 'http';
import {CanvasEvent} from "./common/CanvasEvent"; 
import {MessageEvent} from "./common/MessageEvent";
import DAC, { IDatabase } from './db/dac';
import {InMemoryDatabase} from "./db/inMemory.db";
import { queryObjects } from 'v8';

// Collection of client websocket connections for current room
interface Room {
    [key : string] : WebSocket[];

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

            ws.on('message', (data, isBinary) => {
                const rawMessage = isBinary ? data.toString() : data.toString();

                try {
                    const extractedData = JSON.parse(rawMessage.toString()) as CanvasEvent;

                    switch (extractedData.type) {
                        case 'join':
                            this.handleJoinRoom(ws, extractedData);
                            this.sendCanvasHistory(ws, extractedData.roomId, extractedData);
                            break;

                        default:
                            console.log(
                                'Received message:',
                                extractedData.type,
                                extractedData.payload,
                                extractedData.userId,
                                extractedData.roomId
                            );
                            this.broadcastToRoom(extractedData.roomId, rawMessage, ws);
                            this.saveToRoomHistory(ws, extractedData);
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
    
    private sendCanvasHistory(sender: WebSocket, roomId: string, data: CanvasEvent) {
        DAC.db.getAllCanvasEventsFromHistory().then(history => {
            sender.send(JSON.stringify(history));
        })
    }

    private broadcastToRoom(roomId: string, message: string, sender: WebSocket) {
        const clients = this.rooms[roomId] || [];
        clients.forEach(client => {
            if (client !== sender && client.readyState === WebSocket.OPEN) {
                client.send(message); 
            }
        });
    }
    
    private saveToRoomHistory(ws: WebSocket, data: CanvasEvent) {
          DAC.db.saveCanvasEventToHistory(data);
    }
    
    private saveNewMessageToRoomHistory(ws: WebSocket, data: ) {
        DAC.db.saveMessageToChatHistory(data);
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