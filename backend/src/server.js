import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { ensureUploadDir } from "./services/documentService.js";
import { checkChromaConnection } from "./services/chromaService.js";
import authRoutes from "./routes/auth.js";
import documentRoutes from "./routes/documents.js";
import chatRoutes from "./routes/chat.js";

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api", documentRoutes);
app.use("/api", chatRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

async function start() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from backend/.env — add it and restart.");
  }
  await ensureUploadDir();
  await connectDB();

  const chromaOk = await checkChromaConnection();
  if (!chromaOk) {
    console.warn(
      "WARNING: ChromaDB is not running. Start it with: chroma run --path ./chroma_data --port 8000"
    );
  } else {
    console.log("ChromaDB connected");
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
