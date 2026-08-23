import { ChromaClient } from "chromadb";
import { createEmbeddings } from "./embeddingService.js";

const COLLECTION_NAME = "docchat_chunks";

let client;
let collectionPromise;

function getClient() {
  if (!client) {
    const url = process.env.CHROMA_URL || "http://localhost:8000";
    client = new ChromaClient({ path: url });
  }
  return client;
}

async function getCollection() {
  if (!collectionPromise) {
    collectionPromise = getClient().getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: { "hnsw:space": "cosine" },
    });
  }
  return collectionPromise;
}

export async function checkChromaConnection() {
  try {
    await getClient().heartbeat();
    return true;
  } catch {
    return false;
  }
}

export async function addDocumentChunks(userId, documentId, texts) {
  const collection = await getCollection();
  const embeddings = await createEmbeddings(texts);
  const docIdStr = documentId.toString();
  const userIdStr = userId.toString();

  await collection.add({
    ids: texts.map((_, i) => `${docIdStr}_${i}`),
    embeddings,
    documents: texts,
    metadatas: texts.map((_, i) => ({
      userId: userIdStr,
      documentId: docIdStr,
      chunkIndex: i,
    })),
  });
}

export async function deleteDocumentChunks(documentId) {
  const collection = await getCollection();
  await collection.delete({
    where: { documentId: documentId.toString() },
  });
}

export async function searchChunks(userId, question, documentIds = null, topK = 5) {
  const collection = await getCollection();
  const [queryEmbedding] = await createEmbeddings([question]);
  const userIdStr = userId.toString();

  let where = { userId: userIdStr };
  if (documentIds?.length) {
    where = {
      $and: [
        { userId: userIdStr },
        { documentId: { $in: documentIds.map((id) => id.toString()) } },
      ],
    };
  }

  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
    where,
    include: ["documents", "metadatas", "distances"],
  });

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
  const results = await collection.get({
    where: {
      $and: [
        { userId: userId.toString() },
        { documentId: documentId.toString() },
        { chunkIndex: 0 },
      ],
    },
    include: ["documents", "metadatas"],
  });

  if (!results.documents?.length) return null;

  return {
    text: results.documents[0],
    documentId: documentId.toString(),
    score: 0.3,
  };
}

export async function countUserChunks(userId) {
  const collection = await getCollection();
  const results = await collection.get({
    where: { userId: userId.toString() },
    include: [],
  });
  return results.ids?.length || 0;
}
