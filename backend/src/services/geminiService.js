import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI;

function getClient() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

function buildPrompt(question, contextChunks, history = []) {
  const context = contextChunks.map((chunk) => chunk.text).join("\n\n");

  const historyBlock =
    history.length > 0
      ? `Previous conversation:\n${history
          .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
          .join("\n")}\n\n`
      : "";

  return `${historyBlock}You are a helpful assistant that answers questions based only on the provided document context.
If the answer is not in the context, say "I couldn't find that information in the uploaded documents."
Be concise and answer in plain language. Do not mention sources, citations, or reference numbers in your answer.
Use the previous conversation for follow-up questions when relevant.

Context:
${context}

Question: ${question}`;
}

export async function generateAnswer(question, contextChunks, history = []) {
  const client = getClient();
  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(
    buildPrompt(question, contextChunks, history)
  );
  return result.response.text();
}
