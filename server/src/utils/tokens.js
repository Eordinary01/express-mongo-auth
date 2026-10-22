const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/env');

const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role, ver: user.tokenVersion }, jwtConfig.accessSecret, {
    expiresIn: jwtConfig.accessExpiresIn,
  });

const signRefreshToken = (user) =>
  jwt.sign({ sub: user.id, ver: user.tokenVersion, jti: crypto.randomUUID() }, jwtConfig.refreshSecret, {
    expiresIn: jwtConfig.refreshExpiresIn,
  });

const verifyAccessToken = (token) => jwt.verify(token, jwtConfig.accessSecret);
const verifyRefreshToken = (token) => jwt.verify(token, jwtConfig.refreshSecret);

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
};
