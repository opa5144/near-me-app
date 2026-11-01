const express = require('express'); 
const argon2 = require('argon2');
const User = require('../models/User');

const router = express.Router(); 

router.post('/signup', async (req, res)=>{
    try{
        const {firstName, lastName, username, email, password} = req.body ?? {}; //reads input
        const values = [firstName, lastName, username, email, password]; 
        
        if(!values.every(value => typeof value === 'string')){ //validates input
            return res.status(400).json({
                message: 'All fields must be text',
            })
        }

        const account = { //normalize input
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            username: username.trim(),
            email: email.trim().toLowerCase(), 
        };
        if(Object.values(account).some(value => value.length === 0)){ 
            return res.status(400).json({
                message: 'All fields are required',
            });
        }

        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)){ //valid email checking 
            return res.status(400).json({
                message: 'Please enter a valid email address',
            }); 
        }

        const passwordLength = Array.from(password).length; //password length checking 
        if (passwordLength < 15 || passwordLength > 128) {
            return res.status(400).json({
                message: 'Password must contain 15 to 128 characters.',
            });
        }

        await User.init(); 

        const passwordHash = await argon2.hash(password, {type: argon2.argon2id,}); //hashing password 

        const user = await User.create({//fields to be sent to database 
            ...account,
            passwordHash,
        });
        return res.status(201).json({
            message: 'Account Created.',
            user:{
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                username: user.username,
                email: user.email,
            },
        });
    } catch (err){
        if (err.code === 11000) { //mongodb duplicate error
        return res.status(409).json({
            message: 'Username or email is already in use.',
        });
        }

        if (err.name === 'ValidationError') {
        return res.status(400).json({
            message: 'Please check your account details.',
        });
        }

        console.error('Signup failed:', err.name);

        return res.status(500).json({
        message: 'Unable to create your account. Please try again.',
        });
    }
});

module.exports = router;