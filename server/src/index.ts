import express from 'express'
import {createServer } from 'http';
import {WebSocketServer} from './WebSocketServer';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Server is running' });
});

const server = createServer(app);
const wsServer = new WebSocketServer(server);


const PORT =  5000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});