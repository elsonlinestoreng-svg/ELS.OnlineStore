const Notification = require('../models/Notification');

async function notify(userId, payload) {
  if (!userId) return null;

  const { type, title, message, data } = payload;

  const notification = new Notification({
    user_id: userId,
    type: type || 'system',
    title: title || 'Update',
    message: message || '',
    data: data || {}
  });

  return await notification.save();
}

module.exports = { notify };
