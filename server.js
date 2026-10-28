import express from 'express';
import nunjucks from 'nunjucks';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

import { Config } from './lib/config.js';
import { Store } from './lib/store.js';
import { PDFService } from './lib/pdf-service.js';
import { RetrievalService } from './lib/retrieval-service.js';
import { AIService } from './lib/ai-service.js';

const app = express();

// Initialize folders and seed data
Config.initFolders();
Store.loadData();

// Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Vercel rewrite URL normalizer (handles 'x-matched-path' header so Express routes match original paths)
app.use((req, res, next) => {
  const matchedPath = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'];
  if (matchedPath) {
    req.url = matchedPath;
  } else if (req.url === '/api/index.js' || req.url === '/api/index') {
    req.url = '/';
  }
  next();
});

// Serve static assets
app.use('/static', express.static(path.join(Config.BASE_DIR, 'static')));

// Configure Nunjucks Template Engine
const env = nunjucks.configure(path.join(Config.BASE_DIR, 'templates'), {
  autoescape: true,
  express: app,
  noCache: !Config.IS_VERCEL
});

// Flask url_for compatibility helper for Nunjucks
env.addGlobal('url_for', (endpoint, options = {}) => {
  if (endpoint === 'static') {
    return `/static/${options.filename || ''}`;
  }
  if (endpoint === 'dashboard') return '/';
  if (endpoint === 'documents') return '/documents';
  if (endpoint === 'chat') {
    return options.doc_id ? `/chat/${options.doc_id}` : '/chat';
  }
  if (endpoint === 'reader') {
    return options.doc_id ? `/reader/${options.doc_id}` : '/documents';
  }
  if (endpoint === 'settings') return '/settings';
  if (endpoint === 'view_document_file') {
    return `/api/documents/${options.document_id}/file`;
  }
  return '/';
});

// Configure Multer for PDF file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    Config.initFolders();
    cb(null, Config.UPLOAD_FOLDER);
  },
  filename: (req, file, cb) => {
    const randomHex = crypto.randomBytes(6).toString('hex');
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${randomHex}_${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: Config.MAX_CONTENT_LENGTH },
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are supported.'));
    }
  }
});

// ==========================================
// Frontend Page Routes
// ==========================================

app.get('/', (req, res) => {
  const stats = Store.getSystemStats();
  const recentDocs = Store.getAllDocuments().slice(0, 5);
  const isAiReady = Config.isGeminiConfigured();
  res.render('dashboard.html', {
    active_page: 'dashboard',
    stats,
    recent_docs: recentDocs,
    is_ai_ready: isAiReady,
    model_name: Config.GEMINI_MODEL
  });
});

app.get('/documents', (req, res) => {
  const docs = Store.getAllDocuments();
  res.render('documents.html', {
    active_page: 'documents',
    documents: docs,
    is_ai_ready: Config.isGeminiConfigured()
  });
});

app.get('/chat/:doc_id?', (req, res) => {
  const docs = Store.getAllDocuments();
  const docId = req.params.doc_id;
  let activeDoc = null;
  let initialMessages = [];

  if (docId) {
    activeDoc = Store.getDocument(docId);
    if (activeDoc) {
      initialMessages = Store.getChatHistory(docId);
    }
  } else if (docs.length > 0) {
    activeDoc = docs[0];
    initialMessages = Store.getChatHistory(activeDoc.id);
  }

  res.render('chat.html', {
    active_page: 'chat',
    documents: docs,
    active_doc: activeDoc,
    initial_messages: initialMessages,
    is_ai_ready: Config.isGeminiConfigured(),
    model_name: Config.GEMINI_MODEL
  });
});

app.get('/reader/:doc_id', (req, res) => {
  const doc = Store.getDocument(req.params.doc_id);
  if (!doc) {
    return res.redirect('/documents');
  }

  res.render('reader.html', {
    active_page: 'reader',
    active_doc: doc,
    doc: doc,
    is_ai_ready: Config.isGeminiConfigured(),
    model_name: Config.GEMINI_MODEL
  });
});

