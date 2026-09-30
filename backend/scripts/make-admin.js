// Usage: node scripts/make-admin.js <email>
// Promotes the given user to admin in MongoDB Atlas.
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

// Usage:
//   npm run make-admin -- <email>
//   npm run make-admin -- <email> --password <password>     create if missing
//
// Promotes (or creates) the super admin account.
//
// This used to write role: "admin", which no longer exists in the User schema's
// enum. Every run therefore died with a Mongoose ValidationError and the
// documented recovery path for a lost admin role did not work at all.
const mongoose = require('mongoose');
const User = require('../server/models/User');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const passwordIndex = process.argv.indexOf('--password');
  const password = passwordIndex > -1 ? process.argv[passwordIndex + 1] : '';

  if (!email) {
    console.error('Usage: npm run make-admin -- <email> [--password <password>]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Backfill any users missing a role
  await User.updateMany({ role: { $exists: false } }, { $set: { role: 'user' } });

  const existing = await User.findOne({ email });
  if (!existing && !password) {
    console.error(
      `No account exists for ${email}, and no --password was supplied.\n` +
        'Register through the storefront first, or create it directly:\n' +
        `  npm run make-admin -- ${email} --password "<a-strong-password>"`
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const user = existing
    // is_verified is forced on: a super admin who cannot pass the verification
    // gate can never sign in, so the grant would be useless.
    ? await User.findOneAndUpdate(
        { email },
        { $set: { role: 'super_admin', status: 'active', is_verified: true } },
        { returnDocument: 'after' }
      )
    : await User.create({
        name: email.split('@')[0],
        email,
        password,
        role: 'super_admin',
        status: 'active',
        is_verified: true
      });

  console.log(`Super admin ready: ${user.name} <${user.email}>`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
