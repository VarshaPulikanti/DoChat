import { Router } from "express";
import { authMiddleware } from "../services/authService.js";
import { askQuestion, askQuestionStream, getUserStats } from "../services/ragService.js";

const router = Router();

router.use(authMiddleware);

router.get("/stats", async (req, res) => {
  try {
    const stats = await getUserStats(req.user.id);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/chat", async (req, res) => {
  try {
    const { question, documentIds, history } = req.body;
    if (!question?.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }
    const result = await askQuestion(
      question.trim(),
      req.user.id,
      documentIds,
      history
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/chat/stream", async (req, res) => {
  try {
    const { question, documentIds, history } = req.body;
    if (!question?.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const result = await askQuestionStream(
      question.trim(),
      req.user.id,
      documentIds,
      history,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
    );

    res.write(`data: ${JSON.stringify({ done: true, sources: result.sources })}\n\n`);
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

export default router;
