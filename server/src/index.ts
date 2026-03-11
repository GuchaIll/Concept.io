//import express from 'express'
//import {createServer } from 'http';
//import {WebSocketServer} from './WebSocketServer';
//import cors from 'cors';

//const app = express();
//app.use(cors());
//app.use(express.json());

//app.get('/', (req, res) => {
  //res.json({ message: 'Server is running' });
//});

//const server = createServer(app);
//const wsServer = new WebSocketServer(server);


//const PORT =  5000;

//server.listen(PORT, '0.0.0.0', () => {
    //console.log(`Server is running on port ${PORT}`);
//});

import path from 'path';
import App from './app';
import {PORT, HOST, STAGE, ENV, DB_DRIVER} from './env'
import {InMemoryDatabase} from './db/inMemory.db';
import {MongoDBDatabase} from './db/mongo.db';
import {PostgresDatabase} from './db/postgres.db';
import {VersionController} from './controllers/version.controller';
import {GenerationController} from './controllers/generation.controller';
import {CutoutController} from './controllers/cutout.controller';
import {EditController} from './controllers/edit.controller';
import {ProjectController} from './controllers/project.controller';
import {SyncController} from './controllers/sync.controller';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

//import all controllers

const app = new App([
    // Add controllers here
    new ProjectController(),
    new VersionController(),
    new GenerationController(),
    new CutoutController(),
    new EditController(),
    new SyncController(),
    ],
    {clientDir : path.join(__dirname, '../client'),
        initOnStart: true,
        host: HOST,
        port: PORT,
        url: `${HOST}${ENV === 'LOCAL' ? ':' + PORT.toString() : ''}`,
        // DB_DRIVER=postgres for persistent storage, 'memory' for dev/testing
        db: DB_DRIVER === 'postgres' ? new PostgresDatabase() : new InMemoryDatabase(),
    });

app.listen();