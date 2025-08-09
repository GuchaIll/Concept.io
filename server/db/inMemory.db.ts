// an InMemory version of the database that you can use in early-stage development
import { IDatabase } from './dac';

export class InMemoryDatabase implements IDatabase {
    async connect() : Promise<void> {
        console.log("InMemoryDatabase connected");
    }

    async disconnect() : Promise<void> {
        console.log("InMemoryDatabase disconnected");
    }

    async inherits() : Promise<void> {
        console.log("InMemoryDatabase inherits");
    }
}