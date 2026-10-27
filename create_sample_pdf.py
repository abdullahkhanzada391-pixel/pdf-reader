from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle

def build_sample_pdf():
    output_dir = Path(__file__).resolve().parent / "uploads"
    output_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = output_dir / "sample_ai_overview.pdf"

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=letter,
        rightMargin=54, leftMargin=54,
        topMargin=54, bottomMargin=54
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#1e1b4b'),
        spaceAfter=12
    )
    h2_style = ParagraphStyle(
        'DocH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=colors.HexColor('#4338ca'),
        spaceBefore=14,
        spaceAfter=6
    )
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#334155'),
        spaceAfter=8
    )

    story = []

    # PAGE 1: Introduction & History
    story.append(Paragraph("Artificial Intelligence & Autonomous Systems: A Comprehensive Overview", title_style))
    story.append(Paragraph("<b>Author:</b> Dr. Eleanor Vance, Stanford Institute for Human-Centered AI<br/><b>Date:</b> October 15, 2025<br/><b>Version:</b> 2.4", body_style))
    story.append(Spacer(1, 10))

    story.append(Paragraph("1. Executive Summary & Foundational Origins", h2_style))
    story.append(Paragraph(
        "Artificial Intelligence (AI) represents the simulation of human intelligence processes by computer systems. "
        "The discipline was formally established in <b>1956</b> during the historic Dartmouth Summer Research Project on Artificial Intelligence, "
        "organized by John McCarthy, Marvin Minsky, Nathaniel Rochester, and Claude Shannon. "
        "Since then, artificial intelligence has evolved across three major paradigms: symbolic logic (1950s-1980s), statistical machine learning (1990s-2010s), "
        "and deep connectionist foundation models (2017-present).", body_style
    ))
    story.append(Paragraph(
        "In modern computational theory, AI systems are classified into Artificial Narrow Intelligence (ANI), which specializes in a specific discrete domain, "
        "and hypothetical Artificial General Intelligence (AGI), which possesses broad, flexible cognitive capabilities matching or surpassing human capabilities. "
        "As of 2025, all production implementations are classified strictly under ANI.", body_style
    ))

    story.append(Paragraph("Key Milestones Timeline:", h2_style))
    story.append(Paragraph("• <b>1956:</b> Dartmouth Conference coins the term 'Artificial Intelligence'.", body_style))
    story.append(Paragraph("• <b>1997:</b> IBM Deep Blue defeats world chess champion Garry Kasparov.", body_style))
    story.append(Paragraph("• <b>2012:</b> AlexNet achieves landmark computer vision victory at ImageNet with an error rate of 15.3%.", body_style))
    story.append(Paragraph("• <b>June 2017:</b> Vaswani et al. publish 'Attention Is All You Need', introducing the Transformer architecture.", body_style))
    story.append(Paragraph("• <b>2023-2025:</b> Multimodal reasoning models integrate vision, code, text, and voice processing simultaneously.", body_style))

    story.append(PageBreak())

    # PAGE 2: Transformer Architecture & Retrieval-Augmented Generation (RAG)
    story.append(Paragraph("2. Architectural Foundations & Retrieval-Augmented Generation", h2_style))
    story.append(Paragraph(
        "The primary driving force behind modern Large Language Models (LLMs) is the Transformer architecture, which replaces sequential recurrent neural networks "
        "with multi-head self-attention mechanisms. Self-attention enables models to compute pairwise importance scores between all tokens in a sequence concurrently, "
        "enabling massive horizontal parallelization across modern GPU clusters.", body_style
    ))
    story.append(Paragraph(
        "Despite their impressive linguistic capabilities, standalone LLMs suffer from two major limitations: hallucinations (plausibly stated falsehoods) and "
        "knowledge obsolescence (inability to access proprietary or freshly generated data after training cutoff dates). "
        "To mitigate these challenges, engineers developed <b>Retrieval-Augmented Generation (RAG)</b>.", body_style
    ))
    story.append(Paragraph(
        "In a RAG pipeline, input documents are parsed, chunked into semantically coherent segments (typically 500 to 1,500 characters), "
        "and indexed. When a user submits an inquiry, an information retrieval module identifies the top-k most relevant text chunks and inserts them "
        "into the LLM's prompt as grounded context. Studies show that RAG architectures reduce hallucination rates by <b>87.4%</b> compared to zero-shot models.", body_style
    ))

    story.append(Paragraph("Performance Metrics & Benchmark Comparisons:", h2_style))
    table_data = [
        ["Model Architecture", "Benchmark Accuracy", "Hallucination Rate", "Inference Latency"],
        ["Zero-Shot Base LLM", "71.2%", "14.8%", "180 ms"],
        ["Fine-Tuned LLM", "82.5%", "9.1%", "210 ms"],
        ["RAG-Enhanced Gemini", "94.6%", "1.4%", "165 ms"],
        ["Hybrid Agentic RAG", "98.4%", "0.6%", "320 ms"]
    ]
    t = Table(table_data, colWidths=[140, 110, 110, 110])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#4f46e5')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 9),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#f8fafc')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    story.append(PageBreak())

    # PAGE 3: Economic Impact & Safety Guidelines
    story.append(Paragraph("3. Economic Projections & Governance Frameworks", h2_style))
    story.append(Paragraph(
        "The global market impact of generative AI is projected to reach <b>$1.3 trillion by 2032</b>, expanding at a compound annual growth rate (CAGR) of 42%. "
        "Key sectors adopting AI include healthcare (diagnostic imaging and drug discovery), financial services (algorithmic risk assessment and automated fraud detection), "
        "and enterprise software development (automated code generation and vulnerability analysis).", body_style
    ))
    story.append(Paragraph(
        "With widespread deployment comes the imperative for rigorous governance. Key ethical considerations include:\n"
        "1. <b>Algorithmic Bias:</b> Training datasets must be balanced across demographic, geographic, and socioeconomic domains.\n"
        "2. <b>Data Privacy:</b> Personally Identifiable Information (PII) must be sanitized and protected under GDPR, HIPAA, and CCPA standards.\n"
        "3. <b>Attribution & Provenance:</b> AI systems must explicitly cite sources and provenance for verified accountability.\n"
        "4. <b>Human-in-the-Loop:</b> Critical decisions in medicine, criminal justice, and high-consequence infrastructure must remain under human oversight.", body_style
    ))
    story.append(Paragraph(
        "<b>Conclusion:</b> The fusion of high-parameter language models with robust retrieval systems delivers unprecedented productivity gains "
        "while preserving factual veracity and intellectual integrity.", body_style
    ))

    doc.build(story)
    print(f"Sample PDF successfully created at: {pdf_path}")

if __name__ == "__main__":
    build_sample_pdf()
