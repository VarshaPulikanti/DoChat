const API_BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "docchat_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = { ...options.headers };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok) {
      throw new Error(text || `Request failed (${res.status})`);
    }
  }
  if (!res.ok) {
    throw new Error(data.error || text || `Request failed (${res.status})`);
  }
  return data;
}

export async function register(name, email, password) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export async function login(email, password) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchMe() {
  return request("/auth/me");
}

export async function fetchChatHistory(documentId) {
  return request(`/auth/chat-history?documentId=${encodeURIComponent(documentId)}`);
}

export async function fetchStats() {
  return request("/stats");
}

export async function fetchDocuments() {
  return request("/documents");
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);
  return request("/documents/upload", { method: "POST", body: formData });
}

export async function deleteDocument(id) {
  return request(`/documents/${id}`, { method: "DELETE" });
}

export async function askQuestionStream(question, documentIds, history, onChunk) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question, documentIds, history }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to get answer");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = JSON.parse(line.slice(6));
      if (data.error) throw new Error(data.error);
      if (data.chunk) onChunk(data.chunk);
      if (data.done) return data;
    }
  }
}
