# RAG Advanced System

This is a robust Retrieval-Augmented Generation (RAG) system built with React (Vite) for the frontend and Express for the backend. It leverages LangChain, MongoDB, and Google Generative AI (Gemini) to provide highly contextual and memory-aware chat capabilities, allowing for document ingestion and advanced semantic search capabilities.

## Key Features

- **Frontend Application**: An interactive and fast responsive UI built with React 19, Vite, Tailwind CSS v4, Motion (for smooth animations), and Markdown rendering.
- **Backend Services**: Express API server seamlessly connected with MongoDB. Uses `langchain` and `@langchain/mongodb` for vector storage, text splitting, and hybrid retrieval.
- **LLM Integration**: Works with Google Generative AI (Gemini) via `@google/genai` to ground prompts and generate accurate, specific conversational answers based on the context.
- **Monorepo setup**: Utilizes NPM workspaces to manage the `frontend` and `backend` neatly, with a single command to boost both up simultaneously.

## Prerequisites

- [Node.js](https://nodejs.org/) (Version 18+ is recommended)
- [MongoDB](https://www.mongodb.com/) (Running locally at `127.0.0.1:27017` or use MongoDB Atlas)
- Google API Key (for Gemini embeddings and LLM usage)

## Setup Instructions

### 1. Install Dependencies

From the project's root directory, run the following to install all necessary NPM packages for both workspaces:

```bash
npm install
```

### 2. Set Up Environment Variables

You need to establish the environment parameters inside the backend API to point at your database and LLM credentials.

```bash
cd backend
cp .env.example .env
```

Open the newly created `.env` file under the `/backend` directory and configure the environment variables:
- Provide your MongoDB connection string (e.g., `MONGO_URI=mongodb://127.0.0.1:27017/rag_advance`).
- Provide your `GEMINI_API_KEY`.

*(The frontend also has a `.env.example` in case you need to specify alternative backend endpoints or custom Vite variables).*

### 3. Data Ingestion (Optional)

If your RAG system relies on PDF ingestion, ensure your data files are in place and run the appropriate backend scripts for index population.

```bash
cd backend
npm run dev -- ingest.ts  # Adjust script based on your ingestion pipeline setup
```

## Running the Application

You can start the frontend and backend microservices concurrently from the root directory:

```bash
npm run dev
```

The terminal will report the active ports (typically `http://localhost:5173/` for the frontend and `http://localhost:3000/` for backend routes like `/api/chat`).

## Building the Frontend

When you are ready to prepare the frontend for production deployment:

```bash
npm run build
```

The optimized static site will be constructed in `frontend/dist/`. Wait for completion or configure your CI pipelines properly to handle it.

## Project Structure Overview

```text
RAG_ADVANCE/
├── backend/
│   ├── .env.example      # Example server environment configs
│   ├── package.json      # Backend dependencies and specific scripts
│   ├── server/           # Backend routing, services, LLM integration logic
│   ├── data/             # Vector data/PDF storage for ingestion pipeline
│   └── server.ts         # Fast-loading root express entry script
├── frontend/
│   ├── index.html        # Vite start point
│   ├── src/              # React components and styling UI
│   ├── package.json      # Frontend-dependent scripts
│   └── vite.config.ts    # Frontend bundling logic
├── Dockerfile            # Container configuration
└── package.json          # Root configurations & NPM workspaces
```

