//mongo db implementation of database used for production

import { IDatabase } from './dac';

export class MongoDBDatabase implements IDatabase {
    async connect() : Promise<void> {
        console.log("MongoDBDatabase connected");
    }

    async disconnect() : Promise<void> {
        console.log("MongoDBDatabase disconnected");
    }

    async inherits() : Promise<void> {
        console.log("MongoDBDatabase inherits");
    }
}