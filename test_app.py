import unittest
import io
import json
from pathlib import Path

from config import Config
from services.document_service import DocumentService, init_db
from services.pdf_service import PDFService
from services.retrieval_service import RetrievalService
from app import app

class TestAIPDFAssistant(unittest.TestCase):
    """Integration and Unit Tests for AI PDF Assistant."""

    @classmethod
    def setUpClass(cls):
        Config.init_folders()
        init_db()
        cls.client = app.test_client()
        cls.sample_pdf_path = Config.UPLOAD_FOLDER / "sample_ai_overview.pdf"

    def test_01_pdf_extraction(self):
        """Test PDF text extraction and metadata."""
        self.assertTrue(self.sample_pdf_path.exists(), "Sample PDF must exist")
        pages_data, metadata = PDFService.extract_text_and_metadata(self.sample_pdf_path)

        self.assertEqual(metadata["num_pages"], 3)
        self.assertFalse(metadata["is_scanned"], "Should not be marked as scanned")
        self.assertGreater(metadata["total_chars"], 500)
        self.assertEqual(len(pages_data), 3)

        # Check content on Page 1
        page1_text = pages_data[0]["text"]
        self.assertIn("Dartmouth", page1_text)
        self.assertIn("1956", page1_text)

        # Check chunking
        chunks = PDFService.chunk_pages(pages_data, chunk_size=800, overlap=100)
        self.assertGreater(len(chunks), 0)
        for ch in chunks:
            self.assertIn("page_number", ch)
            self.assertIn("chunk_index", ch)
            self.assertIn("text", ch)

    def test_02_retrieval_ranking(self):
        """Test keyword-based RAG retrieval."""
        pages_data, _ = PDFService.extract_text_and_metadata(self.sample_pdf_path)
        chunks = PDFService.chunk_pages(pages_data)

        # Query about Dartmouth
        results = RetrievalService.retrieve_relevant_chunks(chunks, "When was Dartmouth conference and who organized it?", top_k=3)
        self.assertGreater(len(results), 0)
        top_text = results[0]["text"]
        self.assertIn("Dartmouth", top_text)
        self.assertEqual(results[0]["page_number"], 1)

        # Query about Transformers
        results2 = RetrievalService.retrieve_relevant_chunks(chunks, "Transformer self-attention mechanism Vaswani", top_k=3)
        self.assertGreater(len(results2), 0)
        top_text2 = results2[0]["text"]
        self.assertIn("Transformer", top_text2)
        self.assertEqual(results2[0]["page_number"], 2)

    def test_03_frontend_pages_render(self):
        """Test all frontend routes return 200 OK."""
        routes = ["/", "/documents", "/chat", "/reader", "/settings"]
        for route in routes:
            response = self.client.get(route)
            self.assertEqual(response.status_code, 200, f"Route {route} failed")
            self.assertIn(b"DocuMind AI", response.data)

    def test_04_api_upload_flow(self):
        """Test upload endpoint with a valid PDF."""
        with open(self.sample_pdf_path, "rb") as f:
            pdf_bytes = f.read()

        data = {
            "files": (io.BytesIO(pdf_bytes), "ai_paper_test.pdf")
        }

        response = self.client.post("/api/upload", data=data, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 200)
        res_json = json.loads(response.data)
        self.assertTrue(res_json["success"])
        self.assertEqual(res_json["count"], 1)
        doc = res_json["documents"][0]
        self.assertEqual(doc["original_name"], "ai_paper_test.pdf")
        self.assertEqual(doc["num_pages"], 3)
        self.assertGreater(doc["total_chunks"], 0)

        # Verify document is in document list
        list_res = self.client.get("/api/documents")
        self.assertEqual(list_res.status_code, 200)
        docs = json.loads(list_res.data)["documents"]
        doc_ids = [d["id"] for d in docs]
        self.assertIn(doc["id"], doc_ids)

        # Verify reader page for this document
        reader_res = self.client.get(f"/reader/{doc['id']}")
        self.assertEqual(reader_res.status_code, 200)
        self.assertIn(b"ai_paper_test.pdf", reader_res.data)

        # Verify rename endpoint
        rename_res = self.client.post(f"/api/documents/{doc['id']}/rename", json={"name": "renamed_paper.pdf"})
        self.assertEqual(rename_res.status_code, 200)
        self.assertEqual(json.loads(rename_res.data)["document"]["original_name"], "renamed_paper.pdf")

        # Verify notes endpoint
        notes_post_res = self.client.post(f"/api/documents/{doc['id']}/notes", json={"notes": "Key note about Dartmouth conference"})
        self.assertEqual(notes_post_res.status_code, 200)
        notes_get_res = self.client.get(f"/api/documents/{doc['id']}/notes")
        self.assertEqual(notes_get_res.status_code, 200)
        self.assertEqual(json.loads(notes_get_res.data)["notes"], "Key note about Dartmouth conference")

        # Verify safe file viewing
        file_res = self.client.get(f"/api/documents/{doc['id']}/file")
        self.assertEqual(file_res.status_code, 200)
        self.assertEqual(file_res.content_type, "application/pdf")

    def test_05_api_settings_and_stats(self):
        """Test settings and system stats endpoints."""
        stats_res = self.client.get("/api/stats")
        self.assertEqual(stats_res.status_code, 200)
        stats = json.loads(stats_res.data)["stats"]
        self.assertGreaterEqual(stats["total_documents"], 1)

        settings_res = self.client.get("/api/settings")
        self.assertEqual(settings_res.status_code, 200)
        settings = json.loads(settings_res.data)
        self.assertIn("is_configured", settings)
        self.assertIn("model", settings)

if __name__ == "__main__":
    unittest.main()
