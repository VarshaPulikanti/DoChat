import { createEmbeddings } from "./embeddingService.js";

const COLLECTION_NAME = "docchat_chunks";
const TENANT = "default_tenant";
const DATABASE = "default_database";
const MAX_CHROMA_ATTEMPTS = 6;
const RETRY_DELAYS_MS = [5000, 10000, 15000, 20000, 25000];

let collectionId;
let collectionPromise;

function getBaseUrl() {
  // On Render, ChromaDB runs in this same container; avoid the public URL
  // that was returning Cloudflare 429 challenge pages.
  const configuredUrl = process.env.RENDER
    ? "http://127.0.0.1:8000"
    : process.env.CHROMA_URL || "http://localhost:8000";
  return configuredUrl.replace(/\/+$/, "");
}

function getCollectionBasePath() {
  return `/api/v2/tenants/${encodeURIComponent(TENANT)}/databases/${encodeURIComponent(DATABASE)}/collections`;
}

function getErrorMessage(err) {
  const messages = [];
  let current = err;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current.message) messages.push(current.message);
    current = current.cause;
  }
  return messages.join(" | ");
}

function isTransientChromaError(err) {
  return /\b(429|500|502|503|504)\b|too many requests|service unavailable|bad gateway|gateway timeout|<!doctype|<html|unexpected token|not valid json|failed to fetch|fetch failed|econnreset|econnrefused|etimedout|enotfound|socket hang up|networkerror/i.test(
    getErrorMessage(err)
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

async function chromaRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `ChromaDB HTTP ${response.status} ${response.statusText}: ${responseText.slice(0, 500)}`
    );
  }

  if (!responseText) return null;
  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(`ChromaDB returned non-JSON response: ${responseText.slice(0, 300)}`);
  }
}

async function createCollection() {
  const collection = await withChromaRetry(
    () =>
      chromaRequest(getCollectionBasePath(), {
        method: "POST",
        body: {
          name: COLLECTION_NAME,
          metadata: { "hnsw:space": "cosine" },
          get_or_create: true,
        },
      }),
    "collection initialization"
  );

  if (!collection?.id) {
    throw new Error("ChromaDB collection initialization returned no collection ID.");
  }
  collectionId = collection.id;
  return collectionId;
}

async function getCollectionId() {
  if (!collectionPromise) {
    collectionPromise = createCollection().catch((err) => {
      collectionPromise = undefined;
      collectionId = undefined;
      console.error("ChromaDB collection initialization failed:", err);
      throw err;
    });
  }
  return collectionPromise;
}

async function collectionRequest(operation, label) {
  const id = await getCollectionId();
  return withChromaRetry(
    () => operation(`${getCollectionBasePath()}/${encodeURIComponent(id)}`),
    label
  );
}

export async function checkChromaConnection() {
  try {
    await withChromaRetry(
      () => chromaRequest("/api/v2/heartbeat"),
      "health check"
    );
    return true;
  } catch (err) {
    console.warn("ChromaDB health check failed:", getErrorMessage(err));
    return false;
  }
}

export async function addDocumentChunks(userId, documentId, texts) {
  const embeddings = await createEmbeddings(texts);
  const docIdStr = documentId.toString();
  const userIdStr = userId.toString();

  await collectionRequest(
    (path) =>
      chromaRequest(`${path}/upsert`, {
        method: "POST",
        body: {
          ids: texts.map((_, i) => `${docIdStr}_${i}`),
          embeddings,
          documents: texts,
          metadatas: texts.map((_, i) => ({
            userId: userIdStr,
            documentId: docIdStr,
            chunkIndex: i,
          })),
        },
      }),
    "document upload"
  );
}

export async function deleteDocumentChunks(documentId) {
  await collectionRequest(
    (path) =>
      chromaRequest(`${path}/delete`, {
        method: "POST",
        body: { where: { documentId: documentId.toString() } },
      }),
    "document deletion"
  );
}

export async function searchChunks(userId, question, documentId = null, topK = 5) {
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

  const results = await collectionRequest(
    (path) =>
      chromaRequest(`${path}/query`, {
        method: "POST",
        body: {
          query_embeddings: [queryEmbedding],
          n_results: topK,
          where,
          include: ["documents", "metadatas", "distances"],
        },
      }),
    "document search"
  );

  if (!results.documents?.[0]?.length) return [];
  return results.documents[0].map((text, i) => ({
    text,
    documentId: results.metadatas[0][i].documentId,
    score: 1 - (results.distances[0][i] ?? 1),
  }));
}

export async function getDocumentIntroChunk(userId, documentId) {
  const results = await collectionRequest(
    (path) =>
      chromaRequest(`${path}/get`, {
        method: "POST",
        body: {
          where: {
            $and: [
              { userId: userId.toString() },
              { documentId: documentId.toString() },
              { chunkIndex: 0 },
            ],
          },
          include: ["documents", "metadatas"],
        },
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
