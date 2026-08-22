import Document from "../models/Document.js";
import ChatHistory from "../models/ChatHistory.js";
import { getUserDocumentIds } from "./documentService.js";
import { searchChunks } from "./chromaService.js";
import { generateAnswer, streamAnswer } from "./geminiService.js";

const TOP_K = 5;
const MIN_SCORE = 0.25;

async function retrieveRelevantChunks(question, userId, documentIds = null) {
  const userDocIds = await getUserDocumentIds(userId);
  if (userDocIds.length === 0) {
    return {
      earlyAnswer:
        "No documents have been uploaded yet. Please upload a document first.",
      sources: [],
    };
  }

  const allowedIds = documentIds?.length
    ? documentIds.filter((id) =>
        userDocIds.some((docId) => docId.toString() === id.toString())
      )
    : userDocIds.slice(0, 1);

  if (documentIds?.length && allowedIds.length === 0) {
    return {
      earlyAnswer: "No valid documents selected. Please select at least one document.",
      sources: [],
    };
  }

  let scored;
  try {
    scored = await searchChunks(userId, question, allowedIds, TOP_K);
  } catch (err) {
    throw new Error(
      `ChromaDB search failed. Is Chroma running on port 8000? ${err.message}`
    );
  }

  scored = scored.filter((chunk) => chunk.score >= MIN_SCORE);

  if (scored.length === 0) {
    return {
      earlyAnswer:
        "I couldn't find relevant information in your documents for that question.",
      sources: [],
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

  return { scored, sources };
}

async function saveChat(userId, documentId, question, answer, sources) {
  if (!documentId) return;
  await ChatHistory.create({ userId, documentId, question, answer, sources });
}

function primaryDocumentId(documentIds) {
  return documentIds?.[0] || null;
}

export async function getUserStats(userId) {
  const documents = await Document.find({ userId }).select("chunkCount").lean();
  const chunks = documents.reduce((sum, d) => sum + (d.chunkCount || 0), 0);
  const questions = await ChatHistory.countDocuments({ userId });

  return {
    documents: documents.length,
    chunks,
    questions,
  };
}

export async function askQuestion(
  question,
  userId,
  documentIds = null,
  history = []
) {
  const retrieval = await retrieveRelevantChunks(question, userId, documentIds);

  if (retrieval.earlyAnswer) {
    await saveChat(
      userId,
      primaryDocumentId(documentIds),
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
    primaryDocumentId(documentIds),
    question,
    answer,
    retrieval.sources
  );
  return { answer, sources: retrieval.sources };
}

export async function askQuestionStream(
  question,
  userId,
  documentIds = null,
  history = [],
  onChunk
) {
  const retrieval = await retrieveRelevantChunks(question, userId, documentIds);

  if (retrieval.earlyAnswer) {
    onChunk(retrieval.earlyAnswer);
    await saveChat(
      userId,
      primaryDocumentId(documentIds),
      question,
      retrieval.earlyAnswer,
      retrieval.sources
    );
    return { answer: retrieval.earlyAnswer, sources: retrieval.sources };
  }

  let answer = "";
  for await (const chunk of streamAnswer(
    question,
    retrieval.scored,
    history.slice(-6)
  )) {
    answer += chunk;
    onChunk(chunk);
  }

  await saveChat(
    userId,
    primaryDocumentId(documentIds),
    question,
    answer,
    retrieval.sources
  );
  return { answer, sources: retrieval.sources };
}
