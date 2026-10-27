import re
import math
from typing import List, Dict, Any
from config import Config

class RetrievalService:
    """
    Modular text-based retrieval service (RAG).
    Uses BM25 / TF-IDF scoring with exact matching and keyword density.
    Easily extensible for vector embeddings and hybrid search.
    """

    STOP_WORDS = {
        "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
        "aren't", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both",
        "but", "by", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't",
        "doing", "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't",
        "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
        "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll",
        "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's",
        "me", "more", "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off", "on", "once",
        "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same",
        "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such",
        "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
        "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those",
        "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd",
        "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", "where",
        "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would",
        "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself",
        "yourselves", "tell", "give", "show", "what", "does", "explain", "describe", "find"
    }

    @staticmethod
    def tokenize(text: str) -> List[str]:
        """Converts text to normalized lowercase word tokens."""
        return re.findall(r"\b[a-zA-Z0-9_]{2,}\b", text.lower())

    @staticmethod
    def retrieve_relevant_chunks(chunks: List[Dict[str, Any]], query: str, top_k: int = Config.TOP_K_CHUNKS) -> List[Dict[str, Any]]:
        """
        Ranks document chunks by keyword relevance to the user query.
        Returns top_k chunks with their relevance scores and page numbers.
        """
        if not chunks:
            return []

        # If document is small and has fewer chunks than top_k, return all
        if len(chunks) <= top_k:
            return chunks

        query_tokens = [t for t in RetrievalService.tokenize(query) if t not in RetrievalService.STOP_WORDS]
        
        # If query has no content words (e.g., 'hello'), use raw query tokens
        if not query_tokens:
            query_tokens = RetrievalService.tokenize(query)
            if not query_tokens:
                return chunks[:top_k]

        # Calculate document frequencies for BM25-like inverse document frequency
        num_chunks = len(chunks)
        doc_freq = {}
        for token in set(query_tokens):
            count = sum(1 for ch in chunks if token in ch["text"].lower())
            doc_freq[token] = count

        scored_chunks = []
        raw_query_lower = query.strip().lower()

        for chunk in chunks:
            text_lower = chunk["text"].lower()
            tokens_in_chunk = RetrievalService.tokenize(chunk["text"])
            chunk_len = len(tokens_in_chunk) or 1

            score = 0.0

            # Exact phrase match bonus
            if len(raw_query_lower) > 5 and raw_query_lower in text_lower:
                score += 5.0

            # Token overlap with TF-IDF / BM25 weighting
            for token in query_tokens:
                tf = tokens_in_chunk.count(token)
                if tf > 0:
                    df = doc_freq.get(token, 1)
                    # IDF with smoothing
                    idf = math.log((num_chunks - df + 0.5) / (df + 0.5) + 1.0)
                    # Term frequency saturation
                    score += (tf / (tf + 1.5)) * idf

            # Proximity bonus if multiple query terms appear close together
            if len(query_tokens) > 1:
                matching_terms = sum(1 for t in query_tokens if t in text_lower)
                if matching_terms >= 2:
                    score += (matching_terms / len(query_tokens)) * 2.0

            scored_chunks.append({
                **chunk,
                "score": round(score, 4)
            })

        # Sort descending by score
        scored_chunks.sort(key=lambda x: x["score"], reverse=True)

        # If best score is 0 (no keywords matched query), fall back to first chunks
        if scored_chunks[0]["score"] == 0.0:
            return chunks[:top_k]

        return scored_chunks[:top_k]
