const path = require('path');

require('dotenv').config({ quiet: true });

const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const SAME_SITE_VALUES = ['strict', 'lax', 'none'];

const nodeEnv = process.env.NODE_ENV || 'development';
const isTest = nodeEnv === 'test';

const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest,
  port: Number(process.env.PORT) || 5000,
  mongoUri: required('MONGO_URI', isTest ? 'mongodb://127.0.0.1:27017/auth_test' : undefined),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', isTest ? 'test-access-secret' : undefined),
    refreshSecret: required('JWT_REFRESH_SECRET', isTest ? 'test-refresh-secret' : undefined),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || (isTest ? 4 : 12),
  corsOrigin: process.env.CORS_ORIGIN || '',
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'strict').toLowerCase(),
  // Built demo client to serve from the API (served only if the directory exists).
  clientDist: process.env.CLIENT_DIST || path.join(__dirname, '..', '..', '..', 'client', 'dist'),
};

if (!SAME_SITE_VALUES.includes(config.cookieSameSite)) {
  throw new Error(`COOKIE_SAMESITE must be one of: ${SAME_SITE_VALUES.join(', ')}`);
}

module.exports = config;
