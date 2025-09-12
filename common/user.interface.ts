export interface ILogin {
    username: string;
    password: string;
}

export interface IUser {
    _id: string; // unique identifier for the user
    credentials: ILogin; // user's login credentials
    displayName: string; // name to be displayed in the UI
    avatarUrl?: string; // optional URL to the user's avatar image
    createdAt?: number; // timestamp of account creation
    updatedAt?: number; // timestamp of last account update
    isActive?: boolean; // whether the user account is active
    teams?: string[]; // array of team IDs the user belongs to
}