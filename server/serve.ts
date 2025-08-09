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
   db: STAGE === 'EARLY' ? new InMemoryDatabase() : new MongoDBDatabase(), // Use InMemoryDatabase for early stage, MongoDBDatabase for production
});
app.listen();