//Direct Access Object
//This is the access point to the database
//used to decouple database from the rest of the application
//accessed by models which are used by controllers

import { inherits } from "util";
import {CanvasEvent} from "../common/CanvasEvent";
import {MessageEvent} from "../common/MessageEvent";

export interface IDatabase {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    inherits(): Promise<void>;
    
    //For undo and redo behaviours send in request from the client side
    saveCanvasEventToHistory(e : CanvasEvent) : Promise<void>;
    getAllCanvasEventsFromHistory(): Promise<CanvasEvent[]>;
    removeCanvasEventFromHistory(e : CanvasEvent) : Promise<void>; //If the user presses undo/redo, get ID of the input actins
    
    saveMessageToChatHistory(e : MessageEvent) : Promise<void>;
    getAllMessagesFromChatHistory(): Promise<MessageEvent[]>;
    
    AddMemberToTeam(teamID : string, userID : string) : Promise<void>;
    RemoveMemberFromTeam(teamID : string, userID : string) : Promise<void>;
    
    saveTeamToTeamList(teamID : string) : Promise<void>;
    getAllTeamsFromTeamList(): Promise<string[]>;
    
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