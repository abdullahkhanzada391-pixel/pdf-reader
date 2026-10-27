/**
 * DocuMind AI - Global Minimal App JavaScript
 * Utilities, Toasts, Rename Modal, AI Quick Tools, and Sidebar
 */

// Global Toast System
window.showToast = function(message, type = "info") {
    const toastEl = document.getElementById("appToast");
    const toastMsg = document.getElementById("toastMessage");
    const toastIcon = document.getElementById("toastIcon");

    if (!toastEl || !toastMsg) {
        alert(message);
        return;
    }

    toastMsg.textContent = message;

    // Toast classes
    toastEl.className = "toast align-items-center border-0 shadow-lg rounded-3";
    if (type === "success") {
        toastEl.classList.add("bg-success-subtle", "text-success-emphasis");
        toastIcon.innerHTML = '<i data-lucide="check-circle" style="width: 16px; height: 16px; color: #10B981;"></i>';
    } else if (type === "error" || type === "danger") {
        toastEl.classList.add("bg-danger-subtle", "text-danger-emphasis");
        toastIcon.innerHTML = '<i data-lucide="alert-circle" style="width: 16px; height: 16px; color: #EF4444;"></i>';
    } else {
        toastEl.classList.add("bg-primary-subtle", "text-primary");
        toastIcon.innerHTML = '<i data-lucide="info" style="width: 16px; height: 16px; color: var(--primary);"></i>';
    }

    if (window.lucide) lucide.createIcons();

    const toast = new bootstrap.Toast(toastEl, { delay: 3500 });
    toast.show();
};

