const express = require('express')
const redisClient = require('../config/redis');
const User = require('../models/User');

const router = express.Router();


router.post('/register', async (req : any, res : any) => {
    const {username, password} = req.body;

    try {
        const userExists = await User.findOne({username});
        if(userExists) {
            return res.status(400).json({message: 'Username already taken'});
        }

        const newUser = new User({username, password});
        await newUser.save();

        res.status(201).json({message: 'User registered successfully'});
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({message: 'Internal server error'});

    }
});

router.post('/login', async (req : any, res : any) => {
    const {username, password} = req.body;

    try{
        const user = await User.findOne({username});
        if(!user || user.password !== password) {
            return res.status(401).json({message: 'Invalid username or password'});
        }

        req.session.user = {id: user._id, username: user.username};
        await redisClient.redisClient.set(`session:${req.sessionID}`, JSON.stringify(req.session.user), {
            EX: 3600 // Session expires in 1 hour
        });

        res.json({msg: 'Login successful', user: req.session.user});
    } catch (error) {
        console.error('Error logging in user:', error);
        res.status(500).json({message: 'Internal server error'});
    }
});

router.post('/logout', async (req : any, res : any) => {
    if(!req.session.user) {
        return res.status(400).json({message: 'No active session'});
    }
    
    try {
        await redisClient.redisClient.del(`session:${req.sessionID}`);
        req.session.destroy((err : any) => {
            res.clearCookie('connect.sid');
            res.json({msg: 'Logout successful'});
        });
    } catch (error) {
        console.error('Error logging out user:', error);
        res.status(500).json({message: 'Internal server error'});
    }
});

module.exports = router;