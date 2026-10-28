# DocuMind AI – Minimal AI PDF Workspace

A modern, minimal, professional **AI-Powered PDF Workspace** built with **Node.js**, **Express**, **Nunjucks**, **Lucide icons**, **PDF.js**, and the official **Google Gemini API** (`@google/genai` SDK).

The application provides a seamless SaaS reading and analysis workflow: **Upload PDF → Open Document → Read PDF → Ask AI Questions → Get Summaries & Key Points → Auto-Save Notes**.

---

## 🌟 Key Features

### 1. Minimal SaaS Design System
- **Curated Palette**: Primary `#633DF0`, Secondary `#7950F2`, Background `#F8F9FC`, Card `#FFFFFF`, Borders `#E8EAF0`, Text `#172033`.
- **Typography**: Inter (Google Fonts) with 10px–14px rounded borders and subtle modern shadows.
- **Iconography**: Clean Lucide SVG icons.
- **Minimal Sidebar (240px)**:
  - **Main Navigation**: Dashboard, My Documents, AI Chat, Settings.
  - **Quick AI Tools**: Summarizer, Key Points, Ask PDF.
  - Purple active indicator pill; provider status moved cleanly to Settings.

### 2. Compact Dashboard
- Clean header with dynamic time-based greeting (*"Good morning!" / "Good afternoon!"*), subtitle, user profile icon, and upload CTA.
- **Minimal Upload Card**: Cloud icon, drag-and-drop ingestion, progress bar, file validation.
- **Recent Documents**: Compact table with PDF icons, page counts, upload dates, and a **Three-Dot Action Menu** (Open in Reader, AI Chat, Rename, Download, Delete).
- No unnecessary graphs or cluttered promo banners.

### 3. Three-Panel PDF Reader Workspace (`/reader/<doc_id>`)
- **Left Panel – PDF Navigation**:
  - Document title with truncate and tooltip.
  - Document switcher dropdown.
  - Interactive page thumbnail list with page previews. Clicking jumps directly to any page.
  - Collapsible toggle.
- **Center Panel – PDF Viewer**:
  - High-resolution in-canvas rendering powered by **PDF.js**.
  - Previous / Next page navigation, direct page number input jump.
  - Zoom in / Zoom out / Zoom reset.
  - Fit to Width / Fit to Page.
  - Fullscreen mode, Print PDF, and Download PDF.
- **Right Panel – AI Assistant Tabs**:
  - **Chat**: ChatGPT-style conversation with the active document.
    - **Interactive Page Citations**: Clicking any source badge (e.g. `[Page 2]`) **automatically jumps the Center PDF Viewer directly to that referenced page!**
    - Suggested question prompts.
  - **Summary**: Executive summarizer using Gemini with Detailed, Short, and Topics formats + Copy button.
  - **Key Points**: Extract essential takeaways in clean bullet format + Copy button.
  - **Notes**: Auto-saving scratchpad for thoughts, quotes, or highlights in real time.
- Independently collapsible panels so users can focus on reading or AI analysis.

### 4. My Documents (`/documents`)
- Real-time search filter by document name.
- Sort by Newest, Oldest, or Name (A-Z).
- Grid / List view toggle.
- Three-dot action menu on every document card/row.
- Clean empty state with upload action.

### 5. AI Chat (`/chat`)
- Clean standalone conversation interface with active document selector.
- Direct shortcut to *"Open in PDF Reader"*.
- Grounded RAG responses with page citations.
- Clear chat & Export transcript to clipboard.

### 6. Settings (`/settings`)
- **AI Provider**: Gemini connection status, model selector (`gemini-2.5-flash`), API key configuration with visibility toggle, live test connection ping.
- **Preferences**: Default PDF viewer fit mode, AI response detail style.
- **Application**: Version, runtime info, maximum upload size limit (32MB).

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/reader/:doc_id` | Three-panel PDF reader workspace |
| `POST` | `/api/documents/upload` | Upload PDF files and extract text |
| `GET` | `/api/documents` | List all documents with metadata |
| `GET` | `/api/documents/:id` | Get document details and chunks |
| `POST` | `/api/documents/:id/rename` | Rename document display name |
| `GET` | `/api/documents/:id/file` | Serve PDF file for viewer / download |
| `DELETE`| `/api/documents/:id` | Delete document file and records |
| `POST` | `/api/chat/:doc_id/message` | Send query to Gemini with RAG chunk retrieval |
| `DELETE`| `/api/chat/:doc_id/history` | Clear conversation history |
| `POST` | `/api/documents/:doc_id/summarize` | Generate executive summary |
| `POST` | `/api/documents/:doc_id/key-points` | Extract bullet-point takeaways |
| `POST` | `/api/documents/:doc_id/practice-questions` | Generate practice questions |
| `POST` | `/api/documents/:doc_id/explain-concept` | Explain concept from document |
| `GET` | `/api/settings` | Get configuration status |
| `POST` | `/api/settings` | Update API key and model |
| `POST` | `/api/settings/test-api` | Ping Gemini API to test connectivity |

---

## 🚀 Running the Server Locally

Start the application:
```bash
npm start
```
Or use the automation script:
```powershell
.\run.ps1
```

Open in your browser:
**`http://127.0.0.1:5000`**

---

## ☁️ Deployment (Vercel)

This project is configured out-of-the-box for Vercel deployment:
- Entry point: `api/index.js` (Express Serverless Function)
- Routing: `vercel.json`
- In Vercel Project Settings, add your `GEMINI_API_KEY` under **Environment Variables**.
