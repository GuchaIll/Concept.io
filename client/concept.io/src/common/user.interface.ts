export interface IUser {
  credentials: {
    username: string;
    password?: string;
  };
  extra?: string;
}
