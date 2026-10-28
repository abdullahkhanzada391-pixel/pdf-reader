import fs from 'node:fs';
import path from 'node:path';
import { Config } from './config.js';

let cache = null;

function formatSize(bytes) {
  if (bytes == null || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function enrichDocument(doc) {
  if (!doc) return null;
  return {
    ...doc,
    formatted_size: formatSize(doc.file_size),
    created_date: (doc.created_at || '').substring(0, 10) || new Date().toISOString().substring(0, 10)
  };
}

export const Store = {
  loadData() {
    if (cache) return cache;
    Config.initFolders();

    // On Vercel, if /tmp/data.json does not exist yet, try to seed from database/data.json
    if (!fs.existsSync(Config.DATA_FILE) && fs.existsSync(Config.SEED_DATA_FILE)) {
      try {
        fs.copyFileSync(Config.SEED_DATA_FILE, Config.DATA_FILE);
      } catch (err) {
        console.warn('Could not copy seed data to writable destination:', err.message);
      }
    }

    if (fs.existsSync(Config.DATA_FILE)) {
      try {
        const raw = fs.readFileSync(Config.DATA_FILE, 'utf-8');
        cache = JSON.parse(raw);
      } catch (err) {
        console.error('Failed to parse database JSON, falling back:', err);
      }
    }

    if (!cache) {
      if (fs.existsSync(Config.SEED_DATA_FILE)) {
        try {
          cache = JSON.parse(fs.readFileSync(Config.SEED_DATA_FILE, 'utf-8'));
        } catch {
          cache = { documents: [], document_chunks: [], chat_messages: [] };
        }
      } else {
        cache = { documents: [], document_chunks: [], chat_messages: [] };
      }
    }

    cache.documents = cache.documents || [];
    cache.document_chunks = cache.document_chunks || [];
    cache.chat_messages = cache.chat_messages || [];

    return cache;
  },

  saveData() {
    if (!cache) return;
    try {
      Config.initFolders();
      fs.writeFileSync(Config.DATA_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Failed to write data file (read-only environment?):', err.message);
    }
  },

  getAllDocuments() {
    const data = this.loadData();
    return [...data.documents]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .map(enrichDocument);
  },

  getDocument(id) {
    const data = this.loadData();
    const doc = data.documents.find(d => d.id === id);
    return enrichDocument(doc);
  },

  getSystemStats() {
    const data = this.loadData();
    const totalDocs = data.documents.length;
    const totalPages = data.documents.reduce((sum, d) => sum + (d.num_pages || 0), 0);
    const totalChunks = data.document_chunks.length;
    const totalChats = data.chat_messages.length;

    return {
      total_documents: totalDocs,
      total_pages: totalPages,
      total_chunks: totalChunks,
      total_chats: totalChats
    };
  },

  saveDocument({ id, filename, original_name, file_path, file_size, num_pages, is_scanned, chunks = [] }) {
    const data = this.loadData();
    const newDoc = {
      id,
      filename,
      original_name,
      file_path,
      file_size,
      num_pages,
      is_scanned: is_scanned ? 1 : 0,
      total_chunks: chunks.length,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };

    // Remove existing if any
    data.documents = data.documents.filter(d => d.id !== id);
    data.documents.unshift(newDoc);

    // Save chunks
    data.document_chunks = data.document_chunks.filter(c => c.document_id !== id);
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      data.document_chunks.push({
        id: `${id}_chunk_${i}`,
        document_id: id,
        chunk_index: ch.chunk_index ?? i,
        page_number: ch.page_number,
        text: ch.text,
        char_count: ch.text.length
      });
    }

    this.saveData();
    return enrichDocument(newDoc);
  },

  deleteDocument(id) {
    const data = this.loadData();
    const doc = data.documents.find(d => d.id === id);
    if (!doc) return false;

    data.documents = data.documents.filter(d => d.id !== id);
    data.document_chunks = data.document_chunks.filter(c => c.document_id !== id);
    data.chat_messages = data.chat_messages.filter(m => m.document_id !== id);

    this.saveData();
    return true;
  },

  renameDocument(id, newName) {
    const data = this.loadData();
    const doc = data.documents.find(d => d.id === id);
    if (!doc) return false;

    doc.original_name = newName.trim();
    this.saveData();
    return true;
  },

  getChunks(documentId) {
    const data = this.loadData();
    return data.document_chunks
      .filter(c => c.document_id === documentId)
      .sort((a, b) => a.chunk_index - b.chunk_index);
  },

  getChatHistory(documentId) {
    const data = this.loadData();
    return data.chat_messages
      .filter(m => m.document_id === documentId)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
      .map(m => ({
        ...m,
        page_references: typeof m.page_references === 'string'
          ? (m.page_references ? JSON.parse(m.page_references) : [])
          : (m.page_references || [])
      }));
  },

  addChatMessage({ document_id, session_id = 'default', role, content, page_references = [] }) {
    const data = this.loadData();
    const message = {
      id: Date.now() + Math.random().toString(36).substring(2, 7),
      document_id,
      session_id,
      role,
      content,
      page_references: JSON.stringify(page_references),
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };

    data.chat_messages.push(message);
    this.saveData();
    return {
      ...message,
      page_references
    };
  },

  clearChatHistory(documentId) {
    const data = this.loadData();
    data.chat_messages = data.chat_messages.filter(m => m.document_id !== documentId);
    this.saveData();
    return true;
  }
};

