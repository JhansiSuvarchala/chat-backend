const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const { body, validationResult } = require("express-validator");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Change to frontend origin in production
  },
});

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

mongoose
  .connect(
    "mongodb+srv://jhansijanu22k:janu@cluster0.zhjcspb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
  )
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

const chatSchema = new mongoose.Schema(
  {
    user: String,
    message: String,
    room: String,
    fileUrl: String,
  },
  { timestamps: true }
);

const ChatMessage = mongoose.model("ChatMessage", chatSchema);

// Multer setup for file uploads with file type validation
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|docx|txt/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"));
    }
  },
});

// File upload route with error handling
app.post("/upload", (req, res) => {
  upload.single("file")(req, res, function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    res.json({ fileUrl });
  });
});

app.get("/", (req, res) => {
  res.send("Backend server is running!");
});

// Get messages by roomId
app.get("/messages/:roomId", async (req, res) => {
  const { roomId } = req.params;
  try {
    const messages = await ChatMessage.find({ room: roomId }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Post new message with validation and sanitization
app.post(
  "/messages",
  [
    body("user").trim().escape(),
    body("message").trim().escape(),
    body("room").trim().escape(),
    body("fileUrl").optional().isURL(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user, message, room, fileUrl } = req.body;
    try {
      const newMsg = new ChatMessage({ user, message, room, fileUrl });
      const savedMsg = await newMsg.save();
      io.to(room).emit("receive_message", savedMsg);
      res.status(201).json(savedMsg);
    } catch (err) {
      res.status(500).json({ error: "Failed to save message" });
    }
  }
);

// Update message text with validation
app.put(
  "/messages/:id",
  [body("message").trim().escape()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { message } = req.body;
    try {
      const updatedMsg = await ChatMessage.findByIdAndUpdate(id, { message }, { new: true });
      if (!updatedMsg) return res.status(404).json({ error: "Message not found" });
      io.to(updatedMsg.room).emit("edit_message", updatedMsg);
      res.json(updatedMsg);
    } catch (err) {
      res.status(500).json({ error: "Failed to update message" });
    }
  }
);

// Delete message
app.delete("/messages/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedMsg = await ChatMessage.findByIdAndDelete(id);
    if (!deletedMsg) return res.status(404).json({ error: "Message not found" });
    io.to(deletedMsg.room).emit("delete_message", id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete message" });
  }
});

// Socket.io connection
io.on("connection", (socket) => {
  console.log("A user connected: ", socket.id);

  socket.on("join_room", (room) => {
    socket.join(room);
    console.log(`User joined room: ${room}`);
  });

  // New socket event for sending messages directly via socket.io
  socket.on("send_message", async (data) => {
    // Basic validation on socket side (optional)
    if (!data.user || !data.room) {
      return socket.emit("error", "User and room are required");
    }
    try {
      const newMsg = new ChatMessage(data);
      const savedMsg = await newMsg.save();
      io.to(data.room).emit("receive_message", savedMsg);
    } catch (err) {
      socket.emit("error", "Failed to send message");
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected: ", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
