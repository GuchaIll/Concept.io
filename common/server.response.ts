import {IUser, ILogin} from './user.interface';
import { IChatMessage } from './chatMessage.interface';
import { INote } from './note.interface';
import { ITeam } from './team.interface';

export interface IAuthenticatedUser {
    user : IUser;
    token: string;
}

export type ErrorType = 'ClientError' | 'ServerError' | 'UnknownError';

export type SuccessName = 
    | 'UserAuthenticated'
    | 'UserRegistered'
    | 'UserLoggedOut'
    | 'UserProfileUpdated'
    | 'UsersFound'
    | 'UserDeleted'
    | 'NoUsersYet'
    | 'ChatMessageCreated'
    | 'ChatMessageFound'
    | 'NoChatMessagesYet'
    | 'NoteCreated'
    | 'NoteFound'
    | 'NoNotesYet'
    | 'TeamCreated'
    | 'TeamFound'
    | 'NoTeamsYet';

export type ClientErrorName =
    | 'MissingDisplayName'
    | 'MissingUsername'
    | 'MissingPassword'
    | 'MissingToken'
    | 'UnauthorizedRequest'
    | 'UserNotFound'
    | 'OrphanedChatMessage'
    | 'UserExists'
    | 'UnregisteredUser'
    | 'IncorrectPassword'
    | 'MissingChatText'
    | 'MissingAuthor'
    | 'InvalidPassword'
    | 'InvalidToken'
    | 'WeakPassword';

    export type ServerErrorName =
  | 'FailedAuthentication'
  | 'TokenError'
  | 'PostRequestFailure'
  | 'GetRequestFailure'
  | 'PatchRequestFailure'
  | 'InMemoryDBError'
  | 'MongoDBError';

  export type IPayload =
  | IUser
  | IChatMessage
  | ILogin
  | IChatMessage[]
  | IUser[]
  | string[]
  | IAuthenticatedUser
  | INote
  | INote[]
  | ITeam
  | ITeam[]
  | null;

export interface ISuccess {
  // a successful response (corresponding to 2xx status code)
  // name, message, authorizedUser are meta-data
  // the actual data returned is in payload property
  name: SuccessName; // name describing the action that succeeded
  message?: string; // an optional, informative message about the success condition
  authorizedUser?: string; // the username of the authorized user, for information purposes
  /* 
     payload is the actual data returned in the response;
     if there is no such data, payload should be set to null
  */
  payload: IPayload;
}

export interface IAppError {
  // an error response (corresponding to 4xx or 5xx status code)
  type: ErrorType; // type of error: ClientError, ServerError, UnknownError
  name: ClientErrorName | ServerErrorName | 'UnknownError'; // name describing the error condition
  message: string; // a human-readable message providing more details about the error
  authorizedUser?: string; // the username of the authorized user, for information purposes
}

type AppErrorName = ClientErrorName | ServerErrorName | 'UnknownError';


export interface IAppError extends Error {
  type: ErrorType;
  name: AppErrorName;
  message: string;
}

export type IResponse = ISuccess | IAppError;

// Type guards to reduce a value of union type IResponse to a specific subtype.
export function isAppError(res: IResponse): res is IAppError {
  return 'type' in res && 'name' in res && 'message' in res;
}

export function isSuccess(res: IResponse): res is ISuccess {
  if (!isAppError(res)) {
    return 'name' in res && 'payload' in res;
  }
  return false;
}

export function isServerError(res: IResponse) {
  if (isAppError(res)) return res.type == 'ServerError';
  return false;
}

export function isClientError(res: IResponse) {
  if (isAppError(res)) return res.type == 'ClientError';
  return false;
}