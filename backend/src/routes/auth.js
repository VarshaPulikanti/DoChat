import { Router } from "express";
import {
  registerUser,
  loginUser,
  getUserById,
  authMiddleware,
} from "../services/authService.js";
import ChatHistory from "../models/ChatHistory.js";
import Document from "../models/Document.js";

const router = Router();

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const result = await registerUser({
      name: name.trim(),
      email: email.trim(),
      password,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const result = await loginUser({ email: email.trim(), password });
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/chat-history", authMiddleware, async (req, res) => {
  try {
    const { documentId } = req.query;
    if (!documentId) {
      return res.status(400).json({ error: "documentId is required" });
    }

    const doc = await Document.findOne({ _id: documentId, userId: req.user.id });
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    const history = await ChatHistory.find({ userId: req.user.id, documentId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
