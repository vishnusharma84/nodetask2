// server.js
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
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
app.use(express.static(path.join(__dirname, 'public')));

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
    const { firstName, lastName, mobile, email, street, city, state, country, loginId, password } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const exists = await User.findOne({ $or: [{ email }, { mobile }] });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Email or Mobile already exists' });
    }

    const user = new User({
      firstName,
      lastName,
      mobile,
      email: email.toLowerCase().trim(),
      street,
      city,
      state,
      country,
      loginId,
      password
    });

    const saved = await user.save();
    const userObj = saved.toObject();
    delete userObj.password;

    // ✅ Notify all live viewers
    io.to('live users').emit('user_created_db', userObj);

    res.status(201).json({ success: true, message: 'User saved', user: userObj });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
});

// GET USERS
app.get('/users', async (req, res) => {
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
