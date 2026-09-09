// Usage: node scripts/make-admin.js <email>
// Promotes the given user to admin in MongoDB Atlas.
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const User = require('../server/models/User');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run make-admin -- <email>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Backfill any users missing a role
  await User.updateMany({ role: { $exists: false } }, { $set: { role: 'user' } });

  const user = await User.findOneAndUpdate(
    { email },
    { $set: { role: 'admin' } },
    { new: true }
  );

  if (!user) {
    console.error('No user found with email: ' + email);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('Promoted to admin: ' + user.name + ' <' + user.email + '>');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
