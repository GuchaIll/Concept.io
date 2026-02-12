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
import {PORT, HOST, STAGE, ENV} from './env'
import {InMemoryDatabase} from './db/inMemory.db';
import {MongoDBDatabase} from './db/mongo.db';
import {PostgresDatabase} from './db/postgres.db';
import {VersionController} from './controllers/version.controller';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

//import all controllers

const app = new App([
    // Add controllers here
    new VersionController(),
    ],
    {clientDir : path.join(__dirname, '../client'),
        initOnStart: true,
        host: HOST,
        port: PORT,
        url: `${HOST}${ENV === 'LOCAL' ? ':' + PORT.toString() : ''}`,
        // Use InMemoryDatabase for testing without PostgreSQL
        db: new InMemoryDatabase()
        // For production with Postgres: new PostgresDatabase()
    });

app.listen();