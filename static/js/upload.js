/**
 * DocuMind AI - Minimal PDF Upload Controller
 * Drag & Drop, File Validation, Progress Indicator, and Batch Ingestion
 */

document.addEventListener("DOMContentLoaded", () => {
    // 1. Global Upload Modal Logic
    const modalDropzone = document.getElementById("modalDropzone");
    const modalFileInput = document.getElementById("modalFileInput");
    const modalBrowseBtn = document.getElementById("modalBrowseBtn");
    const modalFilesList = document.getElementById("modalFilesList");
    const modalFilesContainer = document.getElementById("modalFilesContainer");
    const modalUploadProgress = document.getElementById("modalUploadProgress");
    const modalProgressBar = document.getElementById("modalProgressBar");
    const modalProgressPercent = document.getElementById("modalProgressPercent");
    const modalStartUploadBtn = document.getElementById("modalStartUploadBtn");

    let modalSelectedFiles = [];

    if (modalBrowseBtn && modalFileInput) {
        modalBrowseBtn.addEventListener("click", () => modalFileInput.click());
    }

    if (modalFileInput) {
        modalFileInput.addEventListener("change", (e) => {
            handleModalFiles(e.target.files);
        });
    }

    if (modalDropzone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            modalDropzone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            modalDropzone.addEventListener(eventName, () => modalDropzone.classList.add("dragover"), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            modalDropzone.addEventListener(eventName, () => modalDropzone.classList.remove("dragover"), false);
        });

        modalDropzone.addEventListener("drop", (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            handleModalFiles(files);
        });
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function formatBytes(bytes) {
        if (!bytes) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }

    function handleModalFiles(files) {
        const validPdfs = [];
        for (const file of files) {
            if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
                showToast(`"${file.name}" is not a PDF file.`, "warning");
                continue;
            }
            if (file.size > 32 * 1024 * 1024) {
                showToast(`"${file.name}" exceeds the 32MB limit.`, "warning");
                continue;
            }
            validPdfs.push(file);
        }

        if (validPdfs.length > 0) {
            modalSelectedFiles = [...modalSelectedFiles, ...validPdfs];
            renderModalFiles();
        }
    }

    function renderModalFiles() {
        if (!modalFilesContainer || !modalFilesList) return;

        if (modalSelectedFiles.length === 0) {
            modalFilesList.classList.add("d-none");
            if (modalStartUploadBtn) modalStartUploadBtn.disabled = true;
            return;
        }

        modalFilesList.classList.remove("d-none");
        if (modalStartUploadBtn) modalStartUploadBtn.disabled = false;
        modalFilesContainer.innerHTML = "";

        modalSelectedFiles.forEach((file, index) => {
            const row = document.createElement("div");
            row.className = "d-flex align-items-center justify-content-between p-2 bg-light rounded border";
            row.innerHTML = `
                <div class="d-flex align-items-center gap-2 text-truncate" style="max-width: 80%;">
                    <i data-lucide="file-text" style="width: 16px; height: 16px; color: #DC2626;"></i>
                    <div class="text-truncate">
                        <span class="small fw-medium d-block text-truncate">${file.name}</span>
                        <span class="extra-small text-muted">${formatBytes(file.size)}</span>
                    </div>
                </div>
                <button type="button" class="btn btn-sm btn-link text-danger p-0" data-index="${index}" title="Remove file">
                    <i data-lucide="x" style="width: 14px; height: 14px;"></i>
                </button>
            `;

            row.querySelector("button").addEventListener("click", () => {
                modalSelectedFiles.splice(index, 1);
                renderModalFiles();
            });

            modalFilesContainer.appendChild(row);
        });

        if (window.lucide) lucide.createIcons();
    }

    // Modal Upload Submit
    if (modalStartUploadBtn) {
        modalStartUploadBtn.addEventListener("click", async () => {
            if (modalSelectedFiles.length === 0) return;

            const formData = new FormData();
            for (const file of modalSelectedFiles) {
                formData.append("files", file);
            }

            modalStartUploadBtn.disabled = true;
            modalUploadProgress.classList.remove("d-none");
            modalProgressBar.style.width = "40%";
            modalProgressPercent.textContent = "Processing...";

            try {
                const res = await fetch("/api/upload", {
                    method: "POST",
                    body: formData
                });

                const data = await res.json();

                if (data.success) {
                    modalProgressBar.style.width = "100%";
                    modalProgressPercent.textContent = "Done!";
                    showToast(`Successfully processed ${data.count} document(s)`, "success");

                    setTimeout(() => {
                        window.location.reload();
                    }, 800);
                } else {
                    showToast(data.error || "Upload failed", "error");
                    modalStartUploadBtn.disabled = false;
                    modalUploadProgress.classList.add("d-none");
                }
            } catch (err) {
                showToast("Network error uploading document: " + err.message, "error");
                modalStartUploadBtn.disabled = false;
                modalUploadProgress.classList.add("d-none");
            }
        });
    }

    // 2. Dashboard Direct Drag and Drop Card
    const dashDropzone = document.getElementById("dashboardDropzone");
    const dashFileInput = document.getElementById("dashboardFileInput");
    const dashBrowseBtn = document.getElementById("dashboardBrowseBtn");
    const dashProgress = document.getElementById("dashboardUploadProgress");
    const dashBar = document.getElementById("dashboardProgressBar");
    const dashText = document.getElementById("dashboardProgressText");
    const dashPercent = document.getElementById("dashboardProgressPercent");

    if (dashBrowseBtn && dashFileInput) {
        dashBrowseBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            dashFileInput.click();
        });
    }

    if (dashDropzone && dashFileInput) {
        dashDropzone.addEventListener("click", () => dashFileInput.click());

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dashDropzone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dashDropzone.addEventListener(eventName, () => dashDropzone.classList.add("dragover"), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dashDropzone.addEventListener(eventName, () => dashDropzone.classList.remove("dragover"), false);
        });

        dashDropzone.addEventListener("drop", (e) => {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                uploadDirectFiles(files);
            }
        });

        dashFileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                uploadDirectFiles(e.target.files);
            }
        });
    }

    async function uploadDirectFiles(files) {
        const formData = new FormData();
        let validCount = 0;

        for (const file of files) {
            if (!file.name.toLowerCase().endsWith(".pdf")) {
                showToast(`"${file.name}" is not a PDF file.`, "warning");
                continue;
            }
            formData.append("files", file);
            validCount++;
        }

        if (validCount === 0) return;

        dashProgress.classList.remove("d-none");
        dashBar.style.width = "40%";
        dashText.textContent = `Extracting text from ${validCount} document(s)...`;
        if (dashPercent) dashPercent.textContent = "40%";

        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });

            const data = await res.json();

            if (data.success) {
                dashBar.style.width = "100%";
                if (dashPercent) dashPercent.textContent = "100%";
                dashText.textContent = "Completed!";
                showToast(`Successfully uploaded ${data.count} document(s)`, "success");
                setTimeout(() => window.location.reload(), 800);
            } else {
                showToast(data.error || "Upload failed", "error");
                dashProgress.classList.add("d-none");
            }
        } catch (err) {
            showToast("Network error uploading: " + err.message, "error");
            dashProgress.classList.add("d-none");
        }
    }
});
