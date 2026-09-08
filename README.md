# DocChat — AI Document Q&A Platform (RAG)

Full-stack, production-shaped RAG application: upload PDFs, ask questions, get streaming answers
grounded in your documents with inline source citations.

## Features

- **Multi-document upload & management** — upload multiple PDFs, track processing status live
- **RAG pipeline** — PyMuPDF text extraction → overlapping chunking → Google Gemini embeddings (free tier) → Pinecone vector search
- **Streaming chat** — token-by-token answers over Server-Sent Events (SSE), like ChatGPT
- **Source citations** — every answer links back to the exact document, page, and snippet used
- **Scoped retrieval** — restrict a chat to specific documents, or search across all of them
- **Auth** — JWT-based signup/login, per-user data isolation (Pinecone namespaces, DB ownership)
- **Chat history** — persisted sessions and messages, resumable across visits
- **Rate limiting / usage tracking** — per-user daily caps on uploads and queries (company-style guardrail)
- **Dark mode** — toggle in the sidebar, persisted across visits
- **PDF preview** — view any uploaded document inline without leaving the app
- **Export chat** — download any conversation (with citations) as a Markdown file
- **Profile & account** — edit display name, change password, avatar initials
- **Chat management** — rename or delete any past conversation, ChatGPT-style hover actions
- **Copy & stop generation** — copy any answer to clipboard, or stop a response mid-stream
- **Smart auto web search** — no manual toggle; the backend automatically reaches for live web results when your documents don't cover a question well, and stays document-only otherwise — a small 🌐 indicator lives right in the message box
- **General-knowledge fallback** — if nothing relevant is found in documents or the web, the assistant still answers from its own knowledge instead of refusing (like a normal chatbot)
- **Follow-up suggestions** — after each answer, 3 clickable related questions appear (Perplexity-style)
- **Regenerate & edit** — regenerate any answer, or edit a past message and resend to fork the conversation from there
- **Query rewriting** — follow-up questions are auto-expanded using chat context before retrieval, so "what about part 2?" actually retrieves the right chunks
- **Groundedness scoring** — every grounded answer gets a 0-100 score (via a second LLM pass) showing how well it's actually supported by its sources — real, visible hallucination detection
- **Multi-key quota rotation** — supply several free-tier Gemini API keys (`GOOGLE_API_KEYS`) and the backend automatically rotates to the next one whenever the current key's daily quota is hit, stacking free capacity instead of being capped by a single key
- **Voice input & output** — speak your question (Web Speech API) and have any answer read aloud, no API key needed
- **Auto document insights** — on upload, an AI-generated summary, key topics, and clickable starter questions appear automatically (NotebookLM-style), before you even ask anything
- **Usage analytics** — a lightweight dashboard of documents, chats, messages, and daily usage against your limits
- **Share links** — turn any conversation into a public, read-only link with one click, copied straight to your clipboard (like ChatGPT's "Share")
- **Smart auto web search** — even without toggling web search on, the assistant automatically reaches for the live web when your documents don't cover the question well, with a resilient two-layer scraper (library + HTML fallback)
- **ChatGPT-style UI** — full-width message rows with avatars, inline web-search toggle in the message box, fast turn-taking (you can send the next message the instant the answer finishes, without waiting on background scoring)
- **Dockerized** — one command to run backend + frontend together

## Architecture

```
┌─────────────┐      REST + SSE      ┌──────────────┐
│   React     │ ───────────────────▶ │   FastAPI    │
│  (Vite +    │ ◀─────────────────── │   backend    │
│  Tailwind)  │    streaming tokens  │              │
└─────────────┘                      └──────┬───────┘
                                             │
                     ┌───────────────────────┼───────────────────────┐
                     ▼                       ▼                       ▼
              ┌─────────────┐        ┌──────────────┐        ┌─────────────┐
              │  SQLite/    │        │   Pinecone   │        │   OpenAI    │
              │  Postgres   │        │ (vector DB,  │        │ (embeddings │
              │ (users,     │        │  namespaced  │        │  + chat     │
              │  docs, chat)│        │  per user)   │        │  completion)│
              └─────────────┘        └──────────────┘        └─────────────┘
```

**RAG flow:** PDF → `pdf_processor.py` extracts text per page → sliding-window chunking (1000
words, 150 overlap) → `embeddings.py` batches chunks to OpenAI → `vector_store.py` upserts into
Pinecone under a per-user namespace with metadata (filename, page, chunk text) → on query,
`rag_engine.py` embeds the question, retrieves top-k matches, builds a numbered source prompt, and
streams the LLM's grounded answer with citation markers back to the client.

## Project structure

```
rag-platform/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, CORS, router registration
│   │   ├── config.py          # env-driven settings
│   │   ├── database.py        # SQLAlchemy engine/session
│   │   ├── models.py          # User, Document, ChatSession, ChatMessage, UsageLog
│   │   ├── schemas.py         # Pydantic request/response models
│   │   ├── auth.py            # JWT + password hashing
│   │   ├── routers/
│   │   │   ├── auth.py        # /auth/signup, /auth/login, /auth/me
│   │   │   ├── documents.py   # upload, list, delete (multi-doc)
│   │   │   └── chat.py        # sessions, message history, streaming query
│   │   └── services/
│   │       ├── pdf_processor.py   # text extraction + chunking
│   │       ├── embeddings.py      # OpenAI embeddings (batched)
│   │       ├── vector_store.py    # Pinecone upsert/search/delete
│   │       ├── rag_engine.py      # retrieval + streaming generation + citations
│   │       ├── ingestion.py       # ties the pipeline together, runs in background
│   │       └── usage.py           # per-user daily rate limits
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js              # fetch + SSE client
│   │   └── components/
│   │       ├── AuthScreen.jsx
│   │       ├── SessionSidebar.jsx
│   │       ├── DocumentSidebar.jsx
│   │       ├── ChatPanel.jsx
│   │       └── Citations.jsx
│   ├── Dockerfile
│   ├── nginx.conf
│   └── .env.example
├── docker-compose.yml
└── README.md
```

## Local setup (without Docker)

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# edit .env: add GOOGLE_API_KEY (https://aistudio.google.com/app/apikey) and PINECONE_API_KEY
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Visit `http://localhost:5173`. Sign up, upload a PDF, wait for status to flip to **ready**, then chat.

## Run with Docker (recommended for a "deployed" feel)

```bash
cd rag-platform
cp backend/.env.example backend/.env   # fill in your API keys
docker compose up --build
```

- Frontend → `http://localhost:5173`
- Backend API → `http://localhost:8000` (docs at `/docs`)

## Deploying for real

| Component | Easiest option | Notes |
|---|---|---|
| Backend | [Render](https://render.com) / [Railway](https://railway.app) | Deploy the `backend/` folder as a Docker service; set env vars from `.env.example` |
| Frontend | [Vercel](https://vercel.com) / [Netlify](https://netlify.com) | Deploy `frontend/`, set `VITE_API_BASE` to your backend's public URL |
| Database | Swap `DATABASE_URL` to a managed Postgres (Render/Railway/Supabase) for production | SQLite is fine for demos only |
| Vector DB | [Pinecone](https://www.pinecone.io) serverless (free tier works) | Index auto-created on first run |

After deploying, update:
- `backend/.env` → `ALLOWED_ORIGINS` to include your deployed frontend URL
- `frontend/.env` → `VITE_API_BASE` to your deployed backend URL

## API overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/signup` | Create account, returns JWT |
| POST | `/auth/login` | Login, returns JWT |
| POST | `/documents/upload` | Upload a PDF (multipart) |
| GET | `/documents` | List your documents |
| DELETE | `/documents/{id}` | Delete a document + its vectors |
| GET | `/chat/sessions` | List chat sessions |
| PATCH | `/chat/sessions/{id}` | Rename a chat session |
| DELETE | `/chat/sessions/{id}` | Delete a chat session |
| GET | `/chat/sessions/{id}/messages` | Get message history |
| POST | `/chat/query` | Streaming (SSE) RAG answer with citations |
| PATCH | `/auth/me` | Update display name |
| POST | `/auth/change-password` | Change account password |

## Notes on the RAG quality tuning

- **Chunking**: word-based sliding window, 1000 words with 150 overlap — tune via `CHUNK_SIZE` /
  `CHUNK_OVERLAP` in `.env`. Smaller chunks improve precision; larger chunks improve context.
- **Retrieval**: `TOP_K` controls how many chunks are pulled per query (default 6).
- **Grounding**: the system prompt instructs the model to answer only from retrieved sources and
  to say so when the answer isn't in the documents — reduces hallucination.
- **Multi-document scoping**: passing `document_ids` in a query filters Pinecone's search via
  metadata filter, so a chat can be scoped to one document or search across all of them.
