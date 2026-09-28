const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const { escapeRegex, toObjectId } = require('../utils/security');

// Whitelist of allowed fields
const ALLOWED_FIELDS = ['name', 'price', 'category', 'description', 'images', 'primary_image', 'image_data', 'public'];

function filterBody(body) {
  const filtered = {};
  ALLOWED_FIELDS.forEach(field => {
    if (body[field] !== undefined) {
      filtered[field] = body[field];
    }
  });
  return filtered;
}

// GET all public products
// Supports: q (search), category, min_price, max_price, sort, page, limit
router.get('/', async (req, res) => {
  try {
    const filter = { public: true };
    const { q, category, min_price, max_price, sort, page, limit } = req.query;

    // Optional: filter by store
    if (req.query.store_id) {
      filter.store_id = req.query.store_id;
    }

    // Optional: filter by seller
    if (req.query.seller_id) {
      filter.seller_id = req.query.seller_id;
    }

    // Search: name or description, case-insensitive.
    // The term is escaped before being handed to $regex. Passing raw user input
    // lets an attacker supply a catastrophic-backtracking pattern and pin the
    // database CPU (ReDoS).
    if (q && q.trim()) {
      const safeTerm = escapeRegex(q.trim().slice(0, 100));
      filter.$or = [
        { name: { $regex: safeTerm, $options: 'i' } },
        { description: { $regex: safeTerm, $options: 'i' } },
        { category: { $regex: safeTerm, $options: 'i' } }
      ];
    }

    // Category filter
    if (category && category.trim()) {
      filter.category = String(category).trim().slice(0, 100);
    }

    // Price range
    if (min_price !== undefined) {
      const min = parseFloat(min_price);
      if (!isNaN(min)) filter.price = { ...(filter.price || {}), $gte: min };
    }
    if (max_price !== undefined) {
      const max = parseFloat(max_price);
      if (!isNaN(max)) filter.price = { ...(filter.price || {}), $lte: max };
    }

    // Sorting
    let sortOptions = { created_at: -1 };
    switch (sort) {
      case 'price_asc': sortOptions = { price: 1 }; break;
      case 'price_desc': sortOptions = { price: -1 }; break;
      case 'rating': sortOptions = { average_rating: -1 }; break;
      case 'newest': sortOptions = { created_at: -1 }; break;
      case 'name': sortOptions = { name: 1 }; break;
    }

    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 0, 0), 100);

    const total = await Product.countDocuments(filter);
    let query = Product.find(filter).sort(sortOptions).select('-image_data');

    if (parsedLimit > 0) {
      query = query.skip((parsedPage - 1) * parsedLimit).limit(parsedLimit);
    }

    const products = await query;

    res.set('X-Total-Count', String(total));
    res.json(products);
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET seller's own products
// NOTE: this must be declared before `/:id`, otherwise Express matches
// "/seller/mine" against the id parameter and returns 404/500.
router.get('/seller/mine', auth, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.user.email })
      .sort({ created_at: -1 })
      .select('-image_data');
    res.json(products);
  } catch (err) {
    console.error('Get my products error:', err && err.message);
    res.status(500).json({ error: 'Failed to fetch your products' });
  }
});

// GET single product
router.get('/:id', async (req, res) => {
  try {
    const productId = toObjectId(req.params.id);
    if (!productId) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const product = await Product.findById(productId).select('-image_data');
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    console.error('Get product error:', err && err.message);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// CREATE product (protected, whitelisted fields only)
router.post('/', auth, async (req, res) => {
  try {
    const productData = filterBody(req.body);

    if (!productData.name || !productData.price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    // Price must be positive number
    if (typeof productData.price !== 'number' || productData.price <= 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    productData.seller = req.user.email;
    productData.category = productData.category || 'Other';
    productData.description = productData.description || '';

    const product = new Product(productData);
    await product.save();

    res.status(201).json(product);
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// UPDATE product (protected, seller only, whitelisted fields)
router.put('/:id', auth, async (req, res) => {
  try {
    const productId = toObjectId(req.params.id);
    if (!productId) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.seller !== req.user.email) {
      return res.status(403).json({ error: 'You can only edit your own products' });
    }

    const updates = filterBody(req.body);

    // Validate price if being updated
    if (updates.price !== undefined && (typeof updates.price !== 'number' || !isFinite(updates.price) || updates.price <= 0)) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    const updated = await Product.findByIdAndUpdate(
      productId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-image_data');

    res.json(updated);
  } catch (err) {
    console.error('Update product error:', err && err.message);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE product (protected, seller only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const productId = toObjectId(req.params.id);
    if (!productId) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.seller !== req.user.email) {
      return res.status(403).json({ error: 'You can only delete your own products' });
    }

    await Product.findByIdAndDelete(productId);
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    console.error('Delete product error:', err && err.message);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;
