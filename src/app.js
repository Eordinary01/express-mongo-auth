const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { corsOrigin } = require('./config/env');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

app.use(helmet());
if (corsOrigin === '*') {
  app.use(cors({ origin: '*', credentials: false }));
} else if (corsOrigin) {
  const origins = corsOrigin.split(',').map((o) => o.trim());
  app.use(cors({ origin: origins, credentials: true }));
}
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
