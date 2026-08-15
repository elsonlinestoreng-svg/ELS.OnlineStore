require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('./models/User');
const Store = require('./models/Store');
const Product = require('./models/Product');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected');

  // Delete old seed users
  await User.deleteMany({ email: /seller\d@test\.com|buyer@test\.com/ });
  await Store.deleteMany({ store_name: { $in: ['Tech Hub', 'Fashion Spot', 'Home Essentials'] } });
  await Product.deleteMany({ seller: /seller\d@test\.com/ });
  console.log('Cleared old data');

  // Create users — DO NOT hash, the model pre-save hook does it
  const seller1 = await User.create({ name: 'Alice Muthoni', email: 'seller1@test.com', password: 'password123' });
  const seller2 = await User.create({ name: 'Brian Ochieng', email: 'seller2@test.com', password: 'password123' });
  const seller3 = await User.create({ name: 'Carol Wanjiku', email: 'seller3@test.com', password: 'password123' });
  const buyer = await User.create({ name: 'David Buyer', email: 'buyer@test.com', password: 'password123' });
  console.log('Users created');

  // Create stores
  const store1 = await Store.create({ owner_id: seller1._id, store_name: 'Tech Hub', description: 'Latest gadgets and accessories.', bank_account_name: 'Alice Muthoni', bank_account_number: '1111', bank_name: 'KCB', status: 'active' });
  const store2 = await Store.create({ owner_id: seller2._id, store_name: 'Fashion Spot', description: 'Trendy fashion for every occasion.', bank_account_name: 'Brian Ochieng', bank_account_number: '2222', bank_name: 'Equity', status: 'active' });
  const store3 = await Store.create({ owner_id: seller3._id, store_name: 'Home Essentials', description: 'Beautiful home decor.', bank_account_name: 'Carol Wanjiku', bank_account_number: '3333', bank_name: 'Co-operative', status: 'active' });
  console.log('Stores created');

  const products = [
    { name: 'Wireless Earbuds', price: 2500, category: 'Electronics', description: 'Premium sound, 24hr battery.', seller: 'seller1@test.com' },
    { name: 'Phone Stand', price: 800, category: 'Electronics', description: 'Adjustable aluminum stand.', seller: 'seller1@test.com' },
    { name: 'USB-C Cable', price: 500, category: 'Electronics', description: 'Fast charging, 2m.', seller: 'seller1@test.com' },
    { name: 'Denim Jacket', price: 3500, category: 'Fashion', description: 'Classic blue denim.', seller: 'seller2@test.com' },
    { name: 'Running Shoes', price: 4500, category: 'Fashion', description: 'Lightweight, cushioned.', seller: 'seller2@test.com' },
    { name: 'Leather Bag', price: 2800, category: 'Fashion', description: 'Genuine leather crossbody.', seller: 'seller2@test.com' },
    { name: 'Table Lamp', price: 1500, category: 'Home', description: 'Modern LED, touch control.', seller: 'seller3@test.com' },
    { name: 'Wall Clock', price: 1200, category: 'Home', description: 'Minimalist silent clock.', seller: 'seller3@test.com' },
    { name: 'Throw Pillow', price: 900, category: 'Home', description: 'Soft cotton, multiple colors.', seller: 'seller3@test.com' },
  ];
  await Product.insertMany(products);
  console.log('Products created');

  console.log('\n✅ SEED COMPLETE');
  console.log('seller1@test.com / password123');
  console.log('seller2@test.com / password123');
  console.log('seller3@test.com / password123');
  console.log('buyer@test.com / password123');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
