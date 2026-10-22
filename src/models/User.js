const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { bcryptSaltRounds } = require('../config/env');

const ROLES = ['user', 'admin'];
const MAX_SESSIONS = 5;

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ROLES, default: 'user' },
    // Bumped to revoke every outstanding access and refresh token for the user.
    tokenVersion: { type: Number, default: 0 },
    refreshTokens: { type: [refreshTokenSchema], select: false, default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        delete ret.refreshTokens;
        delete ret.tokenVersion;
        return ret;
      },
    },
  },
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, bcryptSaltRounds);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = { User, ROLES, MAX_SESSIONS };
