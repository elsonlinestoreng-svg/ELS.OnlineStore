const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Store = require('../models/Store');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Helper: Find store by product
async function findStoreForProduct(product) {
  // Try by seller field (could be email or ObjectId)
  if (product.seller) {
    // If seller is an ObjectId
    if (product.seller.match && product.seller.match(/^[0-9a-fA-F]{24}$/)) {
      const store = await Store.findOne({ owner_id: product.seller });
      if (store) return store;
    }
    
    // If seller is an email
    const user = await User.findOne({ email: product.seller });
    if (user) {
      const store = await Store.findOne({ owner_id: user._id });
      if (store) return store;
    }
  }
  
  // Try by owner_id
  if (product.owner_id) {
    const store = await Store.findOne({ owner_id: product.owner_id });
    if (store) return store;
  }
  
  return null;
}

// Get buyer's cart
router.get('/', auth, async (req, res) => {
  try {
    let cart = await Cart.findOne({ buyer_id: req.user.userId });

    if (!cart) {
      return res.json({
        success: true,
        cart: { items: [], grouped: {} },
        total: 0,
        count: 0
      });
    }

    const grouped = {};
    cart.items.forEach(item => {
      const storeKey = item.store_id ? item.store_id.toString() : 'unknown';
      if (!grouped[storeKey]) {
        grouped[storeKey] = {
          store_id: item.store_id,
          seller_id: item.seller_id,
          items: [],
          subtotal: 0
        };
      }
      grouped[storeKey].items.push(item);
      grouped[storeKey].subtotal += item.price * item.quantity;
    });

    const total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    res.json({
      success: true,
      cart: { items: cart.items, grouped: Object.values(grouped) },
      total,
      count: cart.items.length
    });
  } catch (err) {
    console.error('Get cart error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch cart' });
  }
});

// Add item to cart
router.post('/add', auth, async (req, res) => {
  try {
    const { product_id, quantity } = req.body;

    if (!product_id) {
      return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    const product = await Product.findById(product_id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (product.public === false) {
      return res.status(400).json({ success: false, message: 'Product is not available' });
    }

    // Find store for this product
    const store = await findStoreForProduct(product);
    if (!store) {
      return res.status(404).json({ 
        success: false, 
        message: 'This product\'s seller has not set up their store yet' 
      });
    }

    const qty = parseInt(quantity) || 1;
    if (qty < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
    }

    let cart = await Cart.findOne({ buyer_id: req.user.userId });
    if (!cart) {
      cart = new Cart({ buyer_id: req.user.userId, items: [] });
    }

    const existingIndex = cart.items.findIndex(
      item => item.product_id.toString() === product_id
    );

    if (existingIndex > -1) {
      cart.items[existingIndex].quantity += qty;
      cart.items[existingIndex].price = product.price;
    } else {
      cart.items.push({
        product_id: product._id,
        store_id: store._id,
        seller_id: store.owner_id,
        name: product.name,
        price: product.price,
        quantity: qty,
        image_url: product.primary_image || (product.images && product.images[0]) || ''
      });
    }

    await cart.save();

    res.json({
      success: true,
      message: 'Item added to cart',
      itemCount: cart.items.length
    });
  } catch (err) {
    console.error('Add to cart error:', err);
    res.status(500).json({ success: false, message: 'Failed to add to cart' });
  }
});

// Update item quantity
router.put('/item/:productId', auth, async (req, res) => {
  try {
    const { quantity } = req.body;
    const qty = parseInt(quantity);

    if (!qty || qty < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
    }

    const cart = await Cart.findOne({ buyer_id: req.user.userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const item = cart.items.find(
      item => item.product_id.toString() === req.params.productId
    );

    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not in cart' });
    }

    const product = await Product.findById(req.params.productId);
    if (product) {
      item.price = product.price;
    }

    item.quantity = qty;
    await cart.save();

    res.json({ success: true, message: 'Quantity updated', cart });
  } catch (err) {
    console.error('Update cart error:', err);
    res.status(500).json({ success: false, message: 'Failed to update item' });
  }
});

// Remove item from cart
router.delete('/item/:productId', auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ buyer_id: req.user.userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.items = cart.items.filter(
      item => item.product_id.toString() !== req.params.productId
    );

    await cart.save();

    res.json({
      success: true,
      message: 'Item removed from cart',
      itemCount: cart.items.length
    });
  } catch (err) {
    console.error('Remove from cart error:', err);
    res.status(500).json({ success: false, message: 'Failed to remove item' });
  }
});

// Clear entire cart
router.delete('/', auth, async (req, res) => {
  try {
    await Cart.findOneAndDelete({ buyer_id: req.user.userId });
    res.json({ success: true, message: 'Cart cleared' });
  } catch (err) {
    console.error('Clear cart error:', err);
    res.status(500).json({ success: false, message: 'Failed to clear cart' });
  }
});

module.exports = router;
