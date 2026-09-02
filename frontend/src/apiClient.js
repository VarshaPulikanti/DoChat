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

export async function askQuestion(question, documentIds, history) {
  return request("/chat", {
    method: "POST",
    body: JSON.stringify({ question, documentIds, history }),
  });
}
