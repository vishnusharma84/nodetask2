const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  mobile: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  street: String,
  city: String,
  state: String,
  country: String,
  loginId: String,
  password: String,
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
