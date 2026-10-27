/**
 * DocuMind AI - PDF Reader Workspace Controller
 * PDF.js In-Canvas Rendering, Page Navigation, Zoom, 3-Panel Collapsibility,
 * Interactive Page-Citation Jumps, AI Chat, Summaries, Key Points, and Auto-Saving Notes.
 */

document.addEventListener("DOMContentLoaded", () => {
    if (typeof PDF_URL === "undefined" || !PDF_URL) return;

    // Elements
    const canvas = document.getElementById("pdfViewerCanvas");
    const ctx = canvas.getContext("2d");
    const viewportContainer = document.getElementById("pdfViewport");
    const currentPageInput = document.getElementById("currentPageInput");
    const totalPagesSpan = document.getElementById("totalPagesSpan");
    const zoomLevelText = document.getElementById("zoomLevelText");

    // Panels
    const panelNav = document.getElementById("panelNav");
    const panelAi = document.getElementById("panelAi");
    const btnToggleLeft = document.getElementById("btnToggleLeft");
    const btnCollapseLeft = document.getElementById("btnCollapseLeft");
    const btnToggleRight = document.getElementById("btnToggleRight");
    const readerWorkspace = document.getElementById("readerWorkspace");

    // Controls
    const btnPrevPage = document.getElementById("btnPrevPage");
    const btnNextPage = document.getElementById("btnNextPage");
    const btnZoomIn = document.getElementById("btnZoomIn");
    const btnZoomOut = document.getElementById("btnZoomOut");
    const btnFitWidth = document.getElementById("btnFitWidth");
    const btnFitPage = document.getElementById("btnFitPage");
    const btnFullscreen = document.getElementById("btnFullscreen");
    const btnPrintPdf = document.getElementById("btnPrintPdf");
    const readerDocSelect = document.getElementById("readerDocSelect");

    // State
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    let scale = 1.0;
    const minScale = 0.4;
    const maxScale = 3.0;

    // Load PDF via PDF.js
    pdfjsLib.getDocument(PDF_URL).promise.then(pdf => {
        pdfDoc = pdf;
        if (totalPagesSpan) totalPagesSpan.textContent = pdfDoc.numPages;
        if (currentPageInput) currentPageInput.max = pdfDoc.numPages;
        
        // Auto-fit to width on initial load
        fitToWidth();
    }).catch(err => {
        console.error("Error loading PDF:", err);
        showToast("Error loading PDF file: " + err.message, "error");
    });

    /**
     * Renders a specific page on canvas with high-DPI crispness.
     */
    function renderPage(num) {
        pageRendering = true;
        pdfDoc.getPage(num).then(page => {
            const viewport = page.getViewport({ scale: scale });
            const outputScale = window.devicePixelRatio || 1;

            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            canvas.style.width = Math.floor(viewport.width) + "px";
            canvas.style.height = Math.floor(viewport.height) + "px";

            const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

            const renderContext = {
                canvasContext: ctx,
                transform: transform,
                viewport: viewport
            };

            const renderTask = page.render(renderContext);

            renderTask.promise.then(() => {
                pageRendering = false;
                if (pageNumPending !== null) {
                    renderPage(pageNumPending);
                    pageNumPending = null;
                }
            });

            // Update Page Controls
            if (currentPageInput) currentPageInput.value = num;
            if (zoomLevelText) zoomLevelText.textContent = `${Math.round(scale * 100)}%`;

            // Highlight Thumbnail in Left Panel
            document.querySelectorAll(".page-thumb-item").forEach(item => {
                item.classList.toggle("active", parseInt(item.getAttribute("data-page")) === num);
            });

            const activeThumb = document.getElementById(`thumbPage${num}`);
            if (activeThumb) {
                activeThumb.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        });
    }

    function queueRenderPage(num) {
        if (pageRendering) {
            pageNumPending = num;
        } else {
            renderPage(num);
        }
    }

    // Public method to jump directly to any page (used by citations!)
    window.jumpToPage = function(num) {
        if (!pdfDoc) return;
        const targetPage = Math.max(1, Math.min(num, pdfDoc.numPages));
        pageNum = targetPage;
        queueRenderPage(pageNum);

        // Flash canvas slightly to orient the user
        canvas.style.transition = "transform 0.15s ease, box-shadow 0.15s ease";
        canvas.style.transform = "scale(1.01)";
        canvas.style.boxShadow = "0 0 0 3px #633DF0";
        setTimeout(() => {
            canvas.style.transform = "scale(1)";
            canvas.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.12)";
        }, 300);
    };

    // Navigation Listeners
    if (btnPrevPage) {
        btnPrevPage.addEventListener("click", () => {
            if (pageNum <= 1) return;
            pageNum--;
            queueRenderPage(pageNum);
        });
    }

    if (btnNextPage) {
        btnNextPage.addEventListener("click", () => {
            if (pageNum >= pdfDoc.numPages) return;
            pageNum++;
            queueRenderPage(pageNum);
        });
    }

    if (currentPageInput) {
        currentPageInput.addEventListener("change", (e) => {
            const val = parseInt(e.target.value);
            if (!isNaN(val)) jumpToPage(val);
        });
    }

    // Thumbnail Clicks
    document.querySelectorAll(".page-thumb-item").forEach(item => {
        item.addEventListener("click", () => {
            const p = parseInt(item.getAttribute("data-page"));
            if (p) {
                jumpToPage(p);
                if (window.innerWidth < 992) {
                    window.setMobileReaderView("viewer");
                }
            }
        });
    });

    // Zoom Controls
    if (btnZoomIn) {
        btnZoomIn.addEventListener("click", () => {
            if (scale >= maxScale) return;
            scale = Math.min(maxScale, scale + 0.15);
            queueRenderPage(pageNum);
        });
    }

    if (btnZoomOut) {
        btnZoomOut.addEventListener("click", () => {
            if (scale <= minScale) return;
            scale = Math.max(minScale, scale - 0.15);
            queueRenderPage(pageNum);
        });
    }

    function fitToWidth() {
        if (!pdfDoc) return;
        pdfDoc.getPage(pageNum).then(page => {
            const defaultViewport = page.getViewport({ scale: 1.0 });
            const containerWidth = viewportContainer.clientWidth - 48; // padding
            scale = Math.max(minScale, Math.min(maxScale, containerWidth / defaultViewport.width));
            queueRenderPage(pageNum);
        });
    }

    function fitToPage() {
        if (!pdfDoc) return;
        pdfDoc.getPage(pageNum).then(page => {
            const defaultViewport = page.getViewport({ scale: 1.0 });
            const containerHeight = viewportContainer.clientHeight - 48;
            scale = Math.max(minScale, Math.min(maxScale, containerHeight / defaultViewport.height));
            queueRenderPage(pageNum);
        });
    }

    if (btnFitWidth) btnFitWidth.addEventListener("click", fitToWidth);
    if (btnFitPage) btnFitPage.addEventListener("click", fitToPage);

    // Fullscreen Mode
    if (btnFullscreen) {
        btnFullscreen.addEventListener("click", () => {
            if (!document.fullscreenElement) {
                readerWorkspace.requestFullscreen().catch(err => console.log(err));
            } else {
                document.exitFullscreen();
            }
        });
    }

    // Print Document
    if (btnPrintPdf) {
        btnPrintPdf.addEventListener("click", () => {
            window.open(PDF_URL, "_blank").print();
        });
    }

    // Switch Document
    if (readerDocSelect) {
        readerDocSelect.addEventListener("change", (e) => {
            window.location.href = `/reader/${e.target.value}`;
        });
    }

    // Panel Toggle Buttons
    if (btnToggleLeft) {
        btnToggleLeft.addEventListener("click", () => {
            panelNav.classList.toggle("collapsed");
            setTimeout(fitToWidth, 220);
        });
    }
    if (btnCollapseLeft) {
        btnCollapseLeft.addEventListener("click", () => {
            panelNav.classList.add("collapsed");
            setTimeout(fitToWidth, 220);
        });
    }
    if (btnToggleRight) {
        btnToggleRight.addEventListener("click", () => {
            panelAi.classList.toggle("collapsed");
            setTimeout(fitToWidth, 220);
        });
    }

    // Mobile View Switching (< 992px)
    const mobileTabBtns = document.querySelectorAll(".reader-mobile-tab-btn");
    window.setMobileReaderView = function(viewName) {
        if (window.innerWidth >= 992) return;
        mobileTabBtns.forEach(b => {
            b.classList.toggle("active", b.getAttribute("data-view") === viewName);
        });

        if (panelNav) panelNav.classList.toggle("mobile-active", viewName === "pages");
        if (panelViewer) panelViewer.classList.toggle("mobile-active", viewName === "viewer");
        if (panelAi) panelAi.classList.toggle("mobile-active", viewName === "ai");

        if (viewName === "viewer") {
            setTimeout(fitToWidth, 120);
        }
    };

    mobileTabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const view = btn.getAttribute("data-view");
            window.setMobileReaderView(view);
        });
    });

    // ==========================================
    // AI Assistant Tabs Management
    // ==========================================
    const tabBtns = document.querySelectorAll(".ai-tab-btn");
    const tabContents = {
        "chat": document.getElementById("tabContentChat"),
        "summary": document.getElementById("tabContentSummary"),
        "key-points": document.getElementById("tabContentKeyPoints"),
        "notes": document.getElementById("tabContentNotes")
    };

    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.getAttribute("data-tab");
            tabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            Object.keys(tabContents).forEach(k => {
                if (tabContents[k]) {
                    tabContents[k].classList.toggle("d-none", k !== target);
                }
            });
        });
    });

    // ==========================================
    // Tab 1: AI Chat & Interactive Citations
    // ==========================================
    const readerChatStream = document.getElementById("readerChatStream");
    const readerChatForm = document.getElementById("readerChatForm");
    const readerChatInput = document.getElementById("readerChatInput");
    const readerSendBtn = document.getElementById("readerSendBtn");

    const readerSessionId = `reader_sess_${ACTIVE_DOC_ID}`;

    // Prompt Buttons
    document.querySelectorAll(".reader-prompt-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            readerChatInput.value = btn.innerText.trim();
            readerChatInput.focus();
            readerChatForm.dispatchEvent(new Event("submit"));
        });
    });

    // Send Chat
    if (readerChatForm) {
        readerChatForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const message = readerChatInput.value.trim();
            if (!message) return;

            appendReaderMessage("user", message, []);
            readerChatInput.value = "";
            readerSendBtn.disabled = true;

            try {
                const res = await fetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        document_id: ACTIVE_DOC_ID,
                        message: message,
                        session_id: readerSessionId
                    })
                });

                const data = await res.json();
                if (data.success) {
                    appendReaderMessage("assistant", data.reply, data.page_references || []);
                } else {
                    appendReaderMessage("assistant", `⚠️ ${data.error || "Unable to process question."}`, []);
                }
            } catch (err) {
                appendReaderMessage("assistant", `⚠️ Network error: ${err.message}`, []);
            } finally {
                readerSendBtn.disabled = false;
            }
        });
    }

    function appendReaderMessage(role, content, pageReferences) {
        const row = document.createElement("div");
        row.className = `msg-row ${role}`;

        let formattedText = content;
        if (role === "assistant" && window.marked) {
            formattedText = marked.parse(content);
        } else if (role === "user") {
            const d = document.createElement("div");
            d.textContent = content;
            formattedText = d.innerHTML.replace(/\n/g, "<br>");
        }

        // Citations HTML
        let citationsHtml = "";
        if (role === "assistant" && pageReferences && pageReferences.length > 0) {
            const chips = pageReferences.map(p => `
                <span class="citation-chip" data-page="${p}" title="Click to jump to Page ${p}">
                    <i data-lucide="file-text" style="width: 12px; height: 12px;"></i> Page ${p}
                </span>
            `).join("");

            citationsHtml = `
                <div class="mt-2 pt-1 border-top border-light d-flex flex-wrap align-items-center">
                    <span class="extra-small text-muted me-1">Jump to:</span>
                    ${chips}
                </div>
            `;
        }

        row.innerHTML = `
            <div class="msg-bubble ${role}">
                <div class="markdown-body small">${formattedText}</div>
                ${citationsHtml}
            </div>
        `;

        readerChatStream.appendChild(row);
        readerChatStream.scrollTop = readerChatStream.scrollHeight;

        if (window.lucide) lucide.createIcons();
    }

    // Global listener for clicking Citation Chips!
    document.addEventListener("click", (e) => {
        const chip = e.target.closest(".citation-chip");
        if (chip) {
            const p = parseInt(chip.getAttribute("data-page"));
            if (p) {
                jumpToPage(p);
                if (window.innerWidth < 992) {
                    window.setMobileReaderView("viewer");
                }
                showToast(`Navigated to Page ${p} in document`, "info");
            }
        }
    });

    // ==========================================
    // Tab 2: Document Summary
    // ==========================================
    const btnGenReaderSummary = document.getElementById("btnGenReaderSummary");
    const readerSummaryType = document.getElementById("readerSummaryType");
    const readerSummaryLoading = document.getElementById("readerSummaryLoading");
    const readerSummaryContainer = document.getElementById("readerSummaryContainer");
    const readerSummaryContent = document.getElementById("readerSummaryContent");
    const btnCopySummary = document.getElementById("btnCopySummary");

    if (btnGenReaderSummary) {
        btnGenReaderSummary.addEventListener("click", async () => {
            btnGenReaderSummary.disabled = true;
            readerSummaryLoading.classList.remove("d-none");
            readerSummaryContainer.style.display = "none";

            try {
                const res = await fetch("/api/summary", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        document_id: ACTIVE_DOC_ID,
                        type: readerSummaryType.value
                    })
                });

                const data = await res.json();
                if (data.success && data.summary) {
                    readerSummaryContent.innerHTML = marked.parse(data.summary);
                    readerSummaryContainer.style.display = "block";
                } else {
                    showToast(data.error || "Failed to generate summary", "error");
                }
            } catch (err) {
                showToast("Network error: " + err.message, "error");
            } finally {
                btnGenReaderSummary.disabled = false;
                readerSummaryLoading.classList.add("d-none");
            }
        });
    }

    if (btnCopySummary) {
        btnCopySummary.addEventListener("click", () => {
            navigator.clipboard.writeText(readerSummaryContent.innerText).then(() => {
                showToast("Summary copied!", "success");
            });
        });
    }

    // ==========================================
    // Tab 3: Key Points
    // ==========================================
    const btnGenReaderKeyPoints = document.getElementById("btnGenReaderKeyPoints");
    const readerKeyPointsLoading = document.getElementById("readerKeyPointsLoading");
    const readerKeyPointsContainer = document.getElementById("readerKeyPointsContainer");
    const readerKeyPointsContent = document.getElementById("readerKeyPointsContent");
    const btnCopyKeyPoints = document.getElementById("btnCopyKeyPoints");

    if (btnGenReaderKeyPoints) {
        btnGenReaderKeyPoints.addEventListener("click", async () => {
            btnGenReaderKeyPoints.disabled = true;
            readerKeyPointsLoading.classList.remove("d-none");
            readerKeyPointsContainer.style.display = "none";

            try {
                const res = await fetch("/api/key-points", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ document_id: ACTIVE_DOC_ID })
                });

                const data = await res.json();
                if (data.success && data.key_points) {
                    readerKeyPointsContent.innerHTML = marked.parse(data.key_points);
                    readerKeyPointsContainer.style.display = "block";
                } else {
                    showToast(data.error || "Failed to extract key points", "error");
                }
            } catch (err) {
                showToast("Network error: " + err.message, "error");
            } finally {
                btnGenReaderKeyPoints.disabled = false;
                readerKeyPointsLoading.classList.add("d-none");
            }
        });
    }

    if (btnCopyKeyPoints) {
        btnCopyKeyPoints.addEventListener("click", () => {
            navigator.clipboard.writeText(readerKeyPointsContent.innerText).then(() => {
                showToast("Key points copied!", "success");
            });
        });
    }

    // ==========================================
    // Tab 4: Document Notes Auto-Saving
    // ==========================================
    const readerNotesTextarea = document.getElementById("readerNotesTextarea");
    const notesStatusText = document.getElementById("notesStatusText");
    const btnCopyNotes = document.getElementById("btnCopyNotes");
    let notesSaveTimeout = null;

    if (readerNotesTextarea) {
        readerNotesTextarea.addEventListener("input", () => {
            if (notesStatusText) notesStatusText.textContent = "Saving...";
            clearTimeout(notesSaveTimeout);
            notesSaveTimeout = setTimeout(async () => {
                const notes = readerNotesTextarea.value;
                try {
                    await fetch(`/api/documents/${ACTIVE_DOC_ID}/notes`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ notes: notes })
                    });
                    if (notesStatusText) notesStatusText.textContent = "Saved";
                } catch (e) {
                    if (notesStatusText) notesStatusText.textContent = "Save error";
                }
            }, 800);
        });
    }

    if (btnCopyNotes) {
        btnCopyNotes.addEventListener("click", () => {
            navigator.clipboard.writeText(readerNotesTextarea.value).then(() => {
                showToast("Notes copied to clipboard!", "success");
            });
        });
    }

    // Initialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
});
