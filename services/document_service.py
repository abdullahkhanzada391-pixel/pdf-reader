import os
import sqlite3
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from config import Config

def get_db_connection() -> sqlite3.Connection:
    """Creates a database connection with row factory and foreign keys enabled."""
    Config.init_folders()
    conn = sqlite3.connect(str(Config.DATABASE_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    """Initializes SQLite database tables."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Documents table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            num_pages INTEGER NOT NULL,
            is_scanned BOOLEAN DEFAULT 0,
            total_chunks INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    # Document chunks table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS document_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            page_number INTEGER NOT NULL,
            text TEXT NOT NULL,
            char_count INTEGER NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
        );
    """)
    
    # Chat messages table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            page_references TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
        );
    """)
    
    # Document analyses cache
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS document_analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id TEXT NOT NULL,
            analysis_type TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
            UNIQUE(document_id, analysis_type)
        );
    """)
    
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_doc ON document_chunks(document_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chat_doc_sess ON chat_messages(document_id, session_id);")
    
    conn.commit()
    conn.close()

class DocumentService:
    """Service to handle document storage, retrieval, and metadata management in SQLite."""

    @staticmethod
    def save_document(doc_id: str, filename: str, original_name: str, file_path: str,
                      file_size: int, num_pages: int, is_scanned: bool,
                      chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Saves document record and text chunks atomically."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO documents (id, filename, original_name, file_path, file_size, num_pages, is_scanned, total_chunks)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (doc_id, filename, original_name, file_path, file_size, num_pages, 1 if is_scanned else 0, len(chunks)))
            
            chunk_rows = [
                (doc_id, ch["chunk_index"], ch["page_number"], ch["text"], len(ch["text"]))
                for ch in chunks
            ]
            
            cursor.executemany("""
                INSERT INTO document_chunks (document_id, chunk_index, page_number, text, char_count)
                VALUES (?, ?, ?, ?, ?)
            """, chunk_rows)
            
            conn.commit()
            return DocumentService.get_document(doc_id)
        finally:
            conn.close()

    @staticmethod
    def get_all_documents() -> List[Dict[str, Any]]:
        """Retrieves all documents with formatted information."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM documents ORDER BY created_at DESC")
            rows = cursor.fetchall()
            docs = []
            for row in rows:
                doc = dict(row)
                doc["formatted_size"] = DocumentService._format_size(doc["file_size"])
                docs.append(doc)
            return docs
        finally:
            conn.close()

    @staticmethod
    def get_document(doc_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single document by its ID."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
            row = cursor.fetchone()
            if not row:
                return None
            doc = dict(row)
            doc["formatted_size"] = DocumentService._format_size(doc["file_size"])
            return doc
        finally:
            conn.close()

    @staticmethod
    def get_document_chunks(doc_id: str) -> List[Dict[str, Any]]:
        """Retrieves all text chunks for a document ordered by index."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, document_id, chunk_index, page_number, text, char_count
                FROM document_chunks
                WHERE document_id = ?
                ORDER BY chunk_index ASC
            """, (doc_id,))
            return [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()

    @staticmethod
    def delete_document(doc_id: str) -> bool:
        """Deletes a document from the database and removes the physical file."""
        doc = DocumentService.get_document(doc_id)
        if not doc:
            return False
            
        filename = doc.get("filename")
        if filename:
            for folder in [Config.UPLOAD_FOLDER, Config.BASE_DIR / "uploads"]:
                target = folder / filename
                if target.exists():
                    try:
                        target.unlink()
                    except OSError:
                        pass

        # Also check file_path column if valid
        raw_path = Path(doc.get("file_path", ""))
        if raw_path.exists():
            try:
                raw_path.unlink()
            except OSError:
                pass
                
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
            conn.commit()
            return True
        finally:
            conn.close()

    @staticmethod
    def rename_document(doc_id: str, new_name: str) -> bool:
        """Renames a document's display name."""
        if not new_name.strip():
            return False
        # Ensure it has .pdf extension if user omitted it
        clean_name = new_name.strip()
        if not clean_name.lower().endswith(".pdf"):
            clean_name += ".pdf"
            
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("UPDATE documents SET original_name = ? WHERE id = ?", (clean_name, doc_id))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    @staticmethod
    def get_notes(doc_id: str) -> str:
        """Retrieves saved notes for a document."""
        return DocumentService.get_analysis(doc_id, "notes") or ""

    @staticmethod
    def save_notes(doc_id: str, notes_content: str):
        """Saves user notes for a document."""
        DocumentService.save_analysis(doc_id, "notes", notes_content)

    @staticmethod
    def save_chat_message(doc_id: str, session_id: str, role: str, content: str,
                          page_references: Optional[List[int]] = None) -> Dict[str, Any]:
        """Saves a user or assistant chat message."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            refs_json = json.dumps(page_references or [])
            cursor.execute("""
                INSERT INTO chat_messages (document_id, session_id, role, content, page_references)
                VALUES (?, ?, ?, ?, ?)
            """, (doc_id, session_id, role, content, refs_json))
            msg_id = cursor.lastrowid
            conn.commit()
            return {
                "id": msg_id,
                "document_id": doc_id,
                "session_id": session_id,
                "role": role,
                "content": content,
                "page_references": page_references or []
            }
        finally:
            conn.close()

    @staticmethod
    def get_chat_history(doc_id: str, session_id: str) -> List[Dict[str, Any]]:
        """Gets chat history for a specific document and session."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, role, content, page_references, created_at
                FROM chat_messages
                WHERE document_id = ? AND session_id = ?
                ORDER BY created_at ASC, id ASC
            """, (doc_id, session_id))
            messages = []
            for row in cursor.fetchall():
                msg = dict(row)
                try:
                    msg["page_references"] = json.loads(msg["page_references"]) if msg["page_references"] else []
                except Exception:
                    msg["page_references"] = []
                messages.append(msg)
            return messages
        finally:
            conn.close()

    @staticmethod
    def clear_chat_history(doc_id: str, session_id: str) -> bool:
        """Clears chat history for a session."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM chat_messages WHERE document_id = ? AND session_id = ?", (doc_id, session_id))
            conn.commit()
            return True
        finally:
            conn.close()

    @staticmethod
    def save_analysis(doc_id: str, analysis_type: str, content: str):
        """Caches an AI analysis result for a document."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO document_analyses (document_id, analysis_type, content)
                VALUES (?, ?, ?)
                ON CONFLICT(document_id, analysis_type) DO UPDATE SET content=excluded.content, created_at=CURRENT_TIMESTAMP
            """, (doc_id, analysis_type, content))
            conn.commit()
        finally:
            conn.close()

    @staticmethod
    def get_analysis(doc_id: str, analysis_type: str) -> Optional[str]:
        """Gets cached AI analysis for a document."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT content FROM document_analyses
                WHERE document_id = ? AND analysis_type = ?
            """, (doc_id, analysis_type))
            row = cursor.fetchone()
            return row["content"] if row else None
        finally:
            conn.close()

    @staticmethod
    def get_system_stats() -> Dict[str, Any]:
        """Returns statistics for the dashboard."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*), COALESCE(SUM(num_pages), 0), COALESCE(SUM(file_size), 0) FROM documents")
            total_docs, total_pages, total_size = cursor.fetchone()
            
            cursor.execute("SELECT COUNT(*) FROM chat_messages WHERE role = 'user'")
            total_queries = cursor.fetchone()[0]
            
            return {
                "total_documents": total_docs,
                "total_pages": total_pages,
                "total_size_bytes": total_size,
                "formatted_total_size": DocumentService._format_size(total_size),
                "total_queries": total_queries
            }
        finally:
            conn.close()

    @staticmethod
    def _format_size(size_bytes: int) -> str:
        """Formats bytes into human readable size."""
        if not size_bytes:
            return "0 KB"
        units = ["B", "KB", "MB", "GB"]
        size = float(size_bytes)
        unit_idx = 0
        while size >= 1024 and unit_idx < len(units) - 1:
            size /= 1024
            unit_idx += 1
        return f"{size:.1f} {units[unit_idx]}" if unit_idx > 0 else f"{int(size)} B"
