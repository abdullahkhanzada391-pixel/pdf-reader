import os
import uuid
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for
from werkzeug.utils import secure_filename
from dotenv import set_key

from config import Config
from services.document_service import DocumentService, init_db
from services.pdf_service import PDFService
from services.retrieval_service import RetrievalService
from services.ai_service import AIService

# Initialize Flask App
app = Flask(__name__)
app.config.from_object(Config)

# Ensure folders exist and initialize SQLite database
Config.init_folders()
init_db()

def allowed_file(filename: str) -> bool:
    """Validates that file has a .pdf extension."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in Config.ALLOWED_EXTENSIONS

# ==========================================
# Frontend Page Routes
# ==========================================

@app.route("/")
def dashboard():
    """Main Dashboard page."""
    stats = DocumentService.get_system_stats()
    recent_docs = DocumentService.get_all_documents()[:5]
    is_ai_ready = Config.is_gemini_configured()
    return render_template(
        "dashboard.html",
        active_page="dashboard",
        stats=stats,
        recent_docs=recent_docs,
        is_ai_ready=is_ai_ready,
        model_name=Config.GEMINI_MODEL
    )

@app.route("/documents")
def documents():
    """Documents management page."""
    docs = DocumentService.get_all_documents()
    return render_template(
        "documents.html",
        active_page="documents",
        documents=docs,
        is_ai_ready=Config.is_gemini_configured()
    )

@app.route("/chat")
@app.route("/chat/<doc_id>")
def chat(doc_id=None):
    """AI PDF Chat page."""
    docs = DocumentService.get_all_documents()
    active_doc = None
    if doc_id:
        active_doc = DocumentService.get_document(doc_id)
    elif docs:
        active_doc = docs[0]
        
    return render_template(
        "chat.html",
        active_page="chat",
        documents=docs,
        active_doc=active_doc,
        is_ai_ready=Config.is_gemini_configured(),
        model_name=Config.GEMINI_MODEL
    )

@app.route("/reader")
@app.route("/reader/<doc_id>")
def reader(doc_id=None):
    """Three-panel PDF Reader Workspace."""
    docs = DocumentService.get_all_documents()
    active_doc = None
    if doc_id:
        active_doc = DocumentService.get_document(doc_id)
    elif docs:
        active_doc = docs[0]
        
    notes = DocumentService.get_notes(active_doc["id"]) if active_doc else ""
    return render_template(
        "reader.html",
        active_page="reader",
        documents=docs,
        active_doc=active_doc,
        initial_notes=notes,
        is_ai_ready=Config.is_gemini_configured(),
        model_name=Config.GEMINI_MODEL
    )

@app.route("/settings")
def settings():
    """Application Settings page."""
    stats = DocumentService.get_system_stats()
    return render_template(
        "settings.html",
        active_page="settings",
        is_configured=Config.is_gemini_configured(),
        current_model=Config.GEMINI_MODEL,
        max_upload_mb=Config.MAX_CONTENT_LENGTH // (1024 * 1024),
        stats=stats
    )

# ==========================================
# PDF Upload & Document APIs
# ==========================================

@app.route("/api/upload", methods=["POST"])
def upload_pdf():
    """Handles PDF file upload, text extraction, scanned check, and chunking."""
    if "files" not in request.files and "file" not in request.files:
        return jsonify({"success": False, "error": "No file part in request"}), 400

    uploaded_files = request.files.getlist("files") or [request.files.get("file")]
    uploaded_files = [f for f in uploaded_files if f and f.filename]

    if not uploaded_files:
        return jsonify({"success": False, "error": "No files selected for upload"}), 400

    saved_documents = []
    errors = []

    for file in uploaded_files:
        original_name = file.filename
        if not allowed_file(original_name):
            errors.append(f"'{original_name}' is not a valid PDF file.")
            continue

        doc_id = uuid.uuid4().hex[:12]
        safe_original = secure_filename(original_name)
        if not safe_original:
            safe_original = f"document_{doc_id}.pdf"
            
        stored_filename = f"{doc_id}_{safe_original}"
        file_path = Config.UPLOAD_FOLDER / stored_filename

        try:
            file.save(str(file_path))
            file_size = file_path.stat().st_size

            # Check file size against limit
            if file_size > Config.MAX_CONTENT_LENGTH:
                file_path.unlink(missing_ok=True)
                errors.append(f"'{original_name}' exceeds maximum allowed size ({Config.MAX_CONTENT_LENGTH // (1024*1024)}MB).")
                continue

            # Extract text page by page
            pages_data, metadata = PDFService.extract_text_and_metadata(file_path)

            # Chunk text with page references
            chunks = PDFService.chunk_pages(pages_data)

            # Save in SQLite
            doc_record = DocumentService.save_document(
                doc_id=doc_id,
                filename=stored_filename,
                original_name=original_name,
                file_path=str(file_path),
                file_size=file_size,
                num_pages=metadata["num_pages"],
                is_scanned=metadata["is_scanned"],
                chunks=chunks
            )

            saved_documents.append(doc_record)

        except Exception as e:
            if file_path.exists():
                file_path.unlink(missing_ok=True)
            errors.append(f"Error processing '{original_name}': {str(e)}")

    if not saved_documents and errors:
        return jsonify({"success": False, "error": "; ".join(errors)}), 400

    return jsonify({
        "success": True,
        "count": len(saved_documents),
        "documents": saved_documents,
        "warnings": errors if errors else None
    })

@app.route("/api/documents", methods=["GET"])
def get_documents():
    """Returns all uploaded documents."""
    docs = DocumentService.get_all_documents()
    return jsonify({"success": True, "documents": docs})

@app.route("/api/documents/<document_id>", methods=["GET"])
def get_document(document_id: str):
    """Returns single document details and chunk metadata."""
    doc = DocumentService.get_document(document_id)
    if not doc:
        return jsonify({"success": False, "error": "Document not found"}), 404
    return jsonify({"success": True, "document": doc})

@app.route("/api/documents/<document_id>/file", methods=["GET"])
def view_document_file(document_id: str):
    """Safely serves the PDF file for browser viewing."""
    doc = DocumentService.get_document(document_id)
    if not doc:
        return jsonify({"success": False, "error": "Document not found"}), 404
    return send_from_directory(
        directory=str(Config.UPLOAD_FOLDER),
        path=doc["filename"],
        as_attachment=False,
        mimetype="application/pdf"
    )

@app.route("/api/documents/<document_id>", methods=["DELETE"])
def delete_document(document_id: str):
    """Deletes document record and physical file."""
    deleted = DocumentService.delete_document(document_id)
    if not deleted:
        return jsonify({"success": False, "error": "Document not found or could not be deleted"}), 404
    return jsonify({"success": True, "message": "Document deleted successfully"})

@app.route("/api/documents/<document_id>/rename", methods=["POST"])
def rename_document(document_id: str):
    """Renames a document."""
    data = request.get_json() or {}
    new_name = (data.get("name") or "").strip()
    if not new_name:
        return jsonify({"success": False, "error": "New document name cannot be empty"}), 400
    success = DocumentService.rename_document(document_id, new_name)
    if not success:
        return jsonify({"success": False, "error": "Document not found or rename failed"}), 404
    doc = DocumentService.get_document(document_id)
    return jsonify({"success": True, "document": doc})

@app.route("/api/documents/<document_id>/notes", methods=["GET"])
def get_document_notes(document_id: str):
    """Returns saved notes for a document."""
    notes = DocumentService.get_notes(document_id)
    return jsonify({"success": True, "notes": notes})

@app.route("/api/documents/<document_id>/notes", methods=["POST"])
def save_document_notes(document_id: str):
    """Saves user notes for a document."""
    data = request.get_json() or {}
    notes = data.get("notes", "")
    DocumentService.save_notes(document_id, notes)
    return jsonify({"success": True, "message": "Notes saved successfully"})

# ==========================================
# AI Chat & RAG Retrieval APIs
# ==========================================

@app.route("/api/chat", methods=["POST"])
def chat_with_pdf():
    """
    RAG-powered chat endpoint.
    Retrieves top chunks from document and queries Gemini API.
    """
    data = request.get_json() or {}
    doc_id = data.get("document_id")
    message = (data.get("message") or "").strip()
    session_id = data.get("session_id") or "default_session"

    if not doc_id:
        return jsonify({"success": False, "error": "document_id is required"}), 400
    if not message:
        return jsonify({"success": False, "error": "message cannot be empty"}), 400

    doc = DocumentService.get_document(doc_id)
    if not doc:
        return jsonify({"success": False, "error": "Document not found"}), 404

    # Check scanned warning
    if doc.get("is_scanned"):
        warning_msg = (
            "⚠️ This document appears to be scanned or contains only images without readable text. "
            "Optical Character Recognition (OCR) is not supported in the initial version. "
            "Please upload a text-based digital PDF."
        )
        return jsonify({
            "success": True,
            "reply": warning_msg,
            "page_references": [],
            "session_id": session_id,
            "is_scanned": True
        })

    # Retrieve all chunks
    all_chunks = DocumentService.get_document_chunks(doc_id)
    if not all_chunks:
        return jsonify({
            "success": True,
            "reply": "No text content found in this document to answer your question.",
            "page_references": [],
            "session_id": session_id
        })

    # Find relevant chunks via text-based retrieval
    relevant_chunks = RetrievalService.retrieve_relevant_chunks(all_chunks, message, top_k=Config.TOP_K_CHUNKS)

    # Fetch prior chat history
    history = DocumentService.get_chat_history(doc_id, session_id)

    # Save user message
    DocumentService.save_chat_message(doc_id, session_id, role="user", content=message)

    try:
        reply_text, cited_pages = AIService.chat(
            document_name=doc["original_name"],
            query=message,
            relevant_chunks=relevant_chunks,
            history=history
        )

        # Save assistant message
        DocumentService.save_chat_message(
            doc_id, session_id,
            role="assistant",
            content=reply_text,
            page_references=cited_pages
        )

        return jsonify({
            "success": True,
            "reply": reply_text,
            "page_references": cited_pages,
            "session_id": session_id
        })

    except ValueError as ve:
        # API key not configured
        error_msg = str(ve)
        return jsonify({
            "success": False,
            "error": error_msg,
            "requires_api_key": True
        }), 400
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"AI Generation Error: {str(e)}"
        }), 500

@app.route("/api/chat/history/<document_id>/<session_id>", methods=["GET"])
def get_chat_history(document_id: str, session_id: str):
    """Returns conversation history for a given session."""
    messages = DocumentService.get_chat_history(document_id, session_id)
    return jsonify({"success": True, "messages": messages})

@app.route("/api/chat/clear", methods=["POST"])
def clear_chat():
    """Clears conversation history for a session."""
    data = request.get_json() or {}
    doc_id = data.get("document_id")
    session_id = data.get("session_id") or "default_session"

    if not doc_id:
        return jsonify({"success": False, "error": "document_id is required"}), 400

    DocumentService.clear_chat_history(doc_id, session_id)
    return jsonify({"success": True, "message": "Chat history cleared successfully"})

# ==========================================
# AI Tools & Feature Endpoints
# ==========================================

@app.route("/api/summary", methods=["POST"])
def generate_summary():
    """Generates document summary (short, detailed, or topics) with caching."""
    data = request.get_json() or {}
    doc_id = data.get("document_id")
    summary_type = data.get("type", "detailed")  # 'short', 'detailed', 'topics'

    if not doc_id:
        return jsonify({"success": False, "error": "document_id is required"}), 400

    doc = DocumentService.get_document(doc_id)
    if not doc:
        return jsonify({"success": False, "error": "Document not found"}), 404

    # Check cache
    cache_key = f"summary_{summary_type}"
    cached = DocumentService.get_analysis(doc_id, cache_key)
    if cached and not data.get("refresh"):
        return jsonify({"success": True, "summary": cached, "cached": True})

    chunks = DocumentService.get_document_chunks(doc_id)
    if not chunks:
        return jsonify({"success": False, "error": "Document contains no readable text."}), 400

    try:
        summary = AIService.generate_summary(doc["original_name"], chunks, summary_type)
        DocumentService.save_analysis(doc_id, cache_key, summary)
        return jsonify({"success": True, "summary": summary, "cached": False})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/key-points", methods=["POST"])
def extract_key_points():
    """Extracts high-level key points in bullet format."""
    data = request.get_json() or {}
    doc_id = data.get("document_id")

    if not doc_id:
        return jsonify({"success": False, "error": "document_id is required"}), 400

    doc = DocumentService.get_document(doc_id)
    if not doc:
        return jsonify({"success": False, "error": "Document not found"}), 404

    cached = DocumentService.get_analysis(doc_id, "key_points")
    if cached and not data.get("refresh"):
        return jsonify({"success": True, "key_points": cached, "cached": True})

    chunks = DocumentService.get_document_chunks(doc_id)
    if not chunks:
        return jsonify({"success": False, "error": "Document contains no readable text."}), 400

    try:
        key_points = AIService.extract_key_points(doc["original_name"], chunks)
        DocumentService.save_analysis(doc_id, "key_points", key_points)
        return jsonify({"success": True, "key_points": key_points, "cached": False})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/explain", methods=["POST"])
def explain_text():
    """Explains complex text in beginner-friendly language."""
    data = request.get_json() or {}
    doc_id = data.get("document_id")
    text = (data.get("text") or "").strip()

    if not text:
        return jsonify({"success": False, "error": "text is required"}), 400

    doc_name = "Selected Document"
    if doc_id:
        doc = DocumentService.get_document(doc_id)
        if doc:
            doc_name = doc["original_name"]

    try:
        explanation = AIService.explain_simply(doc_name, text)
        return jsonify({"success": True, "explanation": explanation})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/generate-questions", methods=["POST"])
def generate_questions():
    """Generates 10 practice questions and separate answers."""
    data = request.get_json() or {}
    doc_id = data.get("document_id")

    if not doc_id:
        return jsonify({"success": False, "error": "document_id is required"}), 400

    doc = DocumentService.get_document(doc_id)
    if not doc:
        return jsonify({"success": False, "error": "Document not found"}), 404

    cached = DocumentService.get_analysis(doc_id, "questions")
    if cached and not data.get("refresh"):
        return jsonify({"success": True, "questions": cached, "cached": True})

    chunks = DocumentService.get_document_chunks(doc_id)
    if not chunks:
        return jsonify({"success": False, "error": "Document contains no readable text."}), 400

    try:
        questions = AIService.generate_questions(doc["original_name"], chunks)
        DocumentService.save_analysis(doc_id, "questions", questions)
        return jsonify({"success": True, "questions": questions, "cached": False})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/extract-info", methods=["POST"])
def extract_info():
    """Extracts dates, names, definitions, and figures."""
    data = request.get_json() or {}
    doc_id = data.get("document_id")

    if not doc_id:
        return jsonify({"success": False, "error": "document_id is required"}), 400

    doc = DocumentService.get_document(doc_id)
    if not doc:
        return jsonify({"success": False, "error": "Document not found"}), 404

    cached = DocumentService.get_analysis(doc_id, "extracted_info")
    if cached and not data.get("refresh"):
        return jsonify({"success": True, "info": cached, "cached": True})

    chunks = DocumentService.get_document_chunks(doc_id)
    if not chunks:
        return jsonify({"success": False, "error": "Document contains no readable text."}), 400

    try:
        info = AIService.extract_information(doc["original_name"], chunks)
        DocumentService.save_analysis(doc_id, "extracted_info", info)
        return jsonify({"success": True, "info": info, "cached": False})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/stats", methods=["GET"])
def get_stats():
    """Returns dashboard statistics."""
    stats = DocumentService.get_system_stats()
    return jsonify({"success": True, "stats": stats})

# ==========================================
# Settings & Diagnostics APIs
# ==========================================

@app.route("/api/settings", methods=["GET"])
def get_settings():
    """Returns application configuration status without exposing sensitive secret keys."""
    return jsonify({
        "success": True,
        "is_configured": Config.is_gemini_configured(),
        "model": Config.GEMINI_MODEL,
        "max_upload_mb": Config.MAX_CONTENT_LENGTH // (1024 * 1024),
        "allowed_extensions": list(Config.ALLOWED_EXTENSIONS)
    })

@app.route("/api/settings", methods=["POST"])
def update_settings():
    """Updates settings in .env and runtime config."""
    data = request.get_json() or {}
    api_key = data.get("gemini_api_key")
    model = data.get("gemini_model")

    env_path = Config.BASE_DIR / ".env"

    if api_key is not None:
        api_key = api_key.strip()
        if api_key:
            Config.GEMINI_API_KEY = api_key
            try:
                set_key(str(env_path), "GEMINI_API_KEY", api_key)
            except Exception:
                pass

    if model:
        model = model.strip()
        Config.GEMINI_MODEL = model
        try:
            set_key(str(env_path), "GEMINI_MODEL", model)
        except Exception:
            pass

    return jsonify({
        "success": True,
        "message": "Settings updated successfully",
        "is_configured": Config.is_gemini_configured(),
        "model": Config.GEMINI_MODEL
    })

@app.route("/api/settings/test-api", methods=["POST"])
def test_api():
    """Tests Gemini API connectivity."""
    result = AIService.test_connection()
    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"
    print(f"Starting AI PDF Assistant on http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
