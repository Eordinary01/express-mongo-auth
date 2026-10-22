const { User, MAX_SESSIONS } = require('../models/User');
const ApiError = require('../utils/ApiError');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('../utils/tokens');
const { isProduction, cookieSameSite } = require('../config/env');

const REFRESH_COOKIE = 'refreshToken';

const cookieOptions = (expiresAt) => ({
  httpOnly: true,
  secure: isProduction || cookieSameSite === 'none',
  sameSite: cookieSameSite,
  path: '/api/auth',
  expires: expiresAt,
});

const revokeAllSessions = (userId) =>
  User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 }, $set: { refreshTokens: [] } });

/**
 * Atomically stores a new refresh token hash (dropping expired ones and, on rotation,
 * the replaced one). The write only applies if the user's tokenVersion is unchanged and,
 * when rotating, the replaced token is still present; returns null otherwise.
 */
async function issueTokens(user, res, replacedHash) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const { exp } = verifyRefreshToken(refreshToken);
  const expiresAt = new Date(exp * 1000);

  const filter = { _id: user._id, tokenVersion: user.tokenVersion };
  if (replacedHash) filter['refreshTokens.tokenHash'] = replacedHash;

  const keep = {
    $filter: {
      input: { $ifNull: ['$refreshTokens', []] },
      cond: {
        $and: [
          { $gt: ['$$this.expiresAt', new Date()] },
          { $ne: ['$$this.tokenHash', replacedHash ?? null] },
        ],
      },
    },
  };
  const { matchedCount } = await User.updateOne(filter, [
    {
      $set: {
        refreshTokens: {
          $slice: [
            { $concatArrays: [keep, [{ tokenHash: hashToken(refreshToken), expiresAt }]] },
            -MAX_SESSIONS,
          ],
        },
      },
    },
  ]);
  if (matchedCount === 0) return null;

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
  const tokens = await issueTokens(user, res);
  if (!tokens) throw ApiError.unauthorized('Session was revoked, please log in');

  res.status(201).json({ success: true, user, ...tokens });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const tokens = await issueTokens(user, res);
  if (!tokens) throw ApiError.unauthorized('Session was revoked, please try again');
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

  const user = await User.findById(payload.sub);
  if (!user || payload.ver !== user.tokenVersion) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const tokens = await issueTokens(user, res, hashToken(token));
  if (!tokens) {
    // Valid signature and version but not stored: the token was already rotated (possible theft),
    // or sessions were revoked concurrently. Either way, revoke everything.
    await revokeAllSessions(user._id);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    throw ApiError.unauthorized('Refresh token reuse detected; all sessions revoked');
  }
  res.json({ success: true, ...tokens });
};

exports.logout = async (req, res) => {
  const token = getRefreshToken(req);
  if (token) {
    const tokenHash = hashToken(token);
    await User.updateOne(
      { 'refreshTokens.tokenHash': tokenHash },
      { $pull: { refreshTokens: { tokenHash } } },
    );
  }
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  res.json({ success: true, message: 'Logged out' });
};

exports.logoutAll = async (req, res) => {
  await revokeAllSessions(req.user._id);
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  res.json({ success: true, message: 'Logged out from all sessions' });
};

exports.me = async (req, res) => {
  res.json({ success: true, user: req.user });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.unauthorized('Current password is incorrect');
  }

  user.password = newPassword;
  await user.save();
  await revokeAllSessions(user._id);

  const fresh = await User.findById(user._id);
  const tokens = await issueTokens(fresh, res);
  if (!tokens) throw ApiError.unauthorized('Session was revoked, please log in');
  res.json({ success: true, message: 'Password updated', ...tokens });
};
