import os
import re
from pathlib import Path
from typing import List, Dict, Any, Tuple
from config import Config

class PDFService:
    """Service for extracting text, detecting scanned PDFs, and chunking documents."""

    @staticmethod
    def extract_text_and_metadata(file_path: Path) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Extracts text page-by-page from a PDF file.
        Returns a tuple of (pages_list, metadata).
        Each page in pages_list contains: {'page_number': int, 'text': str, 'char_count': int}.
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"PDF file not found at: {file_path}")

        pages_data = []
        total_text_length = 0

        # Try pypdf
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(file_path))
            num_pages = len(reader.pages)

            for idx, page in enumerate(reader.pages):
                page_num = idx + 1
                try:
                    text = page.extract_text() or ""
                except Exception:
                    text = ""
                
                # Clean whitespace
                cleaned_text = PDFService._clean_text(text)
                char_count = len(cleaned_text)
                total_text_length += char_count

                pages_data.append({
                    "page_number": page_num,
                    "text": cleaned_text,
                    "char_count": char_count
                })

        except Exception as e:
            # Fallback to PyMuPDF if pypdf encounters an issue
            try:
                import fitz
                doc = fitz.open(str(file_path))
                num_pages = len(doc)
                pages_data = []
                total_text_length = 0
                for idx, page in enumerate(doc):
                    page_num = idx + 1
                    text = page.get_text() or ""
                    cleaned_text = PDFService._clean_text(text)
                    char_count = len(cleaned_text)
                    total_text_length += char_count
                    pages_data.append({
                        "page_number": page_num,
                        "text": cleaned_text,
                        "char_count": char_count
                    })
                doc.close()
            except Exception:
                raise RuntimeError(f"Failed to process PDF document: {str(e)}")

        # Detect scanned or image-only PDF
        # If average text per page is extremely low (< 30 characters), it's likely scanned or image-based
        is_scanned = (total_text_length < 50) or (num_pages > 0 and (total_text_length / num_pages) < 25)

        metadata = {
            "num_pages": num_pages,
            "total_chars": total_text_length,
            "is_scanned": is_scanned,
            "file_size": file_path.stat().st_size
        }

        return pages_data, metadata

    @staticmethod
    def chunk_pages(pages_data: List[Dict[str, Any]],
                    chunk_size: int = Config.CHUNK_SIZE,
                    overlap: int = Config.CHUNK_OVERLAP) -> List[Dict[str, Any]]:
        """
        Splits page text into manageable chunks while preserving page numbers.
        Each chunk: {'chunk_index': int, 'page_number': int, 'text': str}.
        """
        chunks = []
        chunk_idx = 0

        for page in pages_data:
            page_num = page["page_number"]
            page_text = page["text"].strip()

            if not page_text:
                continue

            # If page text fits within chunk size, keep it as a single chunk
            if len(page_text) <= chunk_size:
                chunks.append({
                    "chunk_index": chunk_idx,
                    "page_number": page_num,
                    "text": page_text
                })
                chunk_idx += 1
                continue

            # Otherwise, split by paragraphs or sliding window with overlap
            paragraphs = page_text.split("\n\n")
            current_chunk = ""

            for para in paragraphs:
                para = para.strip()
                if not para:
                    continue

                if len(current_chunk) + len(para) + 2 <= chunk_size:
                    current_chunk = f"{current_chunk}\n\n{para}".strip()
                else:
                    if current_chunk:
                        chunks.append({
                            "chunk_index": chunk_idx,
                            "page_number": page_num,
                            "text": current_chunk
                        })
                        chunk_idx += 1

                    # If paragraph itself is longer than chunk_size, split by sliding window
                    if len(para) > chunk_size:
                        start = 0
                        while start < len(para):
                            end = start + chunk_size
                            part = para[start:end]
                            chunks.append({
                                "chunk_index": chunk_idx,
                                "page_number": page_num,
                                "text": part
                            })
                            chunk_idx += 1
                            start += (chunk_size - overlap)
                        current_chunk = ""
                    else:
                        current_chunk = para

            if current_chunk:
                chunks.append({
                    "chunk_index": chunk_idx,
                    "page_number": page_num,
                    "text": current_chunk
                })
                chunk_idx += 1

        return chunks

    @staticmethod
    def _clean_text(text: str) -> str:
        """Cleans and normalizes extracted PDF text."""
        if not text:
            return ""
        # Replace multiple spaces with a single space
        text = re.sub(r"[ \t]+", " ", text)
        # Replace 3 or more newlines with two newlines
        text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
        # Strip trailing/leading spaces on lines
        lines = [line.strip() for line in text.split("\n")]
        return "\n".join(lines).strip()
