# DocChat — MERN RAG Application

A full-stack **Retrieval-Augmented Generation (RAG)** application built with the MERN stack. Sign up, upload documents (PDF, TXT, Markdown), then ask questions and get **streaming answers** grounded in your document content.

**Free local embeddings + Gemini for answers.** No paid embedding API needed.

## Features

- **JWT authentication** — register, sign in, per-user data isolation
- **Multi-document sidebar** — upload and manage several files; chat against one at a time
- **Per-document chat history** — past Q&A saved and browsable per file
- **Streaming responses** — answers appear word-by-word via Server-Sent Events
- **Follow-up context** — last 6 messages sent to the LLM for conversational follow-ups

## Architecture

```
User uploads document
       ↓
Text extraction → Chunking → MiniLM embeddings → ChromaDB (vector store)
       ↓
MongoDB stores file metadata (name, size, chunk count, owner)
       ↓
User asks question (scoped to selected document)
       ↓
Query embedding → ChromaDB similarity search → Top-K chunks → Gemini stream
       ↓
Answer streamed to UI + saved to MongoDB chat history
```

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | React 18, Vite                      |
| Backend    | Node.js, Express                    |
| Database   | MongoDB (users, documents, chat history) |
| Vector DB  | **ChromaDB** (embeddings + chunk text)   |
| Embeddings | `Xenova/all-MiniLM-L6-v2` (local, free)  |
| Answers    | Gemini `gemini-2.5-flash` (API)          |

## Prerequisites

