import { Router } from "express";
import multer from "multer";
import path from "path";
import { authMiddleware } from "../services/authService.js";
import {
  processDocument,
  listDocuments,
  deleteDocument,
} from "../services/documentService.js";

const router = Router();

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "text/plain",
      "text/markdown",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, TXT, and Markdown files are allowed"));
    }
  },
});

router.use(authMiddleware);

router.get("/documents", async (req, res) => {
  try {
    const documents = await listDocuments(req.user.id);
    res.json(documents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/documents/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const doc = await processDocument(req.file, req.user.id);
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/documents/:id", async (req, res) => {
  try {
    const doc = await deleteDocument(req.params.id, req.user.id);
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json({ message: "Document deleted", id: doc._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
