import fs from "fs/promises";
import path from "path";
import Document from "../models/Document.js";
import { extractText, isSupportedMimeType } from "./textExtractor.js";
import { chunkText } from "./chunker.js";
import { addDocumentChunks, deleteDocumentChunks } from "./chromaService.js";
import ChatHistory from "../models/ChatHistory.js";

const UPLOAD_DIR = path.resolve("uploads");

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function processDocument(file, userId) {
  if (!isSupportedMimeType(file.mimetype)) {
    throw new Error("Only PDF, TXT, and Markdown files are supported");
  }

  const text = await extractText(file.path, file.mimetype);
  if (!text) {
    throw new Error("Could not extract text from the document");
  }

  const textChunks = chunkText(text);
  if (textChunks.length === 0) {
    throw new Error("Document produced no readable content");
  }

  const doc = await Document.create({
    userId,
    filename: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    chunkCount: textChunks.length,
  });

  try {
    await addDocumentChunks(userId, doc._id, textChunks);
  } catch (err) {
    await Document.findByIdAndDelete(doc._id);
    throw new Error(
      `Failed to index document in ChromaDB. Is Chroma running? ${err.message}`
    );
  }

  return doc;
}

export async function listDocuments(userId) {
  return Document.find({ userId }).sort({ createdAt: -1 }).lean();
}

export async function deleteDocument(id, userId) {
  const doc = await Document.findOne({ _id: id, userId });
  if (!doc) return null;

  await deleteDocumentChunks(id);
  await ChatHistory.deleteMany({ documentId: id, userId });
  await Document.findByIdAndDelete(id);

  try {
    await fs.unlink(path.join(UPLOAD_DIR, doc.filename));
  } catch {
    // file may already be removed
  }

  return doc;
}

export async function getUserDocumentIds(userId) {
  const docs = await Document.find({ userId }).select("_id").lean();
  return docs.map((d) => d._id);
}
