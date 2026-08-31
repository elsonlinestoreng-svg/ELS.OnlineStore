const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const auth = require('../middleware/auth');

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
router.get('/', async (req, res) => {
  try {
    const filter = { public: true };
    
    // Optional: filter by store
    if (req.query.store_id) {
      filter.store_id = req.query.store_id;
    }
    
    // Optional: filter by seller
    if (req.query.seller_id) {
      filter.seller_id = req.query.seller_id;
    }
    
    const products = await Product.find(filter).sort({ created_at: -1 });
    res.json(products);
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    console.error('Get product error:', err);
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
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.seller !== req.user.email) {
      return res.status(403).json({ error: 'You can only edit your own products' });
    }

    const updates = filterBody(req.body);
    
    // Validate price if being updated
    if (updates.price !== undefined && (typeof updates.price !== 'number' || updates.price <= 0)) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.json(updated);
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE product (protected, seller only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.seller !== req.user.email) {
      return res.status(403).json({ error: 'You can only delete your own products' });
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// GET seller's own products
router.get('/seller/mine', auth, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.user.email }).sort({ created_at: -1 });
    res.json(products);
  } catch (err) {
    console.error('Get my products error:', err);
    res.status(500).json({ error: 'Failed to fetch your products' });
  }
});

module.exports = router;
