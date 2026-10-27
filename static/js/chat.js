/**
 * DocuMind AI - Minimal AI Chat Controller
 * Conversational RAG with Gemini, Citation Badges, and History
 */

document.addEventListener("DOMContentLoaded", () => {
    const chatDocSelector = document.getElementById("chatDocSelector");
    const chatMessages = document.getElementById("chatMessages");
    const chatForm = document.getElementById("chatForm");
    const chatInput = document.getElementById("chatInput");
    const chatSendBtn = document.getElementById("chatSendBtn");
    const chatTypingIndicator = document.getElementById("chatTypingIndicator");
    const btnClearChat = document.getElementById("btnClearChat");
    const btnExportChat = document.getElementById("btnExportChat");

    let activeDocId = chatDocSelector ? chatDocSelector.value : null;
    let sessionId = getOrCreateSessionId(activeDocId);

    function getOrCreateSessionId(docId) {
        if (!docId) return "default_session";
        const key = `documind_session_${docId}`;
        let sid = localStorage.getItem(key);
        if (!sid) {
            sid = "sess_" + Math.random().toString(36).substring(2, 10);
            localStorage.setItem(key, sid);
        }
        return sid;
    }

    if (chatDocSelector) {
        chatDocSelector.addEventListener("change", (e) => {
            const newDocId = e.target.value;
            if (newDocId) {
                window.location.href = `/chat/${newDocId}`;
            }
        });
    }

    async function loadChatHistory() {
        if (!activeDocId) return;

        try {
            const res = await fetch(`/api/chat/history/${activeDocId}/${sessionId}`);
            const data = await res.json();

            if (data.success && data.messages && data.messages.length > 0) {
                chatMessages.innerHTML = "";
                data.messages.forEach(msg => {
                    appendMessageBubble(msg.role, msg.content, msg.page_references || [], false);
                });
                scrollToBottom();
            }
        } catch (err) {
            console.error("Error loading chat history:", err);
        }
    }

    loadChatHistory();

    // Auto-expanding input
    if (chatInput) {
        chatInput.addEventListener("input", function() {
            this.style.height = "auto";
            this.style.height = Math.min(this.scrollHeight, 120) + "px";
        });

        chatInput.addEventListener("keydown", function(e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (chatForm) chatForm.dispatchEvent(new Event("submit"));
            }
        });
    }

    // Suggested questions
    document.addEventListener("click", (e) => {
        const promptBtn = e.target.closest(".prompt-suggestion-btn");
        if (promptBtn && chatInput) {
            chatInput.value = promptBtn.innerText.trim();
            chatInput.focus();
            if (chatForm) chatForm.dispatchEvent(new Event("submit"));
        }
    });

    // Form Submit
    if (chatForm) {
        chatForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const message = chatInput.value.trim();
            if (!message || !activeDocId) return;

            appendMessageBubble("user", message, [], true);
            chatInput.value = "";
            chatInput.style.height = "auto";
            chatSendBtn.disabled = true;

            if (chatTypingIndicator) {
                chatTypingIndicator.classList.remove("d-none");
                chatTypingIndicator.classList.add("d-flex");
            }
            scrollToBottom();

            try {
                const res = await fetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        document_id: activeDocId,
                        message: message,
                        session_id: sessionId
                    })
                });

                const data = await res.json();

                if (data.success) {
                    appendMessageBubble("assistant", data.reply, data.page_references || [], true);
                } else {
                    const errorMsg = data.error || "An error occurred.";
                    appendMessageBubble("assistant", `⚠️ **Error:** ${errorMsg}`, [], true);
                }
            } catch (err) {
                appendMessageBubble("assistant", `⚠️ **Network Error:** Could not connect (${err.message})`, [], true);
            } finally {
                chatSendBtn.disabled = false;
                if (chatTypingIndicator) {
                    chatTypingIndicator.classList.add("d-none");
                    chatTypingIndicator.classList.remove("d-flex");
                }
                scrollToBottom();
            }
        });
    }

    function appendMessageBubble(role, content, pageReferences = [], animate = false) {
        const row = document.createElement("div");
        row.className = `chat-bubble-row ${role}`;

        const isUser = role === "user";
        const senderLabel = isUser ? "You" : "DocuMind AI";

        let citationsHtml = "";
        if (!isUser && pageReferences && pageReferences.length > 0) {
            const badges = pageReferences.map(p => `
                <a href="/reader/${activeDocId}" class="citation-chip text-decoration-none" title="View in PDF Reader (Page ${p})">
                    <i data-lucide="file-text" style="width: 12px; height: 12px;"></i> Page ${p}
                </a>
            `).join("");
            citationsHtml = `
                <div class="mt-2 pt-2 border-top border-light-subtle d-flex flex-wrap align-items-center">
                    <span class="extra-small text-muted me-2 fw-semibold">Sources:</span>
                    ${badges}
                </div>
            `;
        }

        let formattedText = content;
        if (!isUser && window.marked) {
            formattedText = marked.parse(content);
        } else if (isUser) {
            const div = document.createElement("div");
            div.textContent = content;
            formattedText = div.innerHTML.replace(/\n/g, "<br>");
        }

        row.innerHTML = `
            <div class="chat-bubble ${role}">
                <div class="d-flex align-items-center justify-content-between mb-1">
                    <span class="fw-semibold extra-small ${isUser ? 'text-white-50' : 'text-primary'}">${senderLabel}</span>
                    ${!isUser ? `
                        <button class="btn btn-sm btn-link text-muted p-0 ms-auto btn-copy-chat" title="Copy answer">
                            <i data-lucide="copy" style="width: 13px; height: 13px;"></i>
                        </button>
                    ` : ''}
                </div>
                <div class="${isUser ? '' : 'markdown-body'}">
                    ${formattedText}
                </div>
                ${citationsHtml}
            </div>
        `;

        const copyBtn = row.querySelector(".btn-copy-chat");
        if (copyBtn) {
            copyBtn.addEventListener("click", () => {
                navigator.clipboard.writeText(content).then(() => {
                    showToast("Answer copied to clipboard!", "success");
                });
            });
        }

        chatMessages.appendChild(row);
        if (window.lucide) lucide.createIcons();
        if (animate) scrollToBottom();
    }

    function scrollToBottom() {
        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    // Clear Chat
    if (btnClearChat) {
        btnClearChat.addEventListener("click", async () => {
            if (!activeDocId) return;
            if (!confirm("Clear this chat conversation?")) return;

            try {
                const res = await fetch("/api/chat/clear", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        document_id: activeDocId,
                        session_id: sessionId
                    })
                });
                const data = await res.json();
                if (data.success) {
                    chatMessages.innerHTML = `
                        <div class="chat-bubble-row assistant">
                            <div class="chat-bubble assistant">
                                <div class="fw-semibold text-primary extra-small mb-1">DocuMind AI</div>
                                <div class="markdown-body">Conversation cleared. What would you like to ask about this PDF?</div>
                            </div>
                        </div>
                    `;
                    showToast("Chat cleared", "success");
                }
            } catch (err) {
                showToast("Failed to clear chat: " + err.message, "error");
            }
        });
    }

    // Export Chat
    if (btnExportChat) {
        btnExportChat.addEventListener("click", () => {
            const bubbles = chatMessages.querySelectorAll(".chat-bubble-row");
            if (bubbles.length <= 1) {
                showToast("No conversation to export.", "info");
                return;
            }

            let text = `DocuMind AI - Chat Export\nDocument: ${activeDocId}\nDate: ${new Date().toLocaleString()}\n\n`;
            bubbles.forEach(b => {
                const isUser = b.classList.contains("user");
                const sender = isUser ? "User" : "DocuMind AI";
                const body = b.querySelector(".markdown-body") || b.querySelector(".chat-bubble");
                text += `[${sender}]:\n${body ? body.innerText.trim() : ""}\n\n`;
            });

            navigator.clipboard.writeText(text).then(() => {
                showToast("Conversation copied to clipboard!", "success");
            });
        });
    }

    if (window.lucide) {
        lucide.createIcons();
    }
});
