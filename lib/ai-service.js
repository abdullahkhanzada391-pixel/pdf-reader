import { GoogleGenAI } from '@google/genai';
import { Config } from './config.js';

const SYSTEM_INSTRUCTION = `You are an intelligent, accurate, and helpful AI PDF Assistant.
Guidelines:
1. Answer questions strictly using the uploaded PDF document content provided in the context.
2. Do not invent or assume information not present in the document.
3. If the answer is not available in the document, state clearly: 'I could not find information about that in the uploaded document.'
4. Always cite specific page references whenever possible using the format '[Page X]'.
5. Explain difficult or technical topics in clean, accessible language.
6. Keep answers structured, well-organized with markdown (bullet points, bold highlights, headers).
7. Maintain conversational context for follow-up questions.
8. Clearly distinguish document facts from general explanations or analogies.`;

export const AIService = {
  getClient() {
    const apiKey = Config.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      throw new Error(
        'Gemini API key is not configured. Please add your GEMINI_API_KEY in the .env file, Vercel Environment Variables, or via the Settings page.'
      );
    }
    return new GoogleGenAI({ apiKey });
  },

  async testConnection() {
    try {
      const client = this.getClient();
      const model = Config.GEMINI_MODEL;
      const response = await client.models.generateContent({
        model,
        contents: 'Ping. Respond with "Connected successfully" only.',
        config: {
          maxOutputTokens: 30,
          temperature: 0.1
        }
      });
      return {
        success: true,
        model,
        message: (response.text || '').trim() || 'Connected successfully'
      };
    } catch (e) {
      return {
        success: false,
        model: Config.GEMINI_MODEL,
        error: e.message
      };
    }
  },

  async chatWithDocument({ query, contextChunks, history = [] }) {
    const client = this.getClient();
    const model = Config.GEMINI_MODEL;

    let contextSection = 'DOCUMENT CONTEXT EXCERPTS:\n';
    const citedPages = new Set();

    for (const chunk of contextChunks) {
      const pageNum = chunk.page_number;
      citedPages.add(pageNum);
      contextSection += `\n--- [Page ${pageNum}] ---\n${chunk.text}\n`;
    }

    let historySection = '';
    if (history.length > 0) {
      historySection = 'PREVIOUS CONVERSATION:\n';
      const recent = history.slice(-6);
      for (const msg of recent) {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        historySection += `${role}: ${msg.content}\n`;
      }
      historySection += '\n';
    }

    const fullPrompt = `${contextSection}\n${historySection}USER QUESTION: ${query}\n\nProvide an accurate, well-formatted answer based strictly on the excerpts above with [Page X] citations.`;

    const response = await client.models.generateContent({
      model,
      contents: fullPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2
      }
    });

    const reply = (response.text || '').trim();

    // Extract pages referenced in the reply
    const pageMatches = reply.match(/\[(?:Page|p\.)\s*(\d+)\]/gi) || [];
    const extractedPages = new Set();
    for (const m of pageMatches) {
      const numMatch = m.match(/\d+/);
      if (numMatch) extractedPages.add(parseInt(numMatch[0], 10));
    }

    const finalPages = extractedPages.size > 0
      ? Array.from(extractedPages).sort((a, b) => a - b)
      : Array.from(citedPages).sort((a, b) => a - b).slice(0, 3);

    return {
      reply,
      page_references: finalPages,
      model
    };
  },

  async summarizeDocument(chunks) {
    const client = this.getClient();
    const model = Config.GEMINI_MODEL;

    // Sample evenly across chunks to fit within context window
    const sample = chunks.length <= 15
      ? chunks
      : chunks.filter((_, i) => i % Math.ceil(chunks.length / 15) === 0);

    const docText = sample.map(c => `[Page ${c.page_number}]: ${c.text}`).join('\n\n');

    const prompt = `Please provide a comprehensive, executive summary of the following document:\n\n${docText}\n\n` +
      `Structure your summary with:\n` +
      `1. **Executive Overview** (2-3 concise paragraphs)\n` +
      `2. **Key Objectives & Findings** (bullet points with [Page X] references)\n` +
      `3. **Key Takeaways & Implications**`;

    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: 'You are an expert document summarizer. Synthesize core insights accurately.',
        temperature: 0.2
      }
    });

    return { summary: (response.text || '').trim(), model };
  },

  async generateKeyPoints(chunks) {
    const client = this.getClient();
    const model = Config.GEMINI_MODEL;

    const sample = chunks.length <= 15
      ? chunks
      : chunks.filter((_, i) => i % Math.ceil(chunks.length / 15) === 0);

    const docText = sample.map(c => `[Page ${c.page_number}]: ${c.text}`).join('\n\n');

    const prompt = `Extract the top 5 to 8 most essential key points from this document:\n\n${docText}\n\n` +
      `Format each key point with a bold title, an explanation, and page reference citations [Page X].`;

    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: 'You are an analytical assistant highlighting essential knowledge.',
        temperature: 0.2
      }
    });

    return { key_points: (response.text || '').trim(), model };
  },

  async generatePracticeQuestions(chunks) {
    const client = this.getClient();
    const model = Config.GEMINI_MODEL;

    const sample = chunks.length <= 15
      ? chunks
      : chunks.filter((_, i) => i % Math.ceil(chunks.length / 15) === 0);

    const docText = sample.map(c => `[Page ${c.page_number}]: ${c.text}`).join('\n\n');

    const prompt = `Based on this document, create 5 high-yield study/review questions with detailed answers:\n\n${docText}\n\n` +
      `For each question:\n` +
      `- State the **Question** clearly\n` +
      `- Provide a thorough, educational **Answer**\n` +
      `- Cite the relevant **[Page X]**`;

    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: 'You are an educational tutor creating practice tests from study materials.',
        temperature: 0.3
      }
    });

    return { questions: (response.text || '').trim(), model };
  },

  async explainConcept(concept, chunks) {
    const client = this.getClient();
    const model = Config.GEMINI_MODEL;

    const docText = chunks.slice(0, 10).map(c => `[Page ${c.page_number}]: ${c.text}`).join('\n\n');

    const prompt = `Explain the concept: "${concept}" based on the following document context:\n\n${docText}\n\n` +
      `Provide:\n` +
      `1. Clear Definition in simple terms\n` +
      `2. How it is used or discussed in the document (cite [Page X])\n` +
      `3. An intuitive real-world analogy to solidify understanding`;

    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: 'You are an expert tutor skilled at explaining complex ideas simply.',
        temperature: 0.3
      }
    });

    return { explanation: (response.text || '').trim(), model };
  }
};
