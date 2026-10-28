import { Config } from './config.js';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
  'arent', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both',
  'but', 'by', 'cant', 'cannot', 'could', 'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt',
  'doing', 'dont', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadnt',
  'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here',
  'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i', 'id', 'ill',
  'im', 'ive', 'if', 'in', 'into', 'is', 'isnt', 'it', 'its', 'itself', 'lets',
  'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same',
  'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such',
  'than', 'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there',
  'theres', 'these', 'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasnt', 'we', 'wed',
  'well', 'were', 'werent', 'what', 'whats', 'when', 'whens', 'where',
  'wheres', 'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would',
  'wouldnt', 'you', 'youd', 'youll', 'youre', 'youve', 'your', 'yours', 'yourself',
  'yourselves', 'tell', 'give', 'show', 'what', 'does', 'explain', 'describe', 'find'
]);

export const RetrievalService = {
  tokenize(text) {
    if (!text) return [];
    return (text.toLowerCase().match(/\b[a-zA-Z0-9_]{2,}\b/g) || []);
  },

  retrieveRelevantChunks(chunks, query, topK = Config.TOP_K_CHUNKS) {
    if (!chunks || chunks.length === 0) return [];
    if (chunks.length <= topK) return chunks;

    const allTokens = this.tokenize(query);
    let queryTokens = allTokens.filter(t => !STOP_WORDS.has(t));
    if (queryTokens.length === 0) {
      queryTokens = allTokens;
      if (queryTokens.length === 0) return chunks.slice(0, topK);
    }

    const numChunks = chunks.length;
    const docFreq = {};
    for (const token of new Set(queryTokens)) {
      let count = 0;
      for (const ch of chunks) {
        if (ch.text.toLowerCase().includes(token)) count++;
      }
      docFreq[token] = count;
    }

    const scoredChunks = [];
    const rawQueryLower = query.trim().toLowerCase();

    for (const chunk of chunks) {
      const textLower = chunk.text.toLowerCase();
      let score = 0;
      let matchedTokens = 0;

      for (const token of queryTokens) {
        if (textLower.includes(token)) {
          matchedTokens++;
          const df = docFreq[token] || 1;
          const idf = Math.log((numChunks - df + 0.5) / (df + 0.5) + 1.0);
          const termCount = (textLower.match(new RegExp(`\\b${token}\\b`, 'g')) || []).length || 1;
          score += termCount * idf;
        }
      }

      if (rawQueryLower.length > 5 && textLower.includes(rawQueryLower)) {
        score += 15.0;
      }

      if (queryTokens.length > 0 && matchedTokens > 0) {
        const matchRatio = matchedTokens / queryTokens.length;
        score *= (1.0 + matchRatio * 1.5);
      }

      scoredChunks.push({
        ...chunk,
        relevance_score: Math.round(score * 1000) / 1000
      });
    }

    scoredChunks.sort((a, b) => b.relevance_score - a.relevance_score);
    return scoredChunks.slice(0, topK);
  }
};
