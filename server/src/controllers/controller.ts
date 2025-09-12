import {Router} from 'express';
import {Server as SocketServer} from 'socket.io';
import {Request, Response} from 'express';

/** Base controller class that defines the structure for all controllers in the application.
 It provides a path for the controller and a router to handle requests.
**/

abstract class Controller {
    public path : string;
    public static io: SocketServer;

    // The router for the controller
    public router: Router = Router();

    constructor(path : string){
        this.initializeRoutes();
        this.path = path;
    }

    /**
     * Initialize the routes for the controller.
     * This method should be implemented by subclasses to define their specific routes.
     */
    public abstract initializeRoutes(): void;
}

export default Controller;