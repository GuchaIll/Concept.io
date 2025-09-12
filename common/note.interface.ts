export interface INote {
    title: string;
    content: string;
    authorId: string; // ID of the user who created the note
    teamId?: string; // optional ID of the team the note belongs to
    createdAt?: number; // timestamp
    updatedAt?: number; // timestamp
    _id?: string; // optional ID field for database use
}