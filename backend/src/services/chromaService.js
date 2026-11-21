import { ChromaClient } from "chromadb";
import { createEmbeddings } from "./embeddingService.js";

const COLLECTION_NAME = "docchat_chunks";
const MAX_CHROMA_ATTEMPTS = 6;
const RETRY_DELAYS_MS = [2000, 4000, 8000, 12000, 15000];

let client;
let collectionPromise;

function getClient() {
  if (!client) {
    const url = process.env.CHROMA_URL || "http://localhost:8000";
    client = new ChromaClient({ path: url });
  }
  return client;
}

function getErrorMessage(err) {
  const messages = [];
  let current = err;

  // Include nested causes because the Chroma client wraps fetch/JSON errors.
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current.message) messages.push(current.message);
    current = current.cause;
  }

  return messages.join(" | ");
}

function isTransientChromaError(err) {
  const message = getErrorMessage(err);

  return /\b(429|500|502|503|504)\b|too many requests|service unavailable|bad gateway|gateway timeout|<!doctype|<html|unexpected token|not valid json|failed to fetch|fetch failed|econnreset|econnrefused|etimedout|enotfound|socket hang up|networkerror/i.test(
    message
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withChromaRetry(operation, label) {
  for (let attempt = 1; attempt <= MAX_CHROMA_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      if (!isTransientChromaError(err) || attempt === MAX_CHROMA_ATTEMPTS) {
        throw err;
      }

      const delayMs = RETRY_DELAYS_MS[attempt - 1];
      console.warn(
        `ChromaDB ${label} temporarily unavailable (attempt ${attempt}/${MAX_CHROMA_ATTEMPTS}); retrying in ${delayMs}ms: ${getErrorMessage(err)}`
      );
      await sleep(delayMs);
    }
  }
}

async function createCollection() {
  return withChromaRetry(
    () =>
      getClient().getOrCreateCollection({
        name: COLLECTION_NAME,
        metadata: { "hnsw:space": "cosine" },
      }),
    "collection initialization"
  );
}

async function getCollection() {
  if (!collectionPromise) {
    collectionPromise = createCollection().catch((err) => {
      // Do not cache a rejected promise; a later request must be able to retry.
      collectionPromise = undefined;
      console.error("ChromaDB collection initialization failed:", err);
      throw err;
    });
  }

  return collectionPromise;
}

export async function checkChromaConnection() {
  try {
    await withChromaRetry(() => getClient().heartbeat(), "health check");
    return true;
  } catch (err) {
    console.warn("ChromaDB health check failed:", getErrorMessage(err));
    return false;
  }
}

export async function addDocumentChunks(userId, documentId, texts) {
  const collection = await getCollection();
  const embeddings = await createEmbeddings(texts);
  const docIdStr = documentId.toString();
  const userIdStr = userId.toString();

  // upsert makes retries safe if Chroma stored the batch but its response was lost.
  await withChromaRetry(
    () =>
      collection.upsert({
        ids: texts.map((_, i) => `${docIdStr}_${i}`),
        embeddings,
        documents: texts,
        metadatas: texts.map((_, i) => ({
          userId: userIdStr,
          documentId: docIdStr,
          chunkIndex: i,
        })),
      }),
    "document upload"
  );
}

export async function deleteDocumentChunks(documentId) {
  const collection = await getCollection();
  await withChromaRetry(
    () =>
      collection.delete({
        where: { documentId: documentId.toString() },
      }),
    "document deletion"
  );
}

export async function searchChunks(userId, question, documentId = null, topK = 5) {
  const collection = await getCollection();
  const [queryEmbedding] = await createEmbeddings([question]);
  const userIdStr = userId.toString();

  let where = { userId: userIdStr };
  if (documentId) {
    where = {
      $and: [
        { userId: userIdStr },
        { documentId: documentId.toString() },
      ],
    };
  }

  const results = await withChromaRetry(
    () =>
      collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK,
        where,
        include: ["documents", "metadatas", "distances"],
      }),
    "document search"
  );

  if (!results.documents?.[0]?.length) {
    return [];
  }

  return results.documents[0].map((text, i) => ({
    text,
    documentId: results.metadatas[0][i].documentId,
    score: 1 - (results.distances[0][i] ?? 1),
  }));
}

export async function getDocumentIntroChunk(userId, documentId) {
  const collection = await getCollection();
  const results = await withChromaRetry(
    () =>
      collection.get({
        where: {
          $and: [
            { userId: userId.toString() },
            { documentId: documentId.toString() },
            { chunkIndex: 0 },
          ],
        },
        include: ["documents", "metadatas"],
      }),
    "document lookup"
  );

  if (!results.documents?.length) return null;

  return {
    text: results.documents[0],
    documentId: documentId.toString(),
    score: 0.3,
  };
}
