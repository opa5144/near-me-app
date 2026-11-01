const express = require('express'); 
const argon2 = require('argon2');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const { createSession, requireAuth } = require('../middleware/requireAuth');

const router = express.Router(); 

// Validate and normalize signup fields before saving an account in AccountList.
router.post('/signup', async (req, res)=>{//signup endpoint for creating new user accounts
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

        await User.init(); //ensures indexes are created before checking for duplicates

        // Argon2id hashes the exact password, including spaces; plaintext is never saved.
        const passwordHash = await argon2.hash(password, {type: argon2.argon2id,}); //hashing password 

        const user = await User.create({//creates new user account
            ...account,
            passwordHash,
        });
        // Return only account fields the app needs, excluding the stored password hash.
        return res.status(201).json({//success response
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


// Successful password verification creates the session token used by protected event routes.
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    const invalidCredentials = 'Invalid email or password.';
    if (Array.from(password).length > 128) {
      return res.status(401).json({ message: invalidCredentials });
    }
    // Password hashes are normally hidden; include this one only to verify the password.
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      return res.status(401).json({ message: invalidCredentials });
    }

    // The client keeps this token and sends it in future Authorization headers.
    const session = await createSession(user._id);
    return res.status(200).json({
      message: 'Login successful.',
      ...session,
      user: {
        _id: user._id, firstName: user.firstName, lastName: user.lastName,
        username: user.username, email: user.email,
      },
    });
  } catch (err) {
    console.error('Login failed:', err.name);
    return res.status(500).json({ message: 'Unable to log in. Please try again.' });
  }
});

// Restore the signed-in profile from the session instead of trusting a client-supplied user ID.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('_id firstName lastName username email');
    if (!user) return res.status(401).json({ message: 'Please log in again.' });
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to load your account.' });
  }
});

// Remove only this login session, immediately invalidating its token.
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await AuthSession.deleteOne({ _id: req.authSessionId });
    return res.sendStatus(204);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to log out. Please try again.' });
  }
});

module.exports = router;
