const app = require('./app');
const { port, mongoUri } = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');

async function start() {
  await connectDB(mongoUri);
  console.log('Connected to MongoDB');

  const server = app.listen(port, () => console.log(`Server listening on port ${port}`));

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
