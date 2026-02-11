require('dotenv').config();
const {createClient} = require('redis');

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err : any) => console.log('Redis Client Error', err));

(async () => {
    try {
        await redisClient.connect();
        console.log('Connected to Redis');
    }
    catch (error) {
        console.error('Could not connect to Redis', error);
    }
})();

module.exports = {redisClient};