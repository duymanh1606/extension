// popup.js - Outlook Auto-Login & OTP Notifier

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const quickPasteInput = document.getElementById("quickPaste");
  const btnQuickClear = document.getElementById("btnQuickClear");
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");
  const btnTogglePassword = document.getElementById("btnTogglePassword");
  const chkClearCookies = document.getElementById("chkClearCookies");
  const chkAutoCloseTab = document.getElementById("chkAutoCloseTab");
  const btnStart = document.getElementById("btnStart");
  const btnStartText = document.getElementById("btnStartText");
  const btnStop = document.getElementById("btnStop");
  
  const statusCard = document.getElementById("statusCard");
  const statusDot = document.getElementById("statusDot");
  const statusTitle = document.getElementById("statusTitle");
  const statusMessage = document.getElementById("statusMessage");

  const otpDisplayContainer = document.getElementById("otpDisplayContainer");
  const otpCode = document.getElementById("otpCode");
  const otpTime = document.getElementById("otpTime");
  const otpSubject = document.getElementById("otpSubject");
  const otpSender = document.getElementById("otpSender");
  const btnCopyOtp = document.getElementById("btnCopyOtp");
  
  const historyList = document.getElementById("historyList");
  const btnClearHistory = document.getElementById("btnClearHistory");
  const popupToast = document.getElementById("popupToast");

  let currentOtp = "";

  // 1. Initialize data from chrome.storage.local
  chrome.storage.local.get(
    ["activeFlow", "lastOtpData", "otpHistory", "settings", "credentials"],
    (data) => {
      // Restore settings
      if (data.settings) {
        if (typeof data.settings.clearCookies === "boolean") {
          chkClearCookies.checked = data.settings.clearCookies;
        }
        if (typeof data.settings.autoCloseTab === "boolean") {
          chkAutoCloseTab.checked = data.settings.autoCloseTab;
        }
      }

      // Restore credentials if available
      if (data.credentials) {
        if (data.credentials.email) emailInput.value = data.credentials.email;
        if (data.credentials.password) passwordInput.value = data.credentials.password;
      }

      // Restore last OTP
      if (data.lastOtpData) {
        renderOtp(data.lastOtpData);
      }

      // Restore history
      renderHistory(data.otpHistory || []);

      // Check running status
      if (data.activeFlow && data.activeFlow.isRunning) {
        setRunningState(true, data.activeFlow.statusMessage || "Đang xử lý...");
      } else if (data.activeFlow && data.activeFlow.statusMessage) {
        updateStatus(data.activeFlow.statusMessage, data.activeFlow.statusType || "idle");
      }
    }
  );

  // 2. Intelligent Quick Paste Parser
  function parseAccountString(str) {
    if (!str || typeof str !== "string") return null;
    str = str.trim();
    if (!str) return null;

    // Detect delimiters: Tab (\t), pipe (|), semicolon (;), or colon (:)
    let delimiter = null;
    if (str.includes("\t")) {
      delimiter = "\t";
    } else if (str.includes("|")) {
      delimiter = "|";
    } else if (str.includes(";")) {
      delimiter = ";";
    } else if (str.includes(":")) {
      // Be careful with colon if password contains colon
      delimiter = ":";
    }

    if (!delimiter) return null;

    const firstIndex = str.indexOf(delimiter);
    const email = str.substring(0, firstIndex).trim();
    const password = str.substring(firstIndex + 1).trim();

    if (email && password) {
      return { email, password };
    }
    return null;
  }

  function handleQuickPaste(rawText) {
    const parsed = parseAccountString(rawText);
    if (parsed) {
      emailInput.value = parsed.email;
      passwordInput.value = parsed.password;
      showToast("Đã phân tách Email & Mật khẩu!");
      saveCredentials(parsed.email, parsed.password);
      return true;
    }
    return false;
  }

  quickPasteInput.addEventListener("input", (e) => {
    const val = e.target.value;
    if (handleQuickPaste(val)) {
      quickPasteInput.value = "";
    }
  });

  quickPasteInput.addEventListener("paste", (e) => {
    const pastedData = (e.clipboardData || window.clipboardData).getData("text");
    if (handleQuickPaste(pastedData)) {
      e.preventDefault();
      quickPasteInput.value = "";
    }
  });

  // Also support pasting raw "email|pass" directly into emailInput
  emailInput.addEventListener("paste", (e) => {
    const pastedData = (e.clipboardData || window.clipboardData).getData("text");
    if (parseAccountString(pastedData)) {
      e.preventDefault();
      handleQuickPaste(pastedData);
    }
  });

  btnQuickClear.addEventListener("click", () => {
    quickPasteInput.value = "";
    quickPasteInput.focus();
  });

  // 3. Toggle Password Visibility
  btnTogglePassword.addEventListener("click", () => {
    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      btnTogglePassword.textContent = "🔒";
    } else {
      passwordInput.type = "password";
      btnTogglePassword.textContent = "👁️";
    }
  });

  // 4. Save settings and credentials
  function saveSettings() {
    chrome.storage.local.set({
      settings: {
        clearCookies: chkClearCookies.checked,
        autoCloseTab: chkAutoCloseTab.checked
      }
    });
  }

  function saveCredentials(email, password) {
    chrome.storage.local.set({
      credentials: { email, password }
    });
  }

  chkClearCookies.addEventListener("change", saveSettings);
  chkAutoCloseTab.addEventListener("change", saveSettings);

  emailInput.addEventListener("change", () => {
    saveCredentials(emailInput.value.trim(), passwordInput.value);
  });
  passwordInput.addEventListener("change", () => {
    saveCredentials(emailInput.value.trim(), passwordInput.value);
  });

  // 5. Button Start Flow
  btnStart.addEventListener("click", () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
      alert("Vui lòng nhập Email Outlook / Hotmail!");
      emailInput.focus();
      return;
    }

    if (!password) {
      alert("Vui lòng nhập Mật khẩu!");
      passwordInput.focus();
      return;
    }

    saveSettings();
    saveCredentials(email, password);

    setRunningState(true, "Đang khởi động tiến trình...");

    // Send command to background service worker
    chrome.runtime.sendMessage({
      action: "START_FLOW",
      payload: {
        email,
        password,
        clearCookies: chkClearCookies.checked,
        autoCloseTab: chkAutoCloseTab.checked
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("SendMessage error:", chrome.runtime.lastError);
        updateStatus("Lỗi kết nối background: " + chrome.runtime.lastError.message, "error");
        setRunningState(false);
      }
    });
  });

  // 6. Button Stop Flow
  btnStop.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "CANCEL_FLOW" }, () => {
      setRunningState(false);
      updateStatus("Đã hủy tiến trình bởi người dùng.", "idle");
    });
  });

  // 7. UI State Helpers
  function setRunningState(isRunning, message = "") {
    if (isRunning) {
      btnStart.disabled = true;
      btnStartText.textContent = "Đang xử lý...";
      btnStop.classList.remove("hidden");
      emailInput.disabled = true;
      passwordInput.disabled = true;
      quickPasteInput.disabled = true;
      statusDot.className = "status-dot running";
      if (message) statusMessage.textContent = message;
    } else {
      btnStart.disabled = false;
      btnStartText.textContent = "Đăng nhập & Lấy OTP";
      btnStop.classList.add("hidden");
      emailInput.disabled = false;
      passwordInput.disabled = false;
      quickPasteInput.disabled = false;
      if (statusDot.className.includes("running")) {
        statusDot.className = "status-dot";
      }
    }
  }

  function updateStatus(message, type = "idle") {
    statusMessage.textContent = message;
    statusDot.className = "status-dot";
    if (type === "running") {
      statusDot.classList.add("running");
    } else if (type === "success") {
      statusDot.classList.add("success");
    } else if (type === "error") {
      statusDot.classList.add("error");
    }
  }

  // 8. Render OTP & History
  function renderOtp(data) {
    if (!data || !data.otp) return;
    currentOtp = data.otp;
    otpCode.textContent = data.otp;
    otpTime.textContent = data.time || new Date().toLocaleTimeString();
    otpSubject.textContent = data.subject ? `Tiêu đề: ${data.subject}` : "Thư chứa mã xác thực";
    otpSender.textContent = data.sender ? `Từ: ${data.sender}` : "";
  }

  function renderHistory(history) {
    if (!history || history.length === 0) {
      historyList.innerHTML = '<div class="empty-history">Chưa có lịch sử mã OTP</div>';
      return;
    }

    historyList.innerHTML = "";
    history.slice(0, 8).forEach((item) => {
      const el = document.createElement("div");
      el.className = "history-item";
      el.innerHTML = `
        <span class="history-item-otp">${escapeHtml(item.otp)}</span>
        <span class="history-item-meta">${escapeHtml(item.time || "")}</span>
      `;
      el.addEventListener("click", () => {
        copyToClipboard(item.otp);
      });
      historyList.appendChild(el);
    });
  }

  btnClearHistory.addEventListener("click", () => {
    chrome.storage.local.set({ otpHistory: [] }, () => {
      renderHistory([]);
      showToast("Đã xóa lịch sử!");
    });
  });

  // 9. Copy to Clipboard
  function copyToClipboard(text) {
    if (!text || text === "------") return;
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Đã copy OTP: ${text}`);
      const originalText = btnCopyOtp.textContent;
      btnCopyOtp.textContent = "✓ Đã copy";
      setTimeout(() => {
        btnCopyOtp.textContent = originalText;
      }, 1500);
    }).catch(err => {
      console.error("Clipboard copy failed:", err);
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast(`Đã copy OTP: ${text}`);
    });
  }

  otpDisplayContainer.addEventListener("click", () => {
    copyToClipboard(currentOtp);
  });

  // 10. Toast in Popup
  let toastTimer = null;
  function showToast(msg) {
    popupToast.textContent = msg;
    popupToast.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      popupToast.classList.add("hidden");
    }, 2000);
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

  // 11. Listen for storage changes in real-time
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (changes.activeFlow) {
      const flow = changes.activeFlow.newValue;
      if (flow) {
        setRunningState(flow.isRunning, flow.statusMessage);
        updateStatus(flow.statusMessage || "Đang xử lý...", flow.statusType || (flow.isRunning ? "running" : "idle"));
      }
    }

    if (changes.lastOtpData && changes.lastOtpData.newValue) {
      renderOtp(changes.lastOtpData.newValue);
    }

    if (changes.otpHistory && changes.otpHistory.newValue) {
      renderHistory(changes.otpHistory.newValue);
    }
  });
});

