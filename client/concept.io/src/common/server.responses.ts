import type { IUser } from "./user.interface";

export interface IResponse {
  name: string;
  message?: string;
  payload?: any;
}

export interface IAuthenticatedUser {
  token: string;
  user: IUser;
}
