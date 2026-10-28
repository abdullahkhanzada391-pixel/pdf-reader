import fs from 'node:fs/promises';
import { getDocumentProxy, extractText } from 'unpdf';
import { Config } from './config.js';

export const PDFService = {
  cleanText(text) {
    if (!text) return '';
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  },

  async extractTextAndMetadata(filePath) {
    const fileBuffer = await fs.readFile(filePath);
    const pdf = await getDocumentProxy(new Uint8Array(fileBuffer));
    const extracted = await extractText(pdf, { mergePages: false });

    const pagesData = [];
    let totalTextLength = 0;
    const numPages = extracted.totalPages || (Array.isArray(extracted.text) ? extracted.text.length : 0);

    const pageTexts = Array.isArray(extracted.text) ? extracted.text : [extracted.text || ''];

    for (let idx = 0; idx < pageTexts.length; idx++) {
      const pageNum = idx + 1;
      const rawText = pageTexts[idx] || '';
      const cleaned = this.cleanText(rawText);
      const charCount = cleaned.length;
      totalTextLength += charCount;

      pagesData.push({
        page_number: pageNum,
        text: cleaned,
        char_count: charCount
      });
    }

    const stats = await fs.stat(filePath);
    const isScanned = (totalTextLength < 50) || (numPages > 0 && (totalTextLength / numPages) < 25);

    const metadata = {
      num_pages: numPages,
      total_chars: totalTextLength,
      is_scanned: isScanned,
      file_size: stats.size
    };

    return { pagesData, metadata };
  },

  chunkPages(pagesData, chunkSize = Config.CHUNK_SIZE, overlap = Config.CHUNK_OVERLAP) {
    const chunks = [];
    let chunkIdx = 0;

    for (const page of pagesData) {
      const pageNum = page.page_number;
      const pageText = (page.text || '').trim();

      if (!pageText) continue;

      if (pageText.length <= chunkSize) {
        chunks.push({
          chunk_index: chunkIdx++,
          page_number: pageNum,
          text: pageText
        });
        continue;
      }

      let start = 0;
      while (start < pageText.length) {
        const end = start + chunkSize;
        const chunk = pageText.substring(start, end);
        chunks.push({
          chunk_index: chunkIdx++,
          page_number: pageNum,
          text: chunk.trim()
        });
        start += (chunkSize - overlap);
      }
    }

    return chunks;
  }
};

