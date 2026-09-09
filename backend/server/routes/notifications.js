const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// GET /api/notifications — my notifications
router.get('/', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const notifications = await Notification.find({ user_id: req.user.userId })
      .sort({ created_at: -1 })
      .limit(limit);

    res.json({ success: true, notifications, count: notifications.length });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

// GET /api/notifications/unread-count — unread badge count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user_id: req.user.userId,
      is_read: false
    });

    res.json({ success: true, count });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ success: false, message: 'Failed to count notifications' });
  }
});

// PUT /api/notifications/:id/read — mark single notification read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    if (notification.user_id.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    notification.is_read = true;
    await notification.save();

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
});

// PUT /api/notifications/read-all — mark all my notifications read
router.put('/read-all', auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { user_id: req.user.userId, is_read: false },
      { $set: { is_read: true } }
    );

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ success: false, message: 'Failed to update notifications' });
  }
});

module.exports = router;
