const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { notify } = require('../services/notify');

// GET /api/messages/conversations — list my conversations
router.get('/conversations', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user.userId
    })
      .sort({ last_message_at: -1 })
      .limit(100)
      .lean();

    const userId = req.user.userId;
    const enriched = await Promise.all(conversations.map(async conv => {
      const otherId = conv.participants.find(p => p.toString() !== userId.toString());
      const other = otherId ? await User.findById(otherId).select('name email') : null;
      const unread = await Message.countDocuments({
        conversation_id: conv._id,
        sender_id: { $ne: userId },
        is_read: false
      });

      return {
        _id: conv._id,
        type: conv.type,
        product_id: conv.product_id,
        order_id: conv.order_id,
        other_user: other,
        last_message: conv.last_message,
        last_message_at: conv.last_message_at,
        unread_count: unread,
        created_at: conv.created_at
      };
    }));

    res.json({ success: true, conversations: enriched, count: enriched.length });
  } catch (err) {
    console.error('List conversations error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
  }
});

// POST /api/messages/conversations — find or create a conversation with another user
router.post('/conversations', auth, async (req, res) => {
  try {
    const { participant_id, type, product_id, order_id } = req.body;

    if (!participant_id) {
      return res.status(400).json({ success: false, message: 'participant_id is required' });
    }

    if (participant_id === req.user.userId) {
      return res.status(400).json({ success: false, message: 'Cannot start a conversation with yourself' });
    }

    const participant = await User.findById(participant_id);
    if (!participant) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userIds = [req.user.userId, participant_id].sort();

    let conversation = await Conversation.findOne({
      participants: { $all: userIds }
    });

    if (!conversation) {
      conversation = new Conversation({
        participants: userIds,
        type: type || 'general',
        product_id: product_id || undefined,
        order_id: order_id || undefined
      });
      await conversation.save();
    }

    res.status(201).json({ success: true, conversation });
  } catch (err) {
    console.error('Create conversation error:', err);
    res.status(500).json({ success: false, message: 'Failed to create conversation' });
  }
});

// GET /api/messages/conversations/:id — conversation detail with messages
router.get('/conversations/:id', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    if (!conversation.participants.some(p => p.toString() === req.user.userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const messages = await Message.find({ conversation_id: conversation._id })
      .sort({ created_at: 1 })
      .populate('sender_id', 'name email');

    res.json({ success: true, conversation, messages });
  } catch (err) {
    console.error('Get conversation error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch conversation' });
  }
});

// POST /api/messages/conversations/:id/messages — send a message
router.post('/conversations/:id/messages', auth, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }

    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    if (!conversation.participants.some(p => p.toString() === req.user.userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const message = new Message({
      conversation_id: conversation._id,
      sender_id: req.user.userId,
      text: text.trim()
    });
    await message.save();

    conversation.last_message = message.text;
    conversation.last_message_at = new Date();
    await conversation.save();

    // Notify the other participant
    const recipientId = conversation.participants.find(p => p.toString() !== req.user.userId);
    if (recipientId) {
      try {
        const sender = await User.findById(req.user.userId).select('name');
        await notify(recipientId, {
          type: 'message',
          title: 'New message from ' + (sender ? sender.name : 'a user'),
          message: message.text,
          data: { conversation_id: conversation._id, sender_id: req.user.userId }
        });
      } catch (err) {
        console.error('Message notification error:', err);
      }
    }

    res.status(201).json({ success: true, message });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// PUT /api/messages/conversations/:id/read — mark all my messages read
router.put('/conversations/:id/read', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    if (!conversation.participants.some(p => p.toString() === req.user.userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await Message.updateMany(
      { conversation_id: conversation._id, sender_id: { $ne: req.user.userId }, is_read: false },
      { $set: { is_read: true } }
    );

    res.json({ success: true, message: 'Messages marked as read' });
  } catch (err) {
    console.error('Mark conversation read error:', err);
    res.status(500).json({ success: false, message: 'Failed to update messages' });
  }
});

module.exports = router;
