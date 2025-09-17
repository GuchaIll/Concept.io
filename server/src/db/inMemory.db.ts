// an InMemory version of the database that you can use in early-stage development
import { IDatabase } from './dac';
import {CanvasEvent} from "../common/CanvasEvent";

export class InMemoryDatabase implements IDatabase {
    
    private history: CanvasEvent[] = [];
    
    async connect() : Promise<void> {
        console.log("InMemoryDatabase connected");
    }

    async disconnect() : Promise<void> {
        console.log("InMemoryDatabase disconnected");
    }

    async inherits() : Promise<void> {
        console.log("InMemoryDatabase inherits");
    }
    
    async saveCanvasEventToHistory(e : CanvasEvent) : Promise<void> {
        console.log("InMemoryDatabase saveCanvasEventToHistory");
        this.history.push(e);
    }
    
    async getAllCanvasEventsFromHistory() : Promise<CanvasEvent[]> {
        console.log("InMemoryDatabase getAllCanvasEventsFromHistory");
        return this.history;
    }
}