app.get('/settings', (req, res) => {
  const maskedKey = Config.GEMINI_API_KEY
    ? '••••••••' + Config.GEMINI_API_KEY.slice(-4)
    : '';

  res.render('settings.html', {
    active_page: 'settings',
    gemini_api_key: maskedKey,
    gemini_model: Config.GEMINI_MODEL,
    is_configured: Config.isGeminiConfigured(),
    available_models: Config.AVAILABLE_MODELS
  });
});

// ==========================================
// REST API Routes
// ==========================================

app.get('/api/documents', (req, res) => {
  const docs = Store.getAllDocuments();
  res.json({ success: true, documents: docs, count: docs.length });
});

app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file uploaded' });
    }

    const filePath = req.file.path;
    const { pagesData, metadata } = await PDFService.extractTextAndMetadata(filePath);
    const chunks = PDFService.chunkPages(pagesData);
    const docId = crypto.randomBytes(6).toString('hex');

    const doc = Store.saveDocument({
      id: docId,
      filename: req.file.filename,
      original_name: req.file.originalname,
      file_path: filePath,
      file_size: metadata.file_size,
      num_pages: metadata.num_pages,
      is_scanned: metadata.is_scanned,
      chunks
    });

    res.status(201).json({
      success: true,
      message: 'PDF uploaded and processed successfully',
      document: doc
    });
  } catch (err) {
    console.error('Upload processing error:', err);
    res.status(500).json({
      success: false,
      error: `Failed to process PDF: ${err.message}`
    });
  }
});

app.get('/api/documents/:id', (req, res) => {
  const doc = Store.getDocument(req.params.id);
  if (!doc) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }
  res.json({ success: true, document: doc });
});

app.get('/api/documents/:id/file', (req, res) => {
  const doc = Store.getDocument(req.params.id);
  if (!doc) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }

  const filename = doc.filename;
  const p1 = path.join(Config.UPLOAD_FOLDER, filename);
  const p2 = path.join(Config.BASE_DIR, 'uploads', filename);

  let targetPath = null;
  if (fs.existsSync(p1)) {
    targetPath = p1;
  } else if (fs.existsSync(p2)) {
    targetPath = p2;
  }

  if (!targetPath) {
    return res.status(404).json({ success: false, error: 'File not found on server' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${doc.original_name}"`);
  res.sendFile(targetPath);
});

app.delete('/api/documents/:id', (req, res) => {
  const doc = Store.getDocument(req.params.id);
  if (!doc) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }

  // Safely delete file from disk
  const filename = doc.filename;
  for (const folder of [Config.UPLOAD_FOLDER, path.join(Config.BASE_DIR, 'uploads')]) {
    const p = path.join(folder, filename);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (e) {
        console.warn('Could not unlink physical file:', e.message);
      }
    }
  }

  Store.deleteDocument(req.params.id);
  res.json({ success: true, message: 'Document deleted successfully' });
});

app.post('/api/documents/:id/rename', (req, res) => {
  const newName = (req.body?.name || '').trim();
  if (!newName) {
    return res.status(400).json({ success: false, error: 'New document name cannot be empty' });
  }

  const updated = Store.renameDocument(req.params.id, newName);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }

  res.json({ success: true, message: 'Document renamed successfully' });
});

app.get('/api/chat/:doc_id/history', (req, res) => {
  const history = Store.getChatHistory(req.params.doc_id);
  res.json({ success: true, messages: history });
});

