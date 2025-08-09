//Direct Access Object
//This is the access point to the database
//used to decouple database from the rest of the application
//accessed by models which are used by controllers

import { inherits } from "util";

export interface IDatabase {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    inherits(): Promise<void>;

}

class DAC {
    static _db : IDatabase;

    static get db(): IDatabase {
        return DAC._db;
    }

    static set db(db: IDatabase) {
        if (DAC._db) {
            throw new Error("Database already set");
        }
        DAC._db = db;
    }
}

export default DAC;