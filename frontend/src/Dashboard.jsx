import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchDocuments,
  fetchChatHistory,
  uploadDocument,
  deleteDocument,
  askQuestion,
} from "./apiClient";
import "./App.css";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Dashboard({ user, onLogout }) {
  const [documents, setDocuments] = useState([]);
  const [activeDocId, setActiveDocId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeDocument =
    documents.find((doc) => doc._id === activeDocId) || documents[0] || null;

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await fetchDocuments();
      setDocuments(docs);
      setActiveDocId((current) =>
        docs.some((doc) => doc._id === current) ? current : docs[0]?._id || null
      );
    } catch (err) {
      showToast(err.message, "error");
    }
  }, [showToast]);

  const loadChatHistory = useCallback(
    async (documentId) => {
      if (!documentId) {
        setChatHistory([]);
        return;
      }
      try {
        const history = await fetchChatHistory(documentId);
        setChatHistory(history);
      } catch (err) {
        showToast(err.message, "error");
      }
    },
    [showToast]
  );

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    loadChatHistory(activeDocId);
    setMessages([]);
  }, [activeDocId, loadChatHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleUpload(file) {
    if (!file) return;
    setUploading(true);
    try {
      const doc = await uploadDocument(file);
      setDocuments((prev) => [doc, ...prev.filter((item) => item._id !== doc._id)]);
      setActiveDocId(doc._id);
      showToast(`"${doc.originalName}" uploaded and indexed`);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setUploading(false);
    }
  }

  function onFileSelect(e) {
    handleUpload(e.target.files[0]);
    e.target.value = "";
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files[0]);
  }

  async function handleDelete(docId) {
    try {
      await deleteDocument(docId);
      setDocuments((prev) => {
        const next = prev.filter((doc) => doc._id !== docId);
        setActiveDocId((current) =>
          current === docId ? next[0]?._id || null : current
        );
        return next;
      });
      showToast("Document removed");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function loadHistoryItem(item) {
    setMessages([
      { role: "user", content: item.question },
      { role: "assistant", content: item.answer },
    ]);
  }

  async function handleAsk(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading || !activeDocument) return;

    setQuestion("");
    const userMsg = { role: "user", content: q };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setLoading(true);

    const history = messages.slice(-6);

    try {
      const result = await askQuestion(q, [activeDocument._id], history);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: result.answer,
        };
        return updated;
      });

      const historyData = await fetchChatHistory(activeDocument._id);
      setChatHistory(historyData);
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Error: ${err.message}`,
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk(e);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>
            Doc<span>Chat</span>
          </h1>
          <p>Upload your documents and ask anything — answers from your own content</p>
        </div>
        <div className="header-user">
          <div className="user-info">
            <div className="user-name">{user.name}</div>
            <div className="user-email">{user.email}</div>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <div className="main main-advanced">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>Your Documents</h2>
            <div
              className={`upload-zone ${dragOver ? "drag-over" : ""} ${uploading ? "uploading" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                onChange={onFileSelect}
              />
              <div className="icon">{uploading ? "⏳" : "📄"}</div>
              <p>{uploading ? "Processing..." : "Drop or click to upload"}</p>
              <p className="hint">PDF · TXT · MD</p>
            </div>
          </div>

          <div className="doc-list">
            {documents.length === 0 ? (
              <div className="empty-docs">Upload a document to get started</div>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc._id}
                  className={`doc-item ${activeDocument?._id === doc._id ? "selected" : ""}`}
                  onClick={() => setActiveDocId(doc._id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveDocId(doc._id);
                    }
                  }}
                >
                  <span className="doc-icon">
                    {doc.mimeType === "application/pdf" ? "📕" : "📝"}
                  </span>
                  <div className="doc-info">
                    <div className="doc-name" title={doc.originalName}>
                      {doc.originalName}
                    </div>
                    <div className="doc-meta">
                      {formatSize(doc.size)} · {doc.chunkCount} chunks ·{" "}
                      {formatDate(doc.createdAt)}
                    </div>
                  </div>
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(doc._id);
                    }}
                    title="Remove"
                    style={{ opacity: 1 }}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="chat-area">
          <div className="chat-toolbar">
            <span className="chat-mode">
              {activeDocument
                ? `Answering from: ${activeDocument.originalName}`
                : "Upload a document to start chatting"}
            </span>
            {messages.length > 0 && (
              <button className="link-btn" onClick={() => setMessages([])}>
                Clear chat
              </button>
            )}
          </div>

          <div className="messages">
            {messages.length === 0 && !loading && (
              <div className="welcome">
                <h2>Your documents, ready to talk</h2>
                <p>
                  Select a file, ask a question, and get answers pulled straight from
                  that document.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <div className="bubble">
                  {msg.content}
                  {loading && i === messages.length - 1 && msg.role === "assistant" && (
                    <span className="stream-cursor">▍</span>
                  )}
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          <form className="input-area" onSubmit={handleAsk}>
            <div className="input-row">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeDocument
                    ? "Ask a question about your document..."
                    : "Upload a document first..."
                }
                rows={1}
                disabled={loading || !activeDocument}
              />
              <button
                type="submit"
                className="send-btn"
                disabled={loading || !question.trim() || !activeDocument}
              >
                {loading ? "..." : "Send"}
              </button>
            </div>
          </form>
        </section>

        <aside className="history-panel">
          <h2>Chat History</h2>
          {activeDocument && (
            <p className="history-doc-name" title={activeDocument.originalName}>
              {activeDocument.originalName}
            </p>
          )}
          <div className="history-list">
            {!activeDocument ? (
              <div className="empty-docs">Select a document</div>
            ) : chatHistory.length === 0 ? (
              <div className="empty-docs">No questions for this document yet</div>
            ) : (
              chatHistory.map((item) => (
                <button
                  key={item._id}
                  className="history-item"
                  onClick={() => loadHistoryItem(item)}
                >
                  <div className="history-q">{item.question}</div>
                  <div className="history-date">{formatDate(item.createdAt)}</div>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
