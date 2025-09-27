import {generateUserId} from "../hooks/util.ts";


//Stored user profile for current session
export class UserSessionProfile {
    static userId = generateUserId();
    static roomId = window.location.pathname.split('/').pop() || 'default-room';
    static wsURL = 'ws://localhost:5000';
}

