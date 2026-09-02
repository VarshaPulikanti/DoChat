import Document from "../models/Document.js";
import ChatHistory from "../models/ChatHistory.js";
import { getUserDocumentIds } from "./documentService.js";
import { searchChunks, getDocumentIntroChunk } from "./chromaService.js";
import { generateAnswer } from "./geminiService.js";

const TOP_K = 5;
const MIN_SCORE = 0.15;

const BROAD_QUESTION =
  /\b(summarize|summary|explain|overview|what is this (document|file) about|tell me about (this|the) document|describe (this|the) document|what does this document|main topic|what is in this|about this document)\b/i;

function isBroadQuestion(question) {
  return BROAD_QUESTION.test(question.toLowerCase());
}

async function retrieveRelevantChunks(question, userId, documentId = null) {
  const userDocIds = await getUserDocumentIds(userId);
  if (userDocIds.length === 0) {
    return {
      earlyAnswer:
        "No documents have been uploaded yet. Please upload a document first.",
      sources: [],
      documentId: null,
    };
  }

  let activeDocId = documentId;
  if (activeDocId) {
    const owned = userDocIds.some(
      (id) => id.toString() === activeDocId.toString()
    );
    if (!owned) {
      return {
        earlyAnswer: "No valid document selected. Please select a document.",
        sources: [],
        documentId: null,
      };
    }
  } else {
    activeDocId = userDocIds[0];
  }

  let scored;
  try {
    const topK = isBroadQuestion(question) ? 8 : TOP_K;
    scored = await searchChunks(userId, question, activeDocId, topK);

    if (isBroadQuestion(question)) {
      const intro = await getDocumentIntroChunk(userId, activeDocId);
      if (intro && !scored.some((c) => c.text === intro.text)) {
        scored.unshift(intro);
      }
    }
  } catch (err) {
    throw new Error(
      `ChromaDB search failed. Is Chroma running on port 8000? ${err.message}`
    );
  }

  const filtered = scored.filter((chunk) => chunk.score >= MIN_SCORE);
  scored = filtered.length > 0 ? filtered : scored.slice(0, TOP_K);

  if (scored.length === 0) {
    return {
      earlyAnswer:
        "I couldn't find relevant information in your documents for that question.",
      sources: [],
      documentId: activeDocId,
    };
  }

  const docIds = [...new Set(scored.map((c) => c.documentId))];
  const docs = await Document.find({ _id: { $in: docIds } }).lean();
  const docMap = Object.fromEntries(docs.map((d) => [d._id.toString(), d]));

  const sources = scored.map((chunk) => ({
    documentName: docMap[chunk.documentId]?.originalName || "Unknown",
    text: chunk.text.slice(0, 200) + (chunk.text.length > 200 ? "..." : ""),
    score: Math.round(chunk.score * 100) / 100,
  }));

  return { scored, sources, documentId: activeDocId };
}

async function saveChat(userId, documentId, question, answer, sources) {
  if (!documentId) return;
  await ChatHistory.create({ userId, documentId, question, answer, sources });
}

export async function askQuestion(
  question,
  userId,
  documentId = null,
  history = []
) {
  const retrieval = await retrieveRelevantChunks(question, userId, documentId);

  if (retrieval.earlyAnswer) {
    await saveChat(
      userId,
      retrieval.documentId,
      question,
      retrieval.earlyAnswer,
      retrieval.sources
    );
    return { answer: retrieval.earlyAnswer, sources: retrieval.sources };
  }

  const answer = await generateAnswer(
    question,
    retrieval.scored,
    history.slice(-6)
  );

  await saveChat(
    userId,
    retrieval.documentId,
    question,
    answer,
    retrieval.sources
  );
  return { answer, sources: retrieval.sources };
}
