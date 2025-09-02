// server.js
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
// const path = require('path');
require('dotenv').config();

const User = require('./models/User');

const app = express();
const server = http.createServer(app);

// ✅ Socket.IO setup
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
// app.use(express.static(path.join(__dirname, 'public')));


// ✅ MongoDB connection
const mongoUri = process.env.MONGO_URL;
if (!mongoUri) {
  console.error('Mongo URL not defined in .env!');
  process.exit(1);
}
mongoose.connect(mongoUri)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connect error:', err));

// ✅ In-memory map for live users
const liveUsers = new Map();

// ------------------- ROUTES ------------------- //

// LOGIN ROUTE
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and Password required' });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      password
    }).lean();

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    delete user.password;

    // ✅ Return user object
    res.json({ success: true, message: 'Login successful', user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// REGISTER ROUTE
app.post('/users', async (req, res) => {
  try {
    // sanitize + trim inputs
    const firstName = (req.body.firstName || '').trim();
    const lastName = (req.body.lastName || '').trim();
    const mobile = (req.body.mobile || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const street = (req.body.street || '').trim();
    const city = (req.body.city || '').trim();
    const state = (req.body.state || '').trim();
    const country = (req.body.country || '').trim();
    const loginId = (req.body.loginId || '').trim();
    const password = (req.body.password || '').trim();

    // regex validators
    const nameRegex = /^[A-Za-z]+$/;
    const mobileRegex = /^[0-9]{10}$/;
    const emailRegex = /^\S+@\S+\.\S+$/;
    const loginRegex = /^[A-Za-z0-9]{8}$/;
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{6,}$/;
    const streetRegex = /^[A-Za-z0-9\s,.-]+$/;
    const cityStateCountryRegex = /^[A-Za-z\s]+$/;

    // required checks
    if (!firstName) return res.status(400).json({ success: false, message: 'First Name is required' });
    if (!lastName) return res.status(400).json({ success: false, message: 'Last Name is required' });
    if (!mobile) return res.status(400).json({ success: false, message: 'Mobile is required' });
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
    if (!street) return res.status(400).json({ success: false, message: 'Street is required' });
    if (!city) return res.status(400).json({ success: false, message: 'City is required' });
    if (!state) return res.status(400).json({ success: false, message: 'State is required' });
    if (!country) return res.status(400).json({ success: false, message: 'Country is required' });
    if (!loginId) return res.status(400).json({ success: false, message: 'Login ID is required' });
    if (!password) return res.status(400).json({ success: false, message: 'Password is required' });

    // format validation
    if (!nameRegex.test(firstName)) return res.status(400).json({ success: false, message: 'First Name must contain only letters' });
    if (!nameRegex.test(lastName)) return res.status(400).json({ success: false, message: 'Last Name must contain only letters' });
    if (!mobileRegex.test(mobile)) return res.status(400).json({ success: false, message: 'Mobile must be 10 digits' });
    if (!emailRegex.test(email)) return res.status(400).json({ success: false, message: 'Invalid Email format' });
    if (!streetRegex.test(street)) return res.status(400).json({ success: false, message: 'Street can only have letters, numbers and common punctuation' });
    if (!cityStateCountryRegex.test(city)) return res.status(400).json({ success: false, message: 'City must contain only letters' });
    if (!cityStateCountryRegex.test(state)) return res.status(400).json({ success: false, message: 'State must contain only letters' });
    if (!cityStateCountryRegex.test(country)) return res.status(400).json({ success: false, message: 'Country must contain only letters' });
    if (!loginRegex.test(loginId)) return res.status(400).json({ success: false, message: 'Login ID must be exactly 8 alphanumeric characters' });
    if (!passwordRegex.test(password)) return res.status(400).json({ success: false, message: 'Password must be 6+ chars with 1 uppercase, 1 lowercase & 1 special char' });

    // uniqueness checks
    const existsEmail = await User.findOne({ email });
    if (existsEmail) return res.status(400).json({ success: false, message: 'Email already exists!' });

    const existsMobile = await User.findOne({ mobile });
    if (existsMobile) return res.status(400).json({ success: false, message: 'Mobile already exists!' });

    // create and save user
    const user = new User({
      firstName,
      lastName,
      mobile,
      email,
      street,
      city,
      state,
      country,
      loginId,
      password
    });

    const saved = await user.save();
    const userObj = saved.toObject();
    delete userObj.password; // don't expose password

    // notify viewers / live pages in 'live users' room that a DB user was created
    io.to('live users').emit('user_created_db', {
      email: userObj.email,
      firstName: userObj.firstName,
      lastName: userObj.lastName,
      createdAt: userObj.createdAt,
      id: userObj._id
    });

    res.status(201).json({ success: true, message: 'User saved', user: userObj });
  } catch (err) {
    console.error('POST /users error', err);
    // if duplicate key error (just in case)
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'Duplicate key error' });
    }
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
});

// GET USERS
app.get('/', async (req, res) => {
  try {
    const users = await User.find().select('-password').lean();
    res.json({ success: true, users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------- SOCKET.IO ------------------- //
io.on('connection', socket => {
  console.log('⚡ Socket connected:', socket.id);

  // ✅ User joins after login
  socket.on('join_live_users', user => {
    if (!user?.email) return;

    const email = user.email.toLowerCase().trim();
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();

    // Save in map
    liveUsers.set(socket.id, { socketId: socket.id, email, name });

    // Join live room
    socket.join('live users');

    // Notify everyone
    io.to('live users').emit('live_users_update', Array.from(liveUsers.values()));
    console.log('✅ User joined:', email);
  });

  // ✅ Viewer joins (only watching user list)
  socket.on('viewer_join', () => {
    socket.join('live users');
    socket.emit('live_users_update', Array.from(liveUsers.values()));
  });

  // ✅ Disconnect cleanup
  socket.on('disconnect', () => {
    if (liveUsers.has(socket.id)) {
      console.log('❌ User disconnected:', liveUsers.get(socket.id).email);
      liveUsers.delete(socket.id);
      io.to('live users').emit('live_users_update', Array.from(liveUsers.values()));
    }
  });
});

// ------------------- START SERVER ------------------- //
const PORT = parseInt(process.env.PORT, 10) || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
