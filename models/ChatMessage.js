const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
	user: { type: String, required: true },
	message: { type: String, required: false },
	room: { type: String, required: true },
	fileUrl: { type: String, default: null },
	timestamp: { type: Date, default: Date.now },
});

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage;
