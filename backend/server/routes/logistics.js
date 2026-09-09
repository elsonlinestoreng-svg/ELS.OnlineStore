const express = require('express');
const router = express.Router();
const Logistics = require('../models/Logistics');
const Order = require('../models/Order');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { notify } = require('../services/notify');

function generateTrackingNumber() {
  return 'ELS-TRK-' + Date.now().toString(36).toUpperCase() + '-' +
    Math.random().toString(36).substring(2, 8).toUpperCase();
}

// POST /api/logistics/orders/:orderId/book — seller books a pickup for their order
router.post('/orders/:orderId/book', auth, async (req, res) => {
  try {
    const { logistics_fee, pickup_address } = req.body;

    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.seller_id.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Only the seller can book a pickup' });
    }

    const existing = await Logistics.findOne({ order_id: order._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A shipment already exists for this order' });
    }

    const tracking_number = generateTrackingNumber();

    const shipment = new Logistics({
      order_id: order._id,
      store_id: order.store_id,
      seller_id: order.seller_id,
      buyer_id: order.buyer_id,
      status: 'awaiting_pickup',
      tracking_number,
      logistics_fee: logistics_fee || 0,
      pickup_address: pickup_address || '',
      delivery_address: order.shipping_address || {},
      estimated_delivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      tracking_events: [{
        status: 'awaiting_pickup',
        note: 'Pickup booked by seller',
        courier_id: req.user.userId
      }]
    });

    await shipment.save();

    try {
      await notify(order.buyer_id, {
        type: 'logistics',
        title: 'Pickup booked for ' + order.order_reference,
        message: 'Your order is awaiting pickup by a courier. Tracking: ' + tracking_number,
        data: { order_id: order._id, tracking_number }
      });
    } catch (err) {
      console.error('Book pickup notification error:', err);
    }

    res.status(201).json({ success: true, shipment });
  } catch (err) {
    console.error('Book pickup error:', err);
    res.status(500).json({ success: false, message: 'Failed to book pickup' });
  }
});

// POST /api/logistics/orders/:orderId/accept — courier accepts the route
router.post('/orders/:orderId/accept', auth, async (req, res) => {
  try {
    const shipment = await Logistics.findOne({ order_id: req.params.orderId });
    if (!shipment) {
      return res.status(404).json({ success: false, message: 'No shipment found for this order' });
    }

    if (shipment.status !== 'awaiting_pickup') {
      return res.status(400).json({ success: false, message: 'Shipment is not awaiting pickup' });
    }

    if (shipment.buyer_id.toString() === req.user.userId || shipment.seller_id.toString() === req.user.userId) {
      return res.status(403).json({ success: false, message: 'Buyer and seller cannot act as courier' });
    }

    const courier = await User.findById(req.user.userId).select('name');

    shipment.status = 'in_transit';
    shipment.courier_id = req.user.userId;
    shipment.courier_name = courier ? courier.name : 'Courier';
    shipment.estimated_delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    shipment.tracking_events.push({
      status: 'in_transit',
      note: 'Shipment accepted by ' + shipment.courier_name,
      courier_id: req.user.userId,
      courier_name: shipment.courier_name
    });
    await shipment.save();

    // Keep order in sync
    const order = await Order.findById(shipment.order_id);
    if (order) {
      order.order_status = 'shipped';
      order.tracking_number = shipment.tracking_number;
      await order.save();
    }

    try {
      await notify(shipment.buyer_id, {
        type: 'logistics',
        title: 'Shipment in transit',
        message: 'Your package for order ' + (order ? order.order_reference : '') + ' is now in transit with ' + shipment.courier_name,
        data: { order_id: shipment.order_id, tracking_number: shipment.tracking_number }
      });
      await notify(shipment.seller_id, {
        type: 'logistics',
        title: 'Shipment accepted',
        message: 'A courier accepted your shipment. Tracking: ' + shipment.tracking_number,
        data: { order_id: shipment.order_id, tracking_number: shipment.tracking_number }
      });
    } catch (err) {
      console.error('Accept shipment notification error:', err);
    }

    res.json({ success: true, shipment });
  } catch (err) {
    console.error('Accept shipment error:', err);
    res.status(500).json({ success: false, message: 'Failed to accept shipment' });
  }
});

