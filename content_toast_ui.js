// content_toast_ui.js - Floating Toast UI with Shadow DOM & Auto-Copy
// Injected into active user tabs to display the captured OTP overlay

(function () {
  console.log("[Toast-UI] Script initialized on tab:", window.location.href);

  // Prevent multiple injections
  if (window.__OUTLOOK_OTP_TOAST_INITIALIZED__) return;
  window.__OUTLOOK_OTP_TOAST_INITIALIZED__ = true;

  // Auto-copy text helper
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      console.log("[Toast-UI] Copied to clipboard successfully via navigator.clipboard");
      return true;
    } catch (err) {
      console.warn("[Toast-UI] Clipboard API failed, attempting execCommand fallback:", err);
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand("copy");
        document.body.removeChild(textarea);
        return success;
      } catch (e) {
        console.error("[Toast-UI] Fallback copy also failed:", e);
        return false;
      }
    }
  }

  // Display the Floating Toast UI
  function showOtpToast(otpData) {
    const { otp, subject, sender } = otpData;
    if (!otp) return;

    // 1. Auto-copy OTP immediately into clipboard
    copyToClipboard(otp);

    // 2. Remove any previous toast container
    const existingHost = document.getElementById("outlook-otp-toast-host");
    if (existingHost) {
      existingHost.remove();
    }

    // 3. Create host element
    const host = document.createElement("div");
    host.id = "outlook-otp-toast-host";
    host.style.position = "fixed";
    host.style.top = "20px";
    host.style.right = "20px";
    host.style.zIndex = "2147483647";
    host.style.pointerEvents = "auto";

    // 4. Attach Shadow DOM (Open) for complete CSS encapsulation
    const shadow = host.attachShadow({ mode: "open" });

    // Styles for Toast UI inside Shadow DOM
    const style = document.createElement("style");
    style.textContent = `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }

      .toast-card {
        width: 320px;
        background: #ffffff;
        border: 1.5px solid #0078d4;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 120, 212, 0.25), 0 4px 12px rgba(0, 0, 0, 0.15);
        overflow: hidden;
        animation: slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        display: flex;
        flex-direction: column;
        color: #201f1e;
        position: relative;
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes slideOut {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(-20px) scale(0.95);
        }
      }

      .toast-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: linear-gradient(135deg, #0078d4 0%, #005a9e 100%);
        color: #ffffff;
        padding: 10px 14px;
      }

      .toast-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .toast-icon {
        font-size: 16px;
      }

      .toast-title {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.3px;
      }

      .btn-close {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.8);
        font-size: 16px;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        line-height: 1;
        transition: all 0.15s ease;
      }

      .btn-close:hover {
        background: rgba(255, 255, 255, 0.2);
        color: #ffffff;
      }

      .toast-body {
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        cursor: pointer;
      }

      .otp-display-box {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #f0f7ff;
        border: 2px dashed #0078d4;
        border-radius: 8px;
        padding: 8px 12px;
        transition: all 0.2s ease;
      }

      .otp-display-box:hover {
        background: #e5f2ff;
      }

      .otp-code {
        font-size: 26px;
        font-weight: 800;
        letter-spacing: 4px;
        color: #0078d4;
        font-family: "Courier New", Courier, monospace;
      }

      .btn-copy {
        background: #0078d4;
        color: #ffffff;
        border: none;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
        box-shadow: 0 2px 4px rgba(0, 120, 212, 0.2);
      }

      .btn-copy:hover {
        background: #106ebe;
      }

      .toast-meta {
        font-size: 11.5px;
        color: #605e5c;
        line-height: 1.3;
      }

      .meta-subject {
        font-weight: 600;
        color: #323130;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .meta-hint {
        color: #107c10;
        font-size: 11px;
        font-weight: 500;
        margin-top: 2px;
      }

      /* Progress countdown bar */
      .progress-bar-container {
        width: 100%;
        height: 3px;
        background: #edebe9;
      }

      .progress-bar {
        height: 100%;
        width: 100%;
        background: #0078d4;
        animation: countdown 12s linear forwards;
      }

      @keyframes countdown {
        from { width: 100%; }
        to { width: 0%; }
      }
    `;

    // Markup for Toast UI
    const card = document.createElement("div");
    card.className = "toast-card";

    const escapedSubject = escapeHtml(subject || "Outlook Verification Code");

    card.innerHTML = `
      <div class="toast-header">
        <div class="toast-header-left">
          <span class="toast-icon">🛡️</span>
          <span class="toast-title">Outlook OTP Notifier</span>
        </div>
        <button class="btn-close" id="btnClose" title="Đóng">✕</button>
      </div>

      <div class="toast-body" id="toastBody" title="Bấm vào để sao chép lại">
        <div class="otp-display-box">
          <span class="otp-code">${escapeHtml(otp)}</span>
          <button class="btn-copy" id="btnCopy">Sao chép</button>
        </div>
        <div class="toast-meta">
          <div class="meta-subject">${escapedSubject}</div>
          <div class="meta-hint">✓ Đã tự động sao chép vào bộ nhớ tạm!</div>
        </div>
      </div>

      <div class="progress-bar-container">
        <div class="progress-bar"></div>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(card);
    document.documentElement.appendChild(host);

    // Event Listeners inside Shadow DOM
    const btnClose = shadow.getElementById("btnClose");
    const btnCopy = shadow.getElementById("btnCopy");
    const toastBody = shadow.getElementById("toastBody");

    function dismissToast() {
      card.style.animation = "slideOut 0.25s forwards";
      setTimeout(() => {
        if (host && host.parentNode) {
          host.parentNode.removeChild(host);
        }
      }, 250);
    }

    btnClose.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissToast();
    });

    function handleCopyAction(e) {
      if (e) e.stopPropagation();
      copyToClipboard(otp);
      btnCopy.textContent = "✓ Đã copy";
      btnCopy.style.background = "#107c10";
      setTimeout(() => {
        btnCopy.textContent = "Sao chép";
        btnCopy.style.background = "#0078d4";
      }, 1500);
    }

    btnCopy.addEventListener("click", handleCopyAction);
    toastBody.addEventListener("click", handleCopyAction);

    // Auto dismiss after 12 seconds
    setTimeout(() => {
      dismissToast();
    }, 12000);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[m]);
  }

  // Listen for message from background service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === "SHOW_OTP_TOAST") {
      showOtpToast(message.payload);
      sendResponse({ status: "TOAST_DISPLAYED" });
    }
    return true;
  });
})();

