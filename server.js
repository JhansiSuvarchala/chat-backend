const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

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

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    // Use Date.now + original name to avoid collisions
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  // Return URL for frontend to access
  const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
  res.json({ fileUrl });
});

app.get("/messages/:room", async (req, res) => {
  const { room } = req.params;
  try {
    const messages = await ChatMessage.find({ room }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Error fetching messages" });
  }
});

app.post("/messages", async (req, res) => {
  const { user, message, room, fileUrl } = req.body;
  try {
    const newMsg = new ChatMessage({ user, message, room, fileUrl });
    const savedMsg = await newMsg.save();
    io.to(room).emit("receive_message", savedMsg);
    res.status(201).json(savedMsg);
  } catch (err) {
    res.status(500).json({ error: "Failed to save message" });
  }
});

app.put("/messages/:id", async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  try {
    const updatedMsg = await ChatMessage.findByIdAndUpdate(
      id,
      { message },
      { new: true }
    );
    if (!updatedMsg) return res.status(404).json({ error: "Message not found" });
    io.to(updatedMsg.room).emit("edit_message", updatedMsg);
    res.json(updatedMsg);
  } catch (err) {
    res.status(500).json({ error: "Failed to update message" });
  }
});

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

io.on("connection", (socket) => {
  console.log("A user connected: ", socket.id);

  socket.on("join_room", (room) => {
    socket.join(room);
    console.log(`User joined room: ${room}`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected: ", socket.id);
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
