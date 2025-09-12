export interface ITeam
{
    id: string;
    displayName: string;
    members: string[]; // array of user IDs
    createdAt?: number; // timestamp
    active?: boolean; // whether the team is active

}