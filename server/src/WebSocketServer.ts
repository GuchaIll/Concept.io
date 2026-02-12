import WebSocket, { WebSocketServer as WebSocketServerType } from 'ws';
import {Server} from 'http';
import {CanvasEvent} from "./common/CanvasEvent"; 
import {MessageEvent} from "./common/MessageEvent";
import DAC, { ISnapshot, IBranch, ILayerSnapshot } from './db/dac';
import { randomUUID } from 'crypto';

const uuidv4 = () => randomUUID();

// Collection of client websocket connections for current room
interface Room {
    [key : string] : WebSocket[];
}

// Version control event types
interface VersionEvent {
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

            ws.on('message', (data, isBinary) => {
                const rawMessage = isBinary ? data.toString() : data.toString();

                try {
                    const extractedData = JSON.parse(rawMessage.toString());

                    // Check if it's a version control event
                    if (extractedData.type?.startsWith('version:')) {
                        this.handleVersionEvent(ws, extractedData as VersionEvent);
                        return;
                    }

                    // Handle as canvas event
                    const canvasEvent = extractedData as CanvasEvent;

                    switch (canvasEvent.type) {
                        case 'join':
                            this.handleJoinRoom(ws, canvasEvent);
                            this.sendCanvasHistory(ws, canvasEvent.roomId, canvasEvent);
                            break;

                        default:
                            console.log(
                                'Received message:',
                                canvasEvent.type,
                                canvasEvent.payload,
                                canvasEvent.userId,
                                canvasEvent.roomId
                            );
                            this.broadcastToRoom(canvasEvent.roomId, rawMessage, ws);
                            this.saveToRoomHistory(ws, canvasEvent);
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

    // ============================================
    // Version Control Event Handlers
    // ============================================

    private async handleVersionEvent(ws: WebSocket, event: VersionEvent) {
        const { type, payload, userId, roomId } = event;

        console.log('Version event received:', type, roomId);

        try {
            switch (type) {
                case 'version:sync:request':
                    await this.handleVersionSyncRequest(ws, roomId);
                    break;

                case 'version:snapshot:create':
                    await this.handleSnapshotCreate(ws, payload, userId, roomId);
                    break;

                case 'version:snapshot:restore':
                    await this.handleSnapshotRestore(ws, payload, userId, roomId);
                    break;

                case 'version:snapshot:delete':
                    await this.handleSnapshotDelete(ws, payload, roomId);
                    break;

                case 'version:branch:create':
                    await this.handleBranchCreate(ws, payload, userId, roomId);
                    break;

                case 'version:branch:switch':
                    await this.handleBranchSwitch(ws, payload, userId, roomId);
                    break;

                case 'version:branch:delete':
                    await this.handleBranchDelete(ws, payload, roomId);
                    break;

                case 'version:branch:merge':
                    await this.handleBranchMerge(ws, payload, userId, roomId);
                    break;

                default:
                    console.warn('Unknown version event type:', type);
            }
        } catch (error) {
            console.error('Error handling version event:', error);
            ws.send(JSON.stringify({
                type: 'version:error',
                payload: { message: 'Failed to process version event', originalType: type },
            }));
        }
    }

    private async handleVersionSyncRequest(ws: WebSocket, roomId: string) {
        // Get all version data for the project (roomId = projectId)
        const versionData = await DAC.db.getVersionData(roomId);
        
        // If no branches exist, create the default main branch
        if (versionData.branches.length === 0) {
            const mainBranch: IBranch = {
                id: uuidv4(),
                projectId: roomId,
                name: 'main',
                headSnapshotId: '',
                createdBy: 'system',
                createdAt: Date.now(),
                color: '#2b6cee',
            };
            await DAC.db.saveBranch(mainBranch);
            versionData.branches.push(mainBranch);
        }

        // Log sync data being sent
        console.log('Sending version sync:', {
            branchesCount: versionData.branches.length,
            snapshotsCount: versionData.snapshots.length,
            snapshots: versionData.snapshots.map(s => ({
                name: s.name,
                id: s.id.substring(0, 8),
                layersCount: s.layers?.length || 0,
                layerObjectsLengths: s.layers?.map(l => l.objects?.length || 0),
                thumbnailLength: s.thumbnail?.length || 0,
            })),
        });

        ws.send(JSON.stringify({
            type: 'version:sync',
            payload: {
                branches: versionData.branches,
                snapshots: versionData.snapshots,
                currentBranchId: versionData.branches[0]?.id || '',
            },
        }));
    }

    private async handleSnapshotCreate(
        ws: WebSocket,
        payload: { name: string; description?: string; layers?: ILayerSnapshot[]; thumbnail?: string; branchId: string },
        userId: string,
        roomId: string
    ) {
        console.log('handleSnapshotCreate received:', {
            name: payload.name,
            branchId: payload.branchId,
            layersCount: payload.layers?.length || 0,
            thumbnailLength: payload.thumbnail?.length || 0,
            layerDetails: payload.layers?.map(l => ({
                name: l.name,
                objectsLength: l.objects?.length || 0,
            })),
        });

        // Get current branch to find parent snapshot
        const branch = await DAC.db.getBranchById(payload.branchId);
        
        // Check if this is a "Current" snapshot that should replace existing
        let existingCurrentSnapshot: ISnapshot | null = null;
        if (payload.name === 'Current') {
            const branchSnapshots = await DAC.db.getSnapshotsByBranch(payload.branchId);
            existingCurrentSnapshot = branchSnapshots.find(s => s.name === 'Current') || null;
        }

        const snapshot: ISnapshot = {
            id: existingCurrentSnapshot?.id || uuidv4(), // Reuse ID if updating existing
            projectId: roomId,
            branchId: payload.branchId,
            name: payload.name,
            description: payload.description,
            layers: payload.layers || [],
            thumbnail: payload.thumbnail || '',
            createdBy: userId,
            createdAt: Date.now(),
            parentSnapshotId: existingCurrentSnapshot?.parentSnapshotId || branch?.headSnapshotId || undefined,
        };

        const savedSnapshot = await DAC.db.saveSnapshot(snapshot);

        // Broadcast to all clients in room
        this.broadcastToRoomIncludingSender(roomId, JSON.stringify({
            type: 'version:snapshot:created',
            payload: savedSnapshot,
        }));

        console.log('Snapshot created/updated:', savedSnapshot.name, 
            'layers:', savedSnapshot.layers.length,
            'thumbnail:', savedSnapshot.thumbnail?.length > 0 ? 'present' : 'missing',
            existingCurrentSnapshot ? '(updated)' : '(new)');
    }

    private async handleSnapshotRestore(
        ws: WebSocket,
        payload: { snapshotId: string },
        userId: string,
        roomId: string
    ) {
        const snapshot = await DAC.db.getSnapshotById(payload.snapshotId);
        
        if (!snapshot) {
            ws.send(JSON.stringify({
                type: 'version:error',
                payload: { message: 'Snapshot not found' },
            }));
            return;
        }

        // Broadcast restore event to all clients
        this.broadcastToRoomIncludingSender(roomId, JSON.stringify({
            type: 'version:snapshot:restored',
            payload: { snapshot, userId },
        }));

        console.log('Snapshot restored:', snapshot.name);
    }

    private async handleSnapshotDelete(
        ws: WebSocket,
        payload: { snapshotId: string },
        roomId: string
    ) {
        await DAC.db.deleteSnapshot(payload.snapshotId);

        this.broadcastToRoomIncludingSender(roomId, JSON.stringify({
            type: 'version:snapshot:deleted',
            payload: { snapshotId: payload.snapshotId },
        }));

        console.log('Snapshot deleted:', payload.snapshotId);
    }

    private async handleBranchCreate(
        ws: WebSocket,
        payload: { name: string; fromSnapshotId?: string; color?: string },
        userId: string,
        roomId: string
    ) {
        const branchColors = ['#2b6cee', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
        const existingBranches = await DAC.db.getBranchesByProject(roomId);
        const colorIndex = existingBranches.length % branchColors.length;

        const branch: IBranch = {
            id: uuidv4(),
            projectId: roomId,
            name: payload.name,
            headSnapshotId: payload.fromSnapshotId || '',
            createdBy: userId,
            createdAt: Date.now(),
            color: payload.color || branchColors[colorIndex],
        };

        const savedBranch = await DAC.db.saveBranch(branch);

        this.broadcastToRoomIncludingSender(roomId, JSON.stringify({
            type: 'version:branch:created',
            payload: savedBranch,
        }));

        console.log('Branch created:', savedBranch.name);
    }

    private async handleBranchSwitch(
        ws: WebSocket,
        payload: { branchId: string },
        userId: string,
        roomId: string
    ) {
        const branch = await DAC.db.getBranchById(payload.branchId);
        
        if (!branch) {
            ws.send(JSON.stringify({
                type: 'version:error',
                payload: { message: 'Branch not found' },
            }));
            return;
        }

        // Broadcast switch event to all clients
        this.broadcastToRoomIncludingSender(roomId, JSON.stringify({
            type: 'version:branch:switched',
            payload: { branchId: payload.branchId, userId },
        }));

        console.log('Branch switched:', branch.name);
    }

    private async handleBranchDelete(
        ws: WebSocket,
        payload: { branchId: string },
        roomId: string
    ) {
        const branch = await DAC.db.getBranchById(payload.branchId);
        
        if (!branch) {
            ws.send(JSON.stringify({
                type: 'version:error',
                payload: { message: 'Branch not found' },
            }));
            return;
        }

        if (branch.name === 'main') {
            ws.send(JSON.stringify({
                type: 'version:error',
                payload: { message: 'Cannot delete main branch' },
            }));
            return;
        }

        await DAC.db.deleteBranch(payload.branchId);

        this.broadcastToRoomIncludingSender(roomId, JSON.stringify({
            type: 'version:branch:deleted',
            payload: { branchId: payload.branchId },
        }));

        console.log('Branch deleted:', branch.name);
    }

    private async handleBranchMerge(
        ws: WebSocket,
        payload: { sourceBranchId: string; targetBranchId: string },
        userId: string,
        roomId: string
    ) {
        const sourceBranch = await DAC.db.getBranchById(payload.sourceBranchId);
        const targetBranch = await DAC.db.getBranchById(payload.targetBranchId);

        if (!sourceBranch || !targetBranch) {
            ws.send(JSON.stringify({
                type: 'version:error',
                payload: { message: 'Branch not found' },
            }));
            return;
        }

        // Get source branch head snapshot
        const sourceHead = sourceBranch.headSnapshotId 
            ? await DAC.db.getSnapshotById(sourceBranch.headSnapshotId)
            : null;

        if (!sourceHead) {
            ws.send(JSON.stringify({
                type: 'version:error',
                payload: { message: 'Source branch has no snapshots to merge' },
            }));
            return;
        }

        // Create merge snapshot on target branch
        const mergeSnapshot: ISnapshot = {
            id: uuidv4(),
            projectId: roomId,
            branchId: payload.targetBranchId,
            name: `Merge: ${sourceBranch.name} → ${targetBranch.name}`,
            description: `Merged changes from branch "${sourceBranch.name}"`,
            layers: sourceHead.layers,
            thumbnail: sourceHead.thumbnail,
            createdBy: userId,
            createdAt: Date.now(),
            parentSnapshotId: targetBranch.headSnapshotId || undefined,
        };

        const savedSnapshot = await DAC.db.saveSnapshot(mergeSnapshot);

        this.broadcastToRoomIncludingSender(roomId, JSON.stringify({
            type: 'version:branch:merged',
            payload: {
                sourceBranchId: payload.sourceBranchId,
                targetBranchId: payload.targetBranchId,
                newSnapshot: savedSnapshot,
            },
        }));

        console.log('Branches merged:', sourceBranch.name, '→', targetBranch.name);
    }

    // ============================================
    // Existing Methods
    // ============================================
    
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

    private broadcastToRoomIncludingSender(roomId: string, message: string) {
        const clients = this.rooms[roomId] || [];
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message); 
            }
        });
    }
    
    private saveToRoomHistory(ws: WebSocket, data: CanvasEvent) {
          DAC.db.saveCanvasEventToHistory(data);
    }
    
    private saveNewMessageToRoomHistory(ws: WebSocket, data: MessageEvent) {
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