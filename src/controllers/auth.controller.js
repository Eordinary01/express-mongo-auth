const { User } = require('../models/User');
const ApiError = require('../utils/ApiError');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('../utils/tokens');
const { isProduction } = require('../config/env');

const REFRESH_COOKIE = 'refreshToken';

const cookieOptions = (expiresAt) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/api/auth',
  expires: expiresAt,
});

async function issueTokens(user, res) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const { exp } = verifyRefreshToken(refreshToken);
  const expiresAt = new Date(exp * 1000);

  user.addRefreshToken(hashToken(refreshToken), expiresAt);
  await user.save();

  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(expiresAt));
  return { accessToken, refreshToken };
}

const getRefreshToken = (req) => req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;

exports.register = async (req, res) => {
  const { name, email, password } = req.body;

  if (await User.exists({ email })) {
    throw ApiError.conflict('Email is already registered');
  }

  const user = await User.create({ name, email, password });
  const userWithTokens = await User.findById(user.id).select('+refreshTokens');
  const tokens = await issueTokens(userWithTokens, res);

  res.status(201).json({ success: true, user, ...tokens });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password +refreshTokens');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const tokens = await issueTokens(user, res);
  res.json({ success: true, user, ...tokens });
};

exports.refresh = async (req, res) => {
  const token = getRefreshToken(req);
  if (!token) throw ApiError.unauthorized('Refresh token missing');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (!user) throw ApiError.unauthorized('Invalid or expired refresh token');

  const tokenHash = hashToken(token);
  const stored = user.refreshTokens.find((t) => t.tokenHash === tokenHash);

  if (!stored) {
    // A valid but unknown token means it was already rotated: possible theft, revoke all sessions.
    user.refreshTokens = [];
    await user.save();
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    throw ApiError.unauthorized('Refresh token reuse detected; all sessions revoked');
  }

  user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
  const tokens = await issueTokens(user, res);
  res.json({ success: true, ...tokens });
};

exports.logout = async (req, res) => {
  const token = getRefreshToken(req);
  if (token) {
    await User.updateOne(
      { 'refreshTokens.tokenHash': hashToken(token) },
      { $pull: { refreshTokens: { tokenHash: hashToken(token) } } },
    );
  }
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  res.json({ success: true, message: 'Logged out' });
};

exports.logoutAll = async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $set: { refreshTokens: [] } });
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  res.json({ success: true, message: 'Logged out from all sessions' });
};

exports.me = async (req, res) => {
  res.json({ success: true, user: req.user });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user.id).select('+password +refreshTokens');

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.unauthorized('Current password is incorrect');
  }

  user.password = newPassword;
  user.refreshTokens = [];
  const tokens = await issueTokens(user, res);
  res.json({ success: true, message: 'Password updated', ...tokens });
};
