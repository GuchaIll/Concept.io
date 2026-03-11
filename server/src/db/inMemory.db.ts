// an InMemory version of the database that you can use in early-stage development
import { IDatabase } from './dac';
import {CanvasEvent} from "../common/CanvasEvent";

export class InMemoryDatabase implements IDatabase {
    
    private history: CanvasEvent[] = [];
    private chatHistory: MessageEvent[] = [];
    private teamList: string[] = [];
    
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

    async saveMessageToChatHistory(e : MessageEvent) : Promise<void> {
        console.log("InMemoryDatabase saveMessageToChatHistory");
    }
    async getAllMessagesFromChatHistory(): Promise<MessageEvent[]> {
        console.log("InMemoryDatabase getAllMessagesFromChatHistory");
        return [];
    }

    async AddMemberToTeam(teamID : string, userID : string) : Promise<void> {
        console.log("InMemoryDatabase AddMemberToTeam");
    }
    async RemoveMemberFromTeam(teamID : string, userID : string) : Promise<void> {
        console.log("InMemoryDatabase RemoveMemberFromTeam");
    }

    async saveTeamToTeamList(teamID : string) : Promise<void> {
        console.log("InMemoryDatabase saveTeamToTeamList");
    }
    async getAllTeamsFromTeamList(): Promise<string[]> {
        console.log("InMemoryDatabase getAllTeamsFromTeamList");
        return [];
    }
}