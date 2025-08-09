import express, {Express, Request, Response, NextFunction} from 'express';
import { Server as HttpServer, createServer } from 'http';
import Controller from './controllers/controller';
import DAC, { IDatabase } from './db/dac';

import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';

//TODO: add socket.io support dynamic update
class App {
    public app: Express;
    public port: number;
    public db : IDatabase;
    public server: HttpServer;
    public clientDir: string;
    public url: string;
    public host: string;

    constructor(
        controllers: Controller[],
        params: {
            port: number,
            host: string,
            clientDir: string,
            db: IDatabase
            url : string,
            initOnStart: boolean,
        }
    ){
        this.app = express();
         this.server = createServer(this.app);

        this.port = params.port;
        this.host = params.host;
        this.clientDir = params.clientDir;
        this.db = params.db;
        this.url = params.url;
        this.configureApp(params.initOnStart);
        this.configureMiddlewares();
        this.configureControllers(controllers);

       
    }

    private configureApp(initOnStart: boolean): void {
        //TODO: initialize and connect to the database
    }

    private configureMiddlewares() {
        //serve the static assets from the client directory
        this.app.use(express.static(this.clientDir));

        //this.app.set('view engine', 'pug'); // set the view engine to pug
        //this.app.set('views', this.clientDir + '/views'); // set the views directory for pug templates

        this.app.use(cors()); //for enabling CORS
        this.app.use(morgan('dev')); //for logging requests
        this.app.use(helmet()); //for securing the app by setting various HTTP headers
        this.app.use(compression()); //for compressing the response bodies

        this.app.use(express.json()); //for parsing request's json body
        this.app.use(express.urlencoded({ extended: true }));//for decoding the encoded url
        
    }

    private configureControllers(controllers: Controller[]): void {
        //TODO: add reference to socket.io 
        controllers.forEach((controller) => {
            this.app.use(controller.path, controller.router);
            console.log(`⚡️[Server]: Controller ${controller.path} initialized.`);
        });
    }

    public async listen(): Promise<HttpServer>{
    //listen for incoming requests
    return new Promise<HttpServer>((resolve, reject) => {
        //TODO: set up socket.io connection
        try {
            this.server.listen(this.port, () =>
            {
                console.log(`Server is running on port ${this.port}`);
                resolve(this.server);
            })
        } catch (error) {
            console.error(`Error starting server: ${error}`);
            reject(error);
        }

    })
   }
}



export default App;