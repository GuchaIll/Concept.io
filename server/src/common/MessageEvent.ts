
interface MessageEvent {
    senderID: string;
    displayName?: string;
    message: string;
    timestamp: number;
    profilePic: string;
    attachments?: string[]; //additional links images and reactions
}