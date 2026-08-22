import { pipeline } from "@xenova/transformers";

const MODEL = "Xenova/all-MiniLM-L6-v2";

let extractorPromise;

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL);
  }
  return extractorPromise;
}

export async function createEmbeddings(texts) {
  const extractor = await getExtractor();
  const embeddings = [];

  for (const text of texts) {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    embeddings.push(Array.from(output.data));
  }

  return embeddings;
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
