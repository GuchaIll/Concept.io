//mongo db implementation of database used for production

import { IDatabase } from './dac';
import {CanvasEvent} from "../common/CanvasEvent";
import { MessageEvent } from '../common/MessageEvent';
import { MongoClient, Db, Collection } from 'mongodb';

export class MongoDBDatabase implements IDatabase {
    private client: MongoClient | null = null;
    private db: Db | null = null;
    private canvasEvents: Collection<CanvasEvent> | null = null;
    private chatHistory: Collection<MessageEvent> | null = null;
    private teams: Collection<{ teamID: string, members: string[] }> | null = null;

    async connect(): Promise<void> {
        this.client = new MongoClient('mongodb://localhost:27017');
        await this.client.connect();
        this.db = this.client.db('conceptio');
        this.canvasEvents = this.db.collection<CanvasEvent>('canvasEvents');
        this.chatHistory = this.db.collection<MessageEvent>('chatHistory');
        this.teams = this.db.collection<{ teamID: string, members: string[] }>('teams');
        console.log("MongoDBDatabase connected");
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
            this.canvasEvents = null;
            this.chatHistory = null;
            this.teams = null;
            console.log("MongoDBDatabase disconnected");
        }
    }

    async inherits(): Promise<void> {
        // No-op for MongoDB implementation
        console.log("MongoDBDatabase inherits");
    }

    async saveCanvasEventToHistory(e: CanvasEvent): Promise<void> {
        if (!this.canvasEvents) throw new Error('Not connected');
        await this.canvasEvents.insertOne(e);
    }

    async getAllCanvasEventsFromHistory(): Promise<CanvasEvent[]> {
        if (!this.canvasEvents) throw new Error('Not connected');
        return await this.canvasEvents.find().toArray();
    }

    async removeCanvasEventFromHistory(e: CanvasEvent): Promise<void> {
        if (!this.canvasEvents) throw new Error('Not connected');
        // Assuming CanvasEvent has a unique 'id' property
        await this.canvasEvents.deleteOne({ id: (e as any).id });
    }

    async saveMessageToChatHistory(e: MessageEvent): Promise<void> {
        if (!this.chatHistory) throw new Error('Not connected');
        await this.chatHistory.insertOne(e);
    }

    async getAllMessagesFromChatHistory(): Promise<MessageEvent[]> {
        if (!this.chatHistory) throw new Error('Not connected');
        return await this.chatHistory.find().toArray();
    }

    async AddMemberToTeam(teamID: string, userID: string): Promise<void> {
        if (!this.teams) throw new Error('Not connected');
        await this.teams.updateOne(
            { teamID },
            { $addToSet: { members: userID } },
            { upsert: true }
        );
    }

    async RemoveMemberFromTeam(teamID: string, userID: string): Promise<void> {
        if (!this.teams) throw new Error('Not connected');
        await this.teams.updateOne(
            { teamID },
            { $pull: { members: userID } }
        );
    }

    async saveTeamToTeamList(teamID: string): Promise<void> {
        if (!this.teams) throw new Error('Not connected');
        await this.teams.updateOne(
            { teamID },
            { $setOnInsert: { members: [] } },
            { upsert: true }
        );
    }

    async getAllTeamsFromTeamList(): Promise<string[]> {
        if (!this.teams) throw new Error('Not connected');
        const teams = await this.teams.find().toArray();
        return teams.map(t => t.teamID);
    }
}
    
