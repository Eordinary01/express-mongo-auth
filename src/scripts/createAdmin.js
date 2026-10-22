// Usage: npm run create-admin -- <email> <password> [name]
// Creates an admin user, or promotes an existing user to admin.
const { mongoUri } = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const { User } = require('../models/User');

async function main() {
  const [email, password, name = 'Admin'] = process.argv.slice(2);
  if (!email) {
    console.error('Usage: npm run create-admin -- <email> <password> [name]');
    process.exit(1);
  }

  await connectDB(mongoUri);
  const existing = await User.findOne({ email: email.toLowerCase() });

  if (existing) {
    existing.role = 'admin';
    await existing.save();
    console.log(`Promoted ${existing.email} to admin`);
  } else {
    if (!password) throw new Error('Password is required when creating a new user');
    const user = await User.create({ name, email, password, role: 'admin' });
    console.log(`Created admin ${user.email}`);
  }
  await disconnectDB();
}

main().catch(async (err) => {
  console.error(err.message);
  await disconnectDB();
  process.exit(1);
});
