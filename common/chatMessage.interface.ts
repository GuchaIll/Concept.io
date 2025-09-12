export interface IChatMessage {
    author : string; //email address of the author
    text: string; //text content of the message
    displayName: string; //display name of the author
    timestamp?: number; //timestamp of when the message was sent
    _id?: string;
}