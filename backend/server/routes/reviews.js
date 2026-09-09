const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// Recompute and store the product's average rating + count
async function refreshProductRating(productId) {
  const pid = productId instanceof mongoose.Types.ObjectId ? productId : new mongoose.Types.ObjectId(String(productId));
  const stats = await Review.aggregate([
    { $match: { product_id: pid } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);

  const result = stats[0] || { avg: 0, count: 0 };
  await Product.findByIdAndUpdate(pid, {
    $set: {
      average_rating: Math.round(result.avg * 10) / 10,
      rating_count: result.count
    }
  });
}

// POST /api/reviews — create a review (verified buyers only)
router.post('/', auth, async (req, res) => {
  try {
    const { product_id, rating, comment, order_id } = req.body;

    if (!product_id || !rating) {
      return res.status(400).json({ success: false, message: 'product_id and rating are required' });
    }

    const parsedRating = parseInt(rating);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be a whole number between 1 and 5' });
    }

    const product = await Product.findById(product_id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Verified purchase check: an order for this product where the buyer has paid
    const orderQuery = {
      buyer_id: req.user.userId,
      'items.product_id': product_id,
      payment_status: 'paid'
    };
    if (order_id) {
      orderQuery._id = order_id;
    }

    const order = await Order.findOne(orderQuery);
    if (!order) {
      return res.status(403).json({ success: false, message: 'You can only review products you have paid for' });
    }

    const existing = await Review.findOne({ product_id, buyer_id: req.user.userId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this product' });
    }

    const review = new Review({
      product_id,
      buyer_id: req.user.userId,
      order_id: order._id,
      rating: parsedRating,
      comment: comment || ''
    });
    await review.save();

    await refreshProductRating(product_id);

    res.status(201).json({ success: true, message: 'Review submitted', review });
  } catch (err) {
    console.error('Create review error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit review' });
  }
});

// GET /api/reviews/product/:productId — public reviews for a product
router.get('/product/:productId', async (req, res) => {
  try {
    const reviews = await Review.find({ product_id: req.params.productId })
      .sort({ created_at: -1 })
      .populate('buyer_id', 'name');

    const product = await Product.findById(req.params.productId).select('average_rating rating_count');

    res.json({
      success: true,
      product_id: req.params.productId,
      average_rating: product ? product.average_rating : 0,
      rating_count: product ? product.rating_count : reviews.length,
      reviews
    });
  } catch (err) {
    console.error('Get product reviews error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  }
});

// GET /api/reviews/mine — my reviews
router.get('/mine', auth, async (req, res) => {
  try {
    const reviews = await Review.find({ buyer_id: req.user.userId })
      .sort({ created_at: -1 })
      .populate('product_id', 'name primary_image images');

    res.json({ success: true, reviews, count: reviews.length });
  } catch (err) {
    console.error('Get my reviews error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch your reviews' });
  }
});

// PUT /api/reviews/:id — update own review
router.put('/:id', auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (review.buyer_id.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'You can only edit your own review' });
    }

    if (req.body.rating !== undefined) {
      const parsedRating = parseInt(req.body.rating);
      if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        return res.status(400).json({ success: false, message: 'Rating must be a whole number between 1 and 5' });
      }
      review.rating = parsedRating;
    }
    if (req.body.comment !== undefined) {
      review.comment = req.body.comment;
    }

    await review.save();
    await refreshProductRating(review.product_id);

    res.json({ success: true, message: 'Review updated', review });
  } catch (err) {
    console.error('Update review error:', err);
    res.status(500).json({ success: false, message: 'Failed to update review' });
  }
});

// DELETE /api/reviews/:id — delete own review
router.delete('/:id', auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (review.buyer_id.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'You can only delete your own review' });
    }

    const productId = review.product_id;
    await Review.findByIdAndDelete(review._id);
    await refreshProductRating(productId);

    res.json({ success: true, message: 'Review deleted' });
  } catch (err) {
    console.error('Delete review error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete review' });
  }
});

module.exports = router;
