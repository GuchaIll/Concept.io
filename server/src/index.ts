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

//import all controllers

const app = new App([
//Add controllers here
    ],
    {clientDir : path.join(__dirname, '../client'),
        initOnStart: true,
        host: HOST,
        port: PORT,
        url: `${HOST}${ENV === 'LOCAL' ? ':' + PORT.toString() : ''}`,
        db: new InMemoryDatabase()
        //db: STAGE === 'EARLY' ? new InMemoryDatabase() : new MongoDBDatabase(), 
        // Use InMemoryDatabase for early stage, MongoDBDatabase for production
    });

app.listen();