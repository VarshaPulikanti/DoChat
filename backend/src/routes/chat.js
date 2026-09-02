import { Router } from "express";
import { authMiddleware } from "../services/authService.js";
import { askQuestion } from "../services/ragService.js";

const router = Router();

router.use(authMiddleware);

router.post("/chat", async (req, res) => {
  try {
    const { question, documentId, history } = req.body;
    if (!question?.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }
    const result = await askQuestion(
      question.trim(),
      req.user.id,
      documentId,
      history
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
