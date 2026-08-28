# DocChat — MERN RAG Application

A full-stack **Retrieval-Augmented Generation (RAG)** application built with the MERN stack. Sign up, upload documents (PDF, TXT, Markdown), then ask questions and get **streaming answers** grounded in your document content.

**Live demo:** [https://do-chat-alpha.vercel.app](https://do-chat-alpha.vercel.app)  
**GitHub:** [https://github.com/VarshaPulikanti/DoChat](https://github.com/VarshaPulikanti/DoChat)

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
FRONTEND_URL=http://localhost:3000
```

| Variable       | Purpose                                      |
|----------------|----------------------------------------------|
| `MONGODB_URI`  | MongoDB connection string                    |
| `GEMINI_API_KEY` | Google Gemini API key for answer generation |
| `JWT_SECRET`   | Secret for signing login tokens (required)   |
| `CHROMA_URL`   | ChromaDB server URL (default `localhost:8000`) |
| `FRONTEND_URL` | Allowed CORS origin(s), comma-separated      |

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
2. **Retrieval** — The question is embedded and **ChromaDB performs cosine similarity search** (HNSW index), filtered by user and selected document(s). Top 5 chunks returned; chunks below score 0.15 are discarded. Broad questions (e.g. "explain the document") also include the opening chunk and fall back to the best available matches.
3. **Generation** — Retrieved chunks plus recent chat history (last 6 messages) are passed to `gemini-2.5-flash`, which streams the final answer.
4. **Persistence** — The full Q&A and source snippets are saved to MongoDB `chathistories` for the active document.

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
│   ├── .env.example         # VITE_API_URL for production builds
│   ├── vercel.json          # Vercel SPA routing
│   └── src/
│       ├── apiClient.js     # HTTP client — calls backend (not route definitions)
│       ├── AuthContext.jsx  # JWT session state
│       ├── AuthPage.jsx     # login / register UI
│       ├── Dashboard.jsx    # documents, chat, history UI
│       └── App.jsx
├── docker/
│   ├── chroma.Dockerfile    # ChromaDB for Render
│   └── backend.Dockerfile   # Backend for Render (repo-root build context)
├── docker-compose.yml       # ChromaDB only (local)
├── docker-compose.prod.yml    # Full stack on a VPS
├── render.yaml              # Render blueprint (Chroma + backend)
└── README.md
```

| Script | Command | Purpose |
|--------|---------|---------|
| Backend (recommended) | `npm start` | Run Express without file watching |
| Backend (dev) | `npm run dev` | Run with `node --watch` (avoid on synced folders) |
| Frontend | `npm run dev` | Vite dev server on port 3000 |

## Deployment

DocChat is deployed on **Vercel + Render** (free tier).

| Service | URL |
|---------|-----|
| **Frontend** | [https://do-chat-alpha.vercel.app](https://do-chat-alpha.vercel.app) |
| **Backend** | [https://docchat-backend-b2u3.onrender.com](https://docchat-backend-b2u3.onrender.com) |
| **ChromaDB** | `https://docchat-chroma.onrender.com` |
| **MongoDB** | MongoDB Atlas (free tier) |

Health check: [https://docchat-backend-b2u3.onrender.com/api/health](https://docchat-backend-b2u3.onrender.com/api/health)

### Architecture in production

```
Browser → Vercel (React static)
              ↓  VITE_API_URL
         Render backend (Express + MiniLM)
              ↓                    ↓
         MongoDB Atlas        Render ChromaDB
         (metadata, users)    (vectors)
              ↓
         Gemini API (answers)
```

### Deploy your own copy

DocChat needs **4 pieces**:

| Component | Host | Cost |
|-----------|------|------|
| Frontend | [Vercel](https://vercel.com) | Free |
| Backend | [Render](https://render.com) Docker | Free* |
| ChromaDB | Render Docker | Free |
| MongoDB | [MongoDB Atlas](https://mongodb.com/atlas) | Free |

\*Free backend works but first upload is slow and large PDFs may hit RAM limits. Use Render **Starter** ($7/mo) if uploads crash.

#### 1. MongoDB Atlas

- Create a free cluster
- **Network Access** → allow `0.0.0.0/0` (Render has no fixed IP)
- Copy connection string → `MONGODB_URI`

#### 2. ChromaDB on Render

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**
2. Connect repo [VarshaPulikanti/DoChat](https://github.com/VarshaPulikanti/DoChat)
3. **Root Directory:** leave blank
4. **Runtime:** Docker
5. **Dockerfile Path:** `docker/chroma.Dockerfile`
6. **Plan:** Free
7. Note URL → `CHROMA_URL` (e.g. `https://docchat-chroma.onrender.com`)

Verify: `https://YOUR-CHROMA-URL/api/v2/version` returns `"1.0.0"`.

#### 3. Backend on Render

1. **New** → **Web Service** → same repo
2. **Dockerfile Path:** `docker/backend.Dockerfile`  
   *(Uses repo-root build context — do **not** use `backend/Dockerfile` unless Root Directory is `backend`.)*
3. **Plan:** Free (or Starter if uploads crash)
4. **Environment variables:**

| Variable | Value |
|----------|-------|
| `MONGODB_URI` | Atlas connection string |
| `GEMINI_API_KEY` | Your Gemini key |
| `JWT_SECRET` | Long random string |
| `CHROMA_URL` | `https://your-chroma-service.onrender.com` |
| `FRONTEND_URL` | Set after Vercel deploy, e.g. `https://your-app.vercel.app` |

5. Note backend URL → test `/api/health`

Or use **`render.yaml`** (Render → **New Blueprint** → connect repo).

#### 4. Frontend on Vercel

1. [Vercel](https://vercel.com) → **Import** GitHub repo
2. **Root Directory:** `frontend`
3. **Environment variable:**

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://your-backend.onrender.com/api` |

Must include `/api` at the end. Redeploy if you change this value.

4. Copy Vercel URL → set `FRONTEND_URL` on Render backend → **redeploy backend**

#### 5. Verify end-to-end

1. Open Vercel URL → **sign up** (new account)
2. **Upload a document on the live site** (see note below)
3. Ask: `explain the document`
4. Answer should stream in the chat panel

### Important: upload documents on production

MongoDB (Atlas) and ChromaDB (Render) are **separate stores**. If you use the same Atlas database locally and in production:

- Document **names** appear in the sidebar (from MongoDB)
- But **vectors may be missing** in production Chroma (indexed locally only)
- Chat returns *"I couldn't find relevant information"*

**Fix:** On the live site, delete old documents and **re-upload** files so they are indexed in production ChromaDB.

### Option B — Single VPS (Docker Compose)

```bash
# backend/.env — fill MONGODB_URI, GEMINI_API_KEY, JWT_SECRET, FRONTEND_URL
docker compose -f docker-compose.prod.yml up -d --build
```

Open **http://your-server-ip:3000** — nginx serves the frontend and proxies `/api` to the backend.

### Production notes

- **Uploads on Render** use ephemeral disk — files may be lost on redeploy.
- **Cold starts** on free Render spin down after ~15 min idle; first request can take 30–60s.
- **First upload** downloads MiniLM (~25 MB) — allow 2–3 minutes on free tier.
- **CORS:** backend only accepts origins in `FRONTEND_URL` (comma-separated).
- **Local dev:** leave `VITE_API_URL` unset; Vite proxy forwards `/api` → `localhost:5000`.

## License

MIT