app.post('/api/chat/:doc_id/message', async (req, res) => {
  try {
    const docId = req.params.doc_id;
    const doc = Store.getDocument(docId);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const message = (req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty' });
    }

    if (!Config.isGeminiConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'Gemini API key is not configured. Please add your GEMINI_API_KEY in the Settings page.'
      });
    }

    // Save user message
    Store.addChatMessage({
      document_id: docId,
      role: 'user',
      content: message
    });

    // Retrieve relevant chunks via RAG
    const chunks = Store.getChunks(docId);
    const relevantChunks = RetrievalService.retrieveRelevantChunks(chunks, message, Config.TOP_K_CHUNKS);
    const history = Store.getChatHistory(docId);

    // Call Gemini AI
    const aiResponse = await AIService.chatWithDocument({
      query: message,
      contextChunks: relevantChunks,
      history
    });

    // Save AI response
    Store.addChatMessage({
      document_id: docId,
      role: 'assistant',
      content: aiResponse.reply,
      page_references: aiResponse.page_references
    });

    res.json({
      success: true,
      reply: aiResponse.reply,
      page_references: aiResponse.page_references,
      model: aiResponse.model
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/chat/:doc_id/history', (req, res) => {
  Store.clearChatHistory(req.params.doc_id);
  res.json({ success: true, message: 'Chat history cleared successfully' });
});

app.post('/api/documents/:doc_id/summarize', async (req, res) => {
  try {
    if (!Config.isGeminiConfigured()) {
      return res.status(400).json({ success: false, error: 'Gemini API key is not configured' });
    }
    const chunks = Store.getChunks(req.params.doc_id);
    if (chunks.length === 0) {
      return res.status(400).json({ success: false, error: 'Document has no text content to summarize' });
    }
    const result = await AIService.summarizeDocument(chunks);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/documents/:doc_id/key-points', async (req, res) => {
  try {
    if (!Config.isGeminiConfigured()) {
      return res.status(400).json({ success: false, error: 'Gemini API key is not configured' });
    }
    const chunks = Store.getChunks(req.params.doc_id);
    if (chunks.length === 0) {
      return res.status(400).json({ success: false, error: 'Document has no text content' });
    }
    const result = await AIService.generateKeyPoints(chunks);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/documents/:doc_id/practice-questions', async (req, res) => {
  try {
    if (!Config.isGeminiConfigured()) {
      return res.status(400).json({ success: false, error: 'Gemini API key is not configured' });
    }
    const chunks = Store.getChunks(req.params.doc_id);
    if (chunks.length === 0) {
      return res.status(400).json({ success: false, error: 'Document has no text content' });
    }
    const result = await AIService.generatePracticeQuestions(chunks);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/documents/:doc_id/explain-concept', async (req, res) => {
  try {
    if (!Config.isGeminiConfigured()) {
      return res.status(400).json({ success: false, error: 'Gemini API key is not configured' });
    }
    const concept = (req.body?.concept || '').trim();
    if (!concept) {
      return res.status(400).json({ success: false, error: 'Concept name is required' });
    }
    const chunks = Store.getChunks(req.params.doc_id);
    const result = await AIService.explainConcept(concept, chunks);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/settings', (req, res) => {
  res.json({
    success: true,
    is_configured: Config.isGeminiConfigured(),
    model: Config.GEMINI_MODEL,
    available_models: Config.AVAILABLE_MODELS
  });
});

app.post('/api/settings', (req, res) => {
  const { gemini_api_key, gemini_model } = req.body || {};

  if (gemini_api_key && gemini_api_key.trim()) {
    Config.GEMINI_API_KEY = gemini_api_key.trim();
  }

  if (gemini_model && gemini_model.trim()) {
    Config.GEMINI_MODEL = gemini_model.trim();
  }

  res.json({
    success: true,
    message: 'Settings updated successfully',
    is_configured: Config.isGeminiConfigured(),
    model: Config.GEMINI_MODEL
  });
});

app.post('/api/settings/test-api', async (req, res) => {
  const result = await AIService.testConnection();
  res.status(result.success ? 200 : 400).json(result);
});

// Start local dev server if executed directly
const isMain = process.argv[1] && process.argv[1].endsWith('server.js');
if (isMain && !Config.IS_VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`\n DocuMind AI Node.js Server running on http://127.0.0.1:${PORT}`);
    console.log(` AI Status: ${Config.isGeminiConfigured() ? 'Gemini Configured' : 'Missing API Key (Visit /settings)'}\n`);
  });
}

export default app;
