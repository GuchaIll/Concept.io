//mongo db implementation of database used for production

import { IDatabase } from './dac';
import {CanvasEvent} from "../common/CanvasEvent";

export class MongoDBDatabase implements IDatabase {

    private history: CanvasEvent[] = [];
    async connect() : Promise<void> {
        console.log("MongoDBDatabase connected");
    }

    async disconnect() : Promise<void> {
        console.log("MongoDBDatabase disconnected");
    }

    async inherits() : Promise<void> {
        console.log("MongoDBDatabase inherits");
    }

    async saveCanvasEventToHistory(e : CanvasEvent) : Promise<void> {
        console.log("InMemoryDatabase saveCanvasEventToHistory");
        this.history.push(e);
    }

    async getAllCanvasEventsFromHistory() : Promise<CanvasEvent[]> {
        console.log("InMemoryDatabase getAllCanvasEventFromHistory");
        return this.history;
    }
    
    
}