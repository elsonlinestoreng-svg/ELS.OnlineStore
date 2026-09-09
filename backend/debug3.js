require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const pid = new mongoose.Types.ObjectId('6a7c78ee4f1965e4805703a2');
  const Review = mongoose.model('Review', require('./server/models/Review').schema);
  console.log('find count:', await Review.countDocuments({ product_id: pid }));
  const agg = await Review.aggregate([
    { $match: { product_id: pid } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  console.log('aggregate:', JSON.stringify(agg));
  const aggString = await Review.aggregate([
    { $match: { product_id: '6a7c78ee4f1965e4805703a2' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  console.log('aggregate w/ string:', JSON.stringify(aggString));
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error('ERR', e.message); process.exit(1); });