// POST /api/logistics/orders/:orderId/update — courier updates tracking status/location
router.post('/orders/:orderId/update', auth, async (req, res) => {
  try {
    const { status, note, location } = req.body;

    const validTransitions = ['in_transit', 'out_for_delivery', 'delivered'];
    if (!validTransitions.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be one of: ' + validTransitions.join(', ') });
    }

    const shipment = await Logistics.findOne({ order_id: req.params.orderId });
    if (!shipment) {
      return res.status(404).json({ success: false, message: 'No shipment found for this order' });
    }

    if (!shipment.courier_id || shipment.courier_id.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Only the assigned courier can update this shipment' });
    }

    shipment.status = status;
    shipment.tracking_events.push({
      status,
      note: note || '',
      location: location || '',
      courier_id: req.user.userId,
      courier_name: shipment.courier_name
    });
    await shipment.save();

    const order = await Order.findById(shipment.order_id);
    if (order) {
      order.tracking_number = shipment.tracking_number;
      if (status === 'delivered') {
        order.order_status = 'delivered';
      }
      await order.save();
    }

    try {
      await notify(shipment.buyer_id, {
        type: 'logistics',
        title: 'Tracking update',
        message: 'Your order is now: ' + status.replace(/_/g, ' ') + (location ? ' (' + location + ')' : ''),
        data: { order_id: shipment.order_id, tracking_number: shipment.tracking_number, status }
      });
    } catch (err) {
      console.error('Tracking update notification error:', err);
    }

    res.json({ success: true, shipment });
  } catch (err) {
    console.error('Update shipment error:', err);
    res.status(500).json({ success: false, message: 'Failed to update shipment' });
  }
});

// GET /api/logistics/orders/:orderId — shipment for an order (buyer/seller/courier)
router.get('/orders/:orderId', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const buyerId = order.buyer_id._id ? order.buyer_id._id.toString() : order.buyer_id.toString();
    if (buyerId !== req.user.userId && order.seller_id.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const shipment = await Logistics.findOne({ order_id: order._id });
    if (!shipment) {
      return res.json({ success: true, shipment: null, message: 'No shipment booked yet' });
    }

    res.json({ success: true, shipment });
  } catch (err) {
    console.error('Get shipment error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch shipment' });
  }
});

// GET /api/logistics/available — shipments awaiting pickup with no courier assigned
router.get('/available', auth, async (req, res) => {
  try {
    const shipments = await Logistics.find({
      status: 'awaiting_pickup',
      courier_id: { $exists: false }
    })
      .populate('store_id', 'store_name')
      .sort({ created_at: -1 })
      .limit(50);

    res.json({ success: true, shipments, count: shipments.length });
  } catch (err) {
    console.error('Available shipments error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch available shipments' });
  }
});

// GET /api/logistics/mine — shipments where I am the courier
router.get('/mine', auth, async (req, res) => {
  try {
    const shipments = await Logistics.find({ courier_id: req.user.userId })
      .populate('store_id', 'store_name')
      .sort({ created_at: -1 })
      .limit(50);

    res.json({ success: true, shipments, count: shipments.length });
  } catch (err) {
    console.error('My shipments error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch your shipments' });
  }
});

// GET /api/logistics/seller — shipments for my orders (seller view)
router.get('/seller', auth, async (req, res) => {
  try {
    const shipments = await Logistics.find({ seller_id: req.user.userId })
      .populate('store_id', 'store_name')
      .sort({ created_at: -1 })
      .limit(50);

    res.json({ success: true, shipments, count: shipments.length });
  } catch (err) {
    console.error('Seller shipments error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch seller shipments' });
  }
});

module.exports = router;