- **Node.js** 18+
- **MongoDB** running locally or a MongoDB Atlas free tier connection string
- **ChromaDB** for vector search ([install guide below](#4-start-chromadb))
- **Gemini API key** ([free tier](https://aistudio.google.com/apikey)) — answer generation only

## Setup

### 1. Clone and install dependencies

```bash
# Backend
cd backend
npm install
cp .env.example .env

# Frontend
cd ../frontend
npm install
```

### 2. Configure environment

Edit `backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/rag-app
GEMINI_API_KEY=your-gemini-key-here
JWT_SECRET=change_this_to_a_long_random_secret
CHROMA_URL=http://localhost:8000
```

| Variable       | Purpose                                      |
|----------------|----------------------------------------------|
| `MONGODB_URI`  | MongoDB connection string                    |
| `GEMINI_API_KEY` | Google Gemini API key for answer generation |
| `JWT_SECRET`   | Secret for signing login tokens (required)   |
| `CHROMA_URL`   | ChromaDB server URL (default `localhost:8000`) |

### 3. Start MongoDB

If running locally:

```bash
mongod
```

Or use [MongoDB Atlas](https://www.mongodb.com/atlas) free tier and paste the connection string into `MONGODB_URI`.

### 4. Start ChromaDB

ChromaDB stores and searches vector embeddings. Pick one option:

**Option A — Python (recommended)**

```bash
pip install chromadb
chroma run --path ./chroma_data --port 8000
```

**Option B — Docker**

```bash
docker compose up -d
```

Chroma runs at **http://localhost:8000**. The backend connects automatically via `CHROMA_URL`.

### 5. Run the application

```bash
# Terminal 1 — ChromaDB (if not using Docker)
chroma run --path ./chroma_data --port 8000

# Terminal 2 — Backend
cd backend
npm start

# Terminal 3 — Frontend
cd frontend
npm run dev
```

Open **http://localhost:3000** in your browser and **create an account** to get started.

> **Notes:**
> - Embeddings run locally (free). The first upload downloads MiniLM (~25 MB). Gemini is only called when you ask a question.
> - Use `npm start` for the backend. `npm run dev` (`node --watch`) can restart in a loop if the project lives in OneDrive or another synced folder.

## Authentication

All document and chat routes require a JWT token. Flow:

1. **Register** or **Sign in** on the login page
2. Backend returns a JWT (valid 7 days), stored in browser `localStorage`
3. Every API request sends `Authorization: Bearer <token>`
4. Each user only sees their own documents and chat history

## Data Storage

| Store      | What's stored                                              |
|------------|------------------------------------------------------------|
| **MongoDB** `users` | Name, email, bcrypt-hashed password                |
| **MongoDB** `documents` | File metadata + `userId` owner (`originalName`, `chunkCount`, etc.) |
| **MongoDB** `chathistories` | Question, answer, sources — scoped by `userId` + `documentId` |
| **ChromaDB** | Chunk text + embedding vectors + metadata (`userId`, `documentId`) |
| **Disk** `uploads/` | Original uploaded files                              |

MongoDB holds metadata and chat history; ChromaDB handles vector search. Deleting a document removes it from all three (MongoDB, ChromaDB, and disk).

## Usage

1. **Sign up / Sign in** — Create an account or log in.
2. **Upload** — Drag and drop or click to upload a PDF, `.txt`, or `.md` file (max 10 MB). You can upload multiple documents.
3. **Wait** — The backend extracts text, splits it into ~800-character chunks, generates embeddings locally, and indexes them in ChromaDB. Metadata is saved in MongoDB.
4. **Select a document** — Click a file in the sidebar. Chat and history are scoped to that document.
5. **Ask** — Type a question. Relevant chunks are retrieved from ChromaDB, then Gemini streams the answer in the chat panel.
6. **History** — Past Q&A for the selected document appears in the right panel; click an item to reload it in the chat.

## API Endpoints

### Auth — `routes/auth.js`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Create account; returns JWT + user |
| POST | `/api/auth/login` | No | Sign in; returns JWT + user |
| GET | `/api/auth/me` | Yes | Get current user from JWT |
| GET | `/api/auth/chat-history?documentId=` | Yes | Past Q&A for a specific document (max 50) |

### Documents (requires `Authorization: Bearer <token>`) — `routes/documents.js`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents` | List user's documents |
| POST | `/api/documents/upload` | Upload and index file (`multipart/form-data`, field: `file`) |
| DELETE | `/api/documents/:id` | Delete document, Chroma chunks, chat history, and file |

### Chat (requires `Authorization: Bearer <token>`) — `routes/chat.js`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | User stats (document count, chunks, questions) |
| POST | `/api/chat` | Ask a question — non-streaming JSON response |
| POST | `/api/chat/stream` | Ask a question — **SSE stream** (used by the UI) |

### Health (public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |

## How RAG Works Here

1. **Ingestion** — Documents are chunked (~800 chars, 100 overlap) and embedded with `all-MiniLM-L6-v2`, then stored in **ChromaDB** with metadata (`userId`, `documentId`, `chunkIndex`).
2. **Retrieval** — The question is embedded and **ChromaDB performs cosine similarity search** (HNSW index), filtered by user and selected document(s). Top 5 chunks returned; chunks below score 0.25 are discarded.
3. **Generation** — Retrieved chunks plus recent chat history (last 6 messages) are passed to `gemini-2.5-flash`, which streams the final answer.
4. **Persistence** — The full Q&A and source snippets are saved to MongoDB `cathistories` for the active document.

## Project Structure

```
Project1/
├── backend/
│   ├── src/
│   │   ├── config/db.js
│   │   ├── models/          # User, Document, ChatHistory
│   │   ├── routes/
│   │   │   ├── auth.js      # /api/auth/* — login, register, me, chat-history
│   │   │   ├── documents.js # /api/documents/* — upload, list, delete
│   │   │   └── chat.js      # /api/chat/*, /api/stats — RAG Q&A + streaming
│   │   ├── services/        # authService, documentService, chromaService, ragService, etc.
│   │   └── server.js        # mounts routes, starts Express
│   ├── uploads/             # uploaded files (gitignored)
│   └── .env.example
├── frontend/
│   └── src/
│       ├── apiClient.js     # HTTP client — calls backend (not route definitions)
│       ├── AuthContext.jsx  # JWT session state
│       ├── AuthPage.jsx     # login / register UI
│       ├── Dashboard.jsx    # documents, chat, history UI
│       └── App.jsx
├── docker-compose.yml       # ChromaDB only
└── README.md
```

| Script | Command | Purpose |
|--------|---------|---------|
| Backend (recommended) | `npm start` | Run Express without file watching |
| Backend (dev) | `npm run dev` | Run with `node --watch` (avoid on synced folders) |
| Frontend | `npm run dev` | Vite dev server on port 3000 |

## License

MIT
