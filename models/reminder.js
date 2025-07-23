const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  scheduledTime: {
    type: Date,
    required: true,
  },
  sent: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model("Reminder", reminderSchema);
