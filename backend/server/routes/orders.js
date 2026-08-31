const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const auth = require('../middleware/auth');

// ==========================================
// 1. GET BUYER'S ORDERS
// ==========================================
router.get('/buyer', auth, async (req, res) => {
  try {
    const orders = await Order.find({ buyer_id: req.user.userId })
      .sort({ created_at: -1 })
      .populate('store_id', 'store_name')
      .select('-commission_amount -seller_payout -payment_reference');

    res.json({ success: true, orders, count: orders.length });
  } catch (err) {
    console.error('Get buyer orders error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// ==========================================
// 2. GET SELLER'S ORDERS
// ==========================================
router.get('/seller', auth, async (req, res) => {
  try {
    const orders = await Order.find({ seller_id: req.user.userId })
      .sort({ created_at: -1 })
      .populate('buyer_id', 'name email')
      .select('-payment_reference');

    // Transform internal models cleanly into the column structure expected by the frontend UI table
    const structuredOrders = orders.map(ord => ({
      _id: ord._id,
      buyerName: ord.buyer_id ? ord.buyer_id.name : 'Guest Client',
      itemsDescription: ord.items ? ord.items.map(i => `${i.name} (x${i.quantity})`).join(', ') : 'Marketplace Item',
      sellerEarnings: ord.seller_payout || ord.total_amount || 0,
      status: ord.order_status || 'Pending'
    }));

    res.json(structuredOrders); // Directly responds with array matching: loadSellerDashboardOrders()
  } catch (err) {
    console.error('Get seller orders error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// ==========================================
// 3. GET REAL-TIME LOGISTICS TELEMETRY NODE
// ==========================================
router.get('/:id/track', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Tracking node not found' });
    }

    // Authenticate visibility (Only assigned Buyer or Seller can intercept tracking arrays)
    const buyerId = order.buyer_id._id ? order.buyer_id._id.toString() : order.buyer_id.toString();
    if (buyerId !== req.user.userId && order.seller_id.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Access Denied' });
    }

    // Dynamic Mock Coordinates Generation Engine (Simulating live motorcycle transit via Lekki, Lagos)
    // In production, these parameters read directly from an active Redis or MongoDB Courier Location schema.
    let trackingCoordinates = null;
    if (order.order_status === 'Shipped') {
      const secondsPulse = Math.floor(Date.now() / 1000) % 60;
      trackingCoordinates = {
        lat: 6.4281 + (secondsPulse * 0.0001), // Dynamic shifting latitude vector
        lng: 3.4219 + (secondsPulse * 0.0001), // Dynamic shifting longitude vector
        speed: Math.floor(Math.random() * (45 - 30 + 1)) + 30, // 30-45 km/h variable on-bike speed
        eta: Math.max(1, Math.ceil(15 - (secondsPulse * 0.2))) // Countdown arrival estimate minutes
      };
    }

    res.json({
      orderId: order._id,
      status: order.order_status,
      coordinates: trackingCoordinates
    });
  } catch (err) {
    console.error('Logistics track polling breakdown:', err);
    res.status(500).json({ success: false, message: 'Internal pipeline lookup error' });
  }
});

// ==========================================
// 4. WEBRTC LIVESTREAM DISPATCH SIGNALING HANDSHAKE
// ==========================================
router.post('/:id/telemetry-stream-handshake', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order reference dead' });

    // Enforce matching status requirements (Livestream only functions while out for delivery)
    if (order.order_status !== 'Shipped') {
      return res.json({ activeBroadcastStreamToken: false });
    }

    // Standard Mock SDP Session Parameters response to trigger frontend WebRTC handling lifecycle
    res.json({
      activeBroadcastStreamToken: `stream-token-${order._id}`,
      sdpPayload: {
        type: 'offer',
        sdp: 'v=0\r\no=- 4611730524204961591 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=msid-semantic: WMS\r\n' // Synthetic layout structure string
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'WebRTC signaling layer fault' });
  }
});

router.post('/:id/telemetry-stream-handshake/answer', auth, (req, res) => {
  // Receives peer answer connection payload logs from client browser sessions
  res.json({ success: true, streamingPipelineChannel: 'Stabilized' });
});

// ==========================================
// 5. GET SINGLE ORDER (DETAILED PANEL VIEW)
// ==========================================
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('buyer_id', 'name email')
      .populate('store_id', 'store_name');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const buyerId = order.buyer_id._id ? order.buyer_id._id.toString() : order.buyer_id.toString();
    if (buyerId !== req.user.userId && order.seller_id.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (buyerId === req.user.userId) {
      order.commission_amount = undefined;
      order.seller_payout = undefined;
      order.payment_reference = undefined;
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch order' });
  }
});

// ==========================================
// 6. UPDATE ORDER STATUS (SELLER CONTROLS)
// ==========================================
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status, tracking_number } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.seller_id.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Only the seller can update order status' });
    }

    // Unified casing pattern matches frontend milestone element ID declarations ('Pending','Paid','Processing','Shipped','Delivered')
    const validStatuses = ['Pending', 'Paid', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    
    // Auto-normalize common casing formats sent via raw testing agents to preserve system synchronization
    let standardizedInput = status;
    if(status) {
      standardizedInput = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    }

    if (!validStatuses.includes(standardizedInput)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be: ' + validStatuses.join(', ') });
    }

    order.order_status = standardizedInput;
    if (tracking_number) order.tracking_number = tracking_number;
    await order.save();

    res.json({ success: true, message: 'Order status updated to ' + standardizedInput, order });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ success: false, message: 'Failed to update order' });
  }
});

module.exports = router;