document.addEventListener("DOMContentLoaded", () => {
    // 1. Mobile Navbar Drawer Toggle
    const navbarMobileToggle = document.getElementById("navbarMobileToggle");
    const navbarMobileDrawer = document.getElementById("navbarMobileDrawer");

    if (navbarMobileToggle && navbarMobileDrawer) {
        navbarMobileToggle.addEventListener("click", () => {
            navbarMobileDrawer.classList.toggle("show");
        });

        // Close when clicking any nav link or action inside
        navbarMobileDrawer.querySelectorAll("a, button").forEach(item => {
            item.addEventListener("click", () => {
                navbarMobileDrawer.classList.remove("show");
            });
        });

        document.addEventListener("click", (e) => {
            if (window.innerWidth < 992 && !navbarMobileDrawer.contains(e.target) && !navbarMobileToggle.contains(e.target)) {
                navbarMobileDrawer.classList.remove("show");
            }
        });
    }

    // 2. Rename Document Modal & Action
    const renameModalEl = document.getElementById("renameModal");
    let renameModal = null;
    if (renameModalEl) {
        renameModal = new bootstrap.Modal(renameModalEl);
    }

    const renameDocId = document.getElementById("renameDocId");
    const renameDocNameInput = document.getElementById("renameDocNameInput");
    const btnConfirmRename = document.getElementById("btnConfirmRename");

    document.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn-trigger-rename");
        if (btn && renameModal) {
            e.preventDefault();
            const docId = btn.getAttribute("data-doc-id");
            const docName = btn.getAttribute("data-doc-name") || "";
            if (renameDocId) renameDocId.value = docId;
            if (renameDocNameInput) renameDocNameInput.value = docName;
            renameModal.show();
            setTimeout(() => renameDocNameInput.focus(), 250);
        }
    });

    if (btnConfirmRename && renameModal) {
        btnConfirmRename.addEventListener("click", async () => {
            const docId = renameDocId.value;
            const newName = renameDocNameInput.value.trim();
            if (!newName) {
                showToast("Please enter a valid document name", "warning");
                return;
            }

            btnConfirmRename.disabled = true;
            try {
                const res = await fetch(`/api/documents/${docId}/rename`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: newName })
                });

                const data = await res.json();
                if (data.success) {
                    showToast("Document renamed successfully", "success");
                    renameModal.hide();
                    setTimeout(() => window.location.reload(), 600);
                } else {
                    showToast(data.error || "Failed to rename document", "error");
                }
            } catch (err) {
                showToast("Network error: " + err.message, "error");
            } finally {
                btnConfirmRename.disabled = false;
            }
        });
    }

    // 3. Document Delete Action Handler
    document.addEventListener("click", async (e) => {
        const deleteBtn = e.target.closest(".btn-delete-doc");
        if (!deleteBtn) return;

        const docId = deleteBtn.getAttribute("data-doc-id");
        const docName = deleteBtn.getAttribute("data-doc-name") || "this document";

        if (!confirm(`Are you sure you want to delete "${docName}"?`)) {
            return;
        }

        try {
            deleteBtn.disabled = true;
            const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
            const data = await res.json();

            if (data.success) {
                showToast(`Deleted "${docName}"`, "success");
                setTimeout(() => window.location.reload(), 600);
            } else {
                showToast(data.error || "Failed to delete document", "error");
                deleteBtn.disabled = false;
            }
        } catch (err) {
            showToast("Network error: " + err.message, "error");
            deleteBtn.disabled = false;
        }
    });

    // 4. Quick AI Tools Modal Controller
    const aiToolsModalEl = document.getElementById("aiToolsModal");
    let aiToolsModal = null;
    if (aiToolsModalEl) {
        aiToolsModal = new bootstrap.Modal(aiToolsModalEl);
    }

    const toolTitle = document.getElementById("aiToolsModalLabel");
    const toolSubtitle = document.getElementById("toolModalSubtitle");
    const toolDocSelect = document.getElementById("toolDocSelect");
    const toolExtraControls = document.getElementById("toolExtraControls");
    const btnExecuteTool = document.getElementById("btnExecuteTool");
    const toolLoading = document.getElementById("toolLoading");
    const toolResultContainer = document.getElementById("toolResultContainer");
    const toolResultContent = document.getElementById("toolResultContent");
    const btnCopyToolResult = document.getElementById("btnCopyToolResult");

    let currentTool = "summary";

    async function loadDocumentsForModal() {
        if (!toolDocSelect) return;
        try {
            const res = await fetch("/api/documents");
            const data = await res.json();
            if (data.success && data.documents) {
                toolDocSelect.innerHTML = "";
                if (data.documents.length === 0) {
                    toolDocSelect.innerHTML = '<option value="" disabled selected>No documents available</option>';
                    return;
                }
                data.documents.forEach(d => {
                    const opt = document.createElement("option");
                    opt.value = d.id;
                    opt.textContent = `${d.original_name} (${d.num_pages} pgs)`;
                    toolDocSelect.appendChild(opt);
                });
            }
        } catch (e) {
            console.error("Failed to load documents", e);
        }
    }

    document.addEventListener("click", (e) => {
        const toolBtn = e.target.closest(".btn-quick-tool");
        if (toolBtn && aiToolsModal) {
            e.preventDefault();
            const tool = toolBtn.getAttribute("data-tool") || "summary";
            currentTool = tool;

            toolResultContainer.style.display = "none";
            toolResultContent.innerHTML = "";
            btnCopyToolResult.style.display = "none";
            toolLoading.classList.add("d-none");
            toolExtraControls.innerHTML = "";

            loadDocumentsForModal();

            if (tool === "summary") {
                toolTitle.textContent = "AI Document Summarizer";
                toolSubtitle.textContent = "Executive overview, detailed summary, or topics";
                toolExtraControls.innerHTML = `
                    <div class="w-100">
                        <label class="form-label small fw-semibold text-secondary">Summary Type</label>
                        <select class="form-select form-select-sm" id="modalSummaryType">
                            <option value="detailed" selected>Detailed Summary</option>
                            <option value="short">Short Executive</option>
                            <option value="topics">Key Topics</option>
                        </select>
                    </div>
                `;
            } else if (tool === "key-points") {
                toolTitle.textContent = "Key Points Extraction";
                toolSubtitle.textContent = "Extract essential takeaways in structured bullets";
            }

            aiToolsModal.show();
            if (window.lucide) lucide.createIcons();
        }
    });

    if (btnExecuteTool) {
        btnExecuteTool.addEventListener("click", async () => {
            const docId = toolDocSelect.value;
            if (!docId) {
                showToast("Please select a document", "warning");
                return;
            }

            btnExecuteTool.disabled = true;
            toolLoading.classList.remove("d-none");
            toolResultContainer.style.display = "none";
            btnCopyToolResult.style.display = "none";

            try {
                let endpoint = currentTool === "summary" ? "/api/summary" : "/api/key-points";
                let payload = { document_id: docId };

                if (currentTool === "summary") {
                    const sumType = document.getElementById("modalSummaryType");
                    payload.type = sumType ? sumType.value : "detailed";
                }

                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (data.success) {
                    const content = data.summary || data.key_points || "";
                    toolResultContent.innerHTML = marked.parse(content);
                    toolResultContainer.style.display = "block";
                    btnCopyToolResult.style.display = "inline-flex";
                } else {
                    showToast(data.error || "Analysis failed", "error");
                }
            } catch (err) {
                showToast("Network error: " + err.message, "error");
            } finally {
                btnExecuteTool.disabled = false;
                toolLoading.classList.add("d-none");
                if (window.lucide) lucide.createIcons();
            }
        });
    }

    if (btnCopyToolResult) {
        btnCopyToolResult.addEventListener("click", () => {
            navigator.clipboard.writeText(toolResultContent.innerText).then(() => {
                showToast("Copied to clipboard!", "success");
            });
        });
    }

    if (window.lucide) {
        lucide.createIcons();
    }
});
