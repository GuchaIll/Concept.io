const redisClient = require('../config/redis');

const authenticate = async (req : any, res : any, next : any) => {
    if(!req.session.user) {
        return res.status(401).json({message: 'Unauthorized: Cannot create new session'});
    };

    const sessionData = await redisClient.redisClient.get(`session:${req.sessionID}`);
    if(!sessionData) {
        return res.status(401).json({message: 'Unauthorized: Session expired or invalid'});
    }

    req.user = JSON.parse(sessionData);
    next();
};

module.exports = {authenticate};
