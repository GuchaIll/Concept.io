import express from 'express'
import {createServer } from 'http';
import {WebSocketServer} from './WebSocketServer';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wsServer = new WebSocketServer(server);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});