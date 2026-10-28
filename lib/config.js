import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '..');

// Load environment variables from .env if present
dotenv.config({ path: path.join(BASE_DIR, '.env') });

const IS_VERCEL = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

export const Config = {
  BASE_DIR,
  IS_VERCEL,
  SECRET_KEY: process.env.SECRET_KEY || 'dev-secret-key-ai-pdf-assistant-2026',
  
  GEMINI_API_KEY: (process.env.GEMINI_API_KEY || '').trim(),
  GEMINI_MODEL: (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim(),

  AVAILABLE_MODELS: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Recommended - Ultra Fast & Accurate)' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Complex Reasoning & Deep Analysis)' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Next-Gen Multimodal)' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Standard Speed)' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (High Precision)' }
  ],

  UPLOAD_FOLDER: IS_VERCEL
    ? path.join(os.tmpdir(), 'uploads')
    : path.join(BASE_DIR, 'uploads'),

  DATA_FILE: IS_VERCEL
    ? path.join(os.tmpdir(), 'data.json')
    : path.join(BASE_DIR, 'database', 'data.json'),

  SEED_DATA_FILE: path.join(BASE_DIR, 'database', 'data.json'),

  MAX_CONTENT_LENGTH: parseInt(process.env.MAX_CONTENT_LENGTH || String(32 * 1024 * 1024), 10),
  ALLOWED_EXTENSIONS: ['pdf'],

  CHUNK_SIZE: 1000,
  CHUNK_OVERLAP: 150,
  TOP_K_CHUNKS: 5,

  initFolders() {
    try {
      if (!fs.existsSync(this.UPLOAD_FOLDER)) {
        fs.mkdirSync(this.UPLOAD_FOLDER, { recursive: true });
      }
    } catch (e) {
      console.warn('Could not create upload folder:', e.message);
    }

    try {
      const dataDir = path.dirname(this.DATA_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    } catch (e) {
      console.warn('Could not create data folder:', e.message);
    }
  },

  isGeminiConfigured() {
    return Boolean(this.GEMINI_API_KEY && this.GEMINI_API_KEY !== 'your_gemini_api_key_here');
  }
};
