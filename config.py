import os
import shutil
import tempfile
from pathlib import Path
from dotenv import load_dotenv

# Base Directory
BASE_DIR = Path(__file__).resolve().parent

# Load .env file
load_dotenv(BASE_DIR / ".env")

# Detect Vercel / AWS Lambda serverless execution environment
IS_VERCEL = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))

class Config:
    """Application configuration settings."""
    
    BASE_DIR = BASE_DIR
    SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret-key-ai-pdf-assistant-2026")
    
    # Gemini AI configuration
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip()
    
    # Storage paths: on Vercel / serverless, only /tmp is writable
    if IS_VERCEL:
        _tmp_root = Path(tempfile.gettempdir())
        UPLOAD_FOLDER = _tmp_root / "uploads"
        DATABASE_PATH = _tmp_root / "database" / "app.db"
    else:
        UPLOAD_FOLDER = BASE_DIR / "uploads"
        DATABASE_PATH = BASE_DIR / "database" / "app.db"
    
    # Upload limits (Default: 32 MB)
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 32 * 1024 * 1024))
    ALLOWED_EXTENSIONS = {"pdf"}
    
    # Text chunking defaults for RAG
    CHUNK_SIZE = 1000  # characters per chunk
    CHUNK_OVERLAP = 150  # characters overlap
    
    # Retrieval defaults
    TOP_K_CHUNKS = 5

    @classmethod
    def init_folders(cls):
        """Ensure required application directories exist and seed database on Vercel."""
        try:
            cls.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass

        try:
            cls.DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass

        # If on Vercel and the database does not exist in /tmp yet,
        # copy the seed database from repository if available
        if IS_VERCEL and not cls.DATABASE_PATH.exists():
            repo_db = cls.BASE_DIR / "database" / "app.db"
            if repo_db.exists():
                try:
                    shutil.copy2(str(repo_db), str(cls.DATABASE_PATH))
                except Exception as e:
                    print(f"Warning: Failed to copy seed database to /tmp: {e}")

    @classmethod
    def is_gemini_configured(cls) -> bool:
        """Check if Gemini API key is configured."""
        return bool(cls.GEMINI_API_KEY and cls.GEMINI_API_KEY != "your_gemini_api_key_here")

