import re
from typing import List, Dict, Any, Tuple, Optional
from google import genai
from google.genai import types
from config import Config

class AIService:
    """
    Service interfacing with Google Gemini API using the official Google Gen AI SDK.
    Handles RAG chat, document summarization, key points, practice questions, and explanations.
    """

    SYSTEM_INSTRUCTION = (
        "You are an intelligent, accurate, and helpful AI PDF Assistant.\n"
        "Guidelines:\n"
        "1. Answer questions strictly using the uploaded PDF document content provided in the context.\n"
        "2. Do not invent or assume information not present in the document.\n"
        "3. If the answer is not available in the document, state clearly: "
        "'I could not find information about that in the uploaded document.'\n"
        "4. Always cite specific page references whenever possible using the format '[Page X]'.\n"
        "5. Explain difficult or technical topics in clean, accessible language.\n"
        "6. Keep answers structured, well-organized with markdown (bullet points, bold highlights, headers).\n"
        "7. Maintain conversational context for follow-up questions.\n"
        "8. Clearly distinguish document facts from general explanations or analogies."
    )

    @classmethod
    def get_client(cls) -> genai.Client:
        """Instantiates the Gemini Gen AI client with the configured API key."""
        api_key = Config.GEMINI_API_KEY
        if not api_key or api_key == "your_gemini_api_key_here":
            raise ValueError(
                "Gemini API key is not configured. Please add your GEMINI_API_KEY in the .env file or via the Settings page."
            )
        return genai.Client(api_key=api_key)

    @classmethod
    def test_connection(cls) -> Dict[str, Any]:
        """Tests the Gemini API connection with the active model."""
        try:
            client = cls.get_client()
            model = Config.GEMINI_MODEL
            response = client.models.generate_content(
                model=model,
                contents="Ping. Respond with 'Connected successfully' only.",
                config=types.GenerateContentConfig(
                    max_output_tokens=30,
                    temperature=0.1
                )
            )
            return {
                "success": True,
                "model": model,
                "message": response.text.strip() if response.text else "Connected successfully"
            }
        except Exception as e:
            return {
                "success": False,
                "model": Config.GEMINI_MODEL,
                "error": str(e)
            }

    @classmethod
    def chat(cls, document_name: str, query: str,
             relevant_chunks: List[Dict[str, Any]],
             history: Optional[List[Dict[str, Any]]] = None) -> Tuple[str, List[int]]:
        """
        Sends query and retrieved context to Gemini and returns answer with page citations.
        """
        client = cls.get_client()

        # Build context from relevant chunks
        context_parts = []
        available_pages = set()
        for ch in relevant_chunks:
            p_num = ch["page_number"]
            available_pages.add(p_num)
            context_parts.append(f"--- Document Content [Page {p_num}] ---\n{ch['text']}\n")

        context_str = "\n".join(context_parts)

        # Assemble prompt with context
        prompt = (
            f"Document Name: \"{document_name}\"\n\n"
            f"Relevant Context from Document:\n{context_str}\n\n"
            f"User Question: {query}\n\n"
            f"Provide a thorough, accurate response based strictly on the above context. "
            f"Include '[Page X]' citations corresponding to the pages where the facts appear."
        )

        # Format history if present
        contents = []
        if history:
            # Include up to last 6 messages for context
            for msg in history[-6:]:
                role = "user" if msg["role"] == "user" else "model"
                contents.append(
                    types.Content(
                        role=role,
                        parts=[types.Part.from_text(text=msg["content"])]
                    )
                )

        # Add current prompt
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=prompt)]
            )
        )

        config = types.GenerateContentConfig(
            system_instruction=cls.SYSTEM_INSTRUCTION,
            temperature=0.2,
            top_p=0.95
        )

        try:
            response = client.models.generate_content(
                model=Config.GEMINI_MODEL,
                contents=contents,
                config=config
            )
            answer = response.text or "No response generated."
        except Exception as e:
            # Fallback to gemini-3.5-flash-lite if configured model has error
            if Config.GEMINI_MODEL != "gemini-3.5-flash-lite":
                try:
                    response = client.models.generate_content(
                        model="gemini-3.5-flash-lite",
                        contents=contents,
                        config=config
                    )
                    answer = response.text or "No response generated."
                except Exception:
                    raise e
            else:
                raise e

        # Extract cited page numbers from response text or matching chunks
        cited_pages = cls._extract_page_citations(answer, available_pages)

        return answer, cited_pages

    @classmethod
    def generate_summary(cls, document_name: str, chunks: List[Dict[str, Any]], summary_type: str = "detailed") -> str:
        """
        Generates a summary of the document (short, detailed, or important topics).
        """
        client = cls.get_client()
        context = cls._combine_chunks_for_context(chunks, max_chars=35000)

        if summary_type == "short":
            instruction = (
                f"You are analyzing the document '{document_name}'. "
                "Provide an executive, concise summary in 2 to 3 well-crafted paragraphs highlighting the central purpose, main findings, and key takeaways."
            )
        elif summary_type == "topics":
            instruction = (
                f"You are analyzing the document '{document_name}'. "
                "Identify and analyze the 5 to 10 most important topics/themes discussed in this document. "
                "For each topic, provide a bold heading and a 2-3 sentence overview with page references where discussed."
            )
        else: # detailed
            instruction = (
                f"You are analyzing the document '{document_name}'. "
                "Provide a comprehensive, detailed summary structured with markdown headings:\n"
                "1. Document Overview & Objective\n"
                "2. Core Concepts & Methodology / Main Body\n"
                "3. Key Findings & Arguments\n"
                "4. Conclusions and Recommendations\n"
                "Cite page numbers [Page X] where applicable."
            )

        prompt = f"Document: \"{document_name}\"\n\nContent:\n{context}\n\nTask: {instruction}"

        response = client.models.generate_content(
            model=Config.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=cls.SYSTEM_INSTRUCTION,
                temperature=0.3
            )
        )
        return response.text or "Unable to generate summary."

    @classmethod
    def extract_key_points(cls, document_name: str, chunks: List[Dict[str, Any]]) -> str:
        """Extracts key points in organized bullet format."""
        client = cls.get_client()
        context = cls._combine_chunks_for_context(chunks, max_chars=35000)

        prompt = (
            f"Document: \"{document_name}\"\n\nContent:\n{context}\n\n"
            "Task: Extract the most important key points and insights from this document.\n"
            "Format the output as:\n"
            "- A high-level 1-sentence synopsis.\n"
            "- 8 to 12 clear, impactful bullet points covering critical facts, arguments, and takeaways.\n"
            "- Include '[Page X]' citations next to points where possible.\n"
            "Use clear bold highlights for readability."
        )

        response = client.models.generate_content(
            model=Config.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=cls.SYSTEM_INSTRUCTION,
                temperature=0.2
            )
        )
        return response.text or "Unable to extract key points."

    @classmethod
    def explain_simply(cls, document_name: str, text_to_explain: str) -> str:
        """Explains complicated paragraphs in beginner-friendly language."""
        client = cls.get_client()

        prompt = (
            f"Document context: \"{document_name}\"\n\n"
            f"Original Content to Explain:\n\"\"\"{text_to_explain}\"\"\"\n\n"
            "Task: Explain this content in beginner-friendly, crystal-clear language ("
            "Explain Like I'm 5 / freshman college level):\n"
            "1. Plain English translation of the core message without jargon.\n"
            "2. Break down any complex terms or technical jargon used.\n"
            "3. Provide a simple everyday real-world analogy to make it easy to remember.\n"
            "4. Why this matters in simple terms."
        )

        response = client.models.generate_content(
            model=Config.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=cls.SYSTEM_INSTRUCTION,
                temperature=0.4
            )
        )
        return response.text or "Unable to generate explanation."

    @classmethod
    def generate_questions(cls, document_name: str, chunks: List[Dict[str, Any]]) -> str:
        """
        Generates 10 practice questions from the PDF, with answers formatted separately.
        """
        client = cls.get_client()
        context = cls._combine_chunks_for_context(chunks, max_chars=35000)

        prompt = (
            f"Document: \"{document_name}\"\n\nContent:\n{context}\n\n"
            "Task: Generate exactly 10 comprehensive practice questions based directly on the provided document.\n"
            "Structure the response into two clear parts:\n\n"
            "### Part 1: Practice Questions\n"
            "Numbered 1 through 10. Include a mix of conceptual, factual, and analytical questions. Indicate difficulty (Beginner, Intermediate, Advanced) and page references.\n\n"
            "### Part 2: Detailed Answer Key\n"
            "Numbered 1 through 10 matching the questions above. Provide complete, accurate answers directly citing '[Page X]'."
        )

        response = client.models.generate_content(
            model=Config.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=cls.SYSTEM_INSTRUCTION,
                temperature=0.3
            )
        )
        return response.text or "Unable to generate practice questions."

    @classmethod
    def extract_information(cls, document_name: str, chunks: List[Dict[str, Any]]) -> str:
        """
        Extracts important dates, names, definitions, and figures from the document.
        """
        client = cls.get_client()
        context = cls._combine_chunks_for_context(chunks, max_chars=35000)

        prompt = (
            f"Document: \"{document_name}\"\n\nContent:\n{context}\n\n"
            "Task: Extract structured key entities from the document categorized as follows:\n\n"
            "### 1. Important Dates & Timelines\n"
            "List dates, years, or milestones with their significance.\n\n"
            "### 2. Key People, Organizations & Roles\n"
            "List prominent names, authors, entities, or stakeholders.\n\n"
            "### 3. Core Terminology & Definitions\n"
            "List technical terms, acronyms, and definitions explained in the text.\n\n"
            "### 4. Key Figures, Metrics & Numerical Data\n"
            "List statistics, percentages, measurements, and numerical findings.\n\n"
            "Include page references [Page X] for each item."
        )

        response = client.models.generate_content(
            model=Config.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=cls.SYSTEM_INSTRUCTION,
                temperature=0.2
            )
        )
        return response.text or "Unable to extract information."

    @staticmethod
    def _combine_chunks_for_context(chunks: List[Dict[str, Any]], max_chars: int = 35000) -> str:
        """Combines chunks up to max character limit while preserving page markers."""
        combined = []
        current_len = 0
        for ch in chunks:
            part = f"[Page {ch['page_number']}]\n{ch['text']}\n"
            if current_len + len(part) > max_chars:
                break
            combined.append(part)
            current_len += len(part)
        return "\n".join(combined)

    @staticmethod
    def _extract_page_citations(text: str, available_pages: set) -> List[int]:
        """Extracts page numbers mentioned in text in format [Page X] or Page X."""
        matches = re.findall(r"\[Page\s*(\d+)\]", text, re.IGNORECASE)
        if not matches:
            matches = re.findall(r"\bpage\s*(\d+)\b", text, re.IGNORECASE)

        pages = set()
        for m in matches:
            try:
                pages.add(int(m))
            except ValueError:
                pass

        # If model didn't explicitly write page numbers, use the pages from the retrieved chunks
        if not pages and available_pages:
            return sorted(list(available_pages))

        return sorted(list(pages))
