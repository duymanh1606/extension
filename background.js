// background.js - Service Worker for Outlook Auto-Login & OTP Notifier

const COOKIE_DOMAINS = [
  "live.com",
  ".live.com",
  "login.live.com",
  "outlook.live.com",
  "microsoftonline.com",
  ".microsoftonline.com",
  "login.microsoftonline.com",
  "office.com",
  ".office.com",
  "office365.com",
  ".office365.com",
  "msftauth.net",
  ".msftauth.net"
];

let flowTimeoutTimer = null;
const notificationOtpMap = new Map();

// Helper: Clear cookies for specified domains
async function clearMicrosoftCookies() {
  try {
    for (const domain of COOKIE_DOMAINS) {
      const cookies = await chrome.cookies.getAll({ domain });
      for (const cookie of cookies) {
        const protocol = cookie.secure ? "https:" : "http:";
        const url = `${protocol}//${cookie.domain.replace(/^\./, "")}${cookie.path}`;
        try {
          await chrome.cookies.remove({ url, name: cookie.name, storeId: cookie.storeId });
        } catch (e) {
          // Ignore individual cookie removal error
        }
      }
    }

    // Also request browsingData removal if supported
    if (chrome.browsingData && chrome.browsingData.removeCookies) {
      await chrome.browsingData.removeCookies({
        origins: [
          "https://live.com",
          "https://login.live.com",
          "https://outlook.live.com",
          "https://login.microsoftonline.com",
          "https://office.com"
        ]
      });
    }
    console.log("[Background] Cleared Microsoft cookies successfully.");
  } catch (error) {
    console.error("[Background] Error clearing cookies:", error);
  }
}

// Helper: Update active flow status in storage
async function updateFlowState(partialState) {
  try {
    const data = await chrome.storage.local.get(["activeFlow"]);
    const current = data.activeFlow || {};
    const updated = { ...current, ...partialState };
    await chrome.storage.local.set({ activeFlow: updated });
    return updated;
  } catch (err) {
    console.error("[Background] updateFlowState error:", err);
  }
}

// Start Main Automation Flow
async function handleStartFlow(payload) {
  const { email, password, clearCookies, autoCloseTab } = payload;

  console.log(`[Background] Starting flow for: ${email}`);

  // Clear any existing timeout
  if (flowTimeoutTimer) clearTimeout(flowTimeoutTimer);

  // 1. Clear cookies if requested
  if (clearCookies) {
    await updateFlowState({
      isRunning: true,
      email,
      password,
      clearCookies,
      autoCloseTab,
      workingTabId: null,
      step: "CLEARING_COOKIES",
      statusMessage: "Đang xóa sạch cookie phiên cũ...",
      statusType: "running",
      startTime: Date.now()
    });
    await clearMicrosoftCookies();
  }

  // 2. Update status and open Outlook tab
  await updateFlowState({
    isRunning: true,
    email,
    password,
    clearCookies,
    autoCloseTab,
    step: "OPENING_TAB",
    statusMessage: "Đang mở tab Outlook chạy ngầm...",
    statusType: "running"
  });

  try {
    // Open Outlook web mail via direct sign-in entry point
    const tab = await chrome.tabs.create({
      url: "https://go.microsoft.com/fwlink/p/?linkid=2125442",
      active: false,
      pinned: true
    });

    await updateFlowState({
      workingTabId: tab.id,
      step: "TAB_OPENED",
      statusMessage: "Tab Outlook đã mở, đang đợi giao diện nạp...",
      statusType: "running"
    });

    // 3. Safety timeout: 120 seconds max
    flowTimeoutTimer = setTimeout(async () => {
      const data = await chrome.storage.local.get(["activeFlow"]);
      if (data.activeFlow && data.activeFlow.isRunning) {
        console.warn("[Background] Flow timeout exceeded (120s)");
        await updateFlowState({
          isRunning: false,
          statusMessage: "Quá thời gian chờ (Timeout 120s) mà chưa lấy được OTP.",
          statusType: "error"
        });
      }
    }, 120000);

  } catch (err) {
    console.error("[Background] Failed to create tab:", err);
    await updateFlowState({
      isRunning: false,
      statusMessage: "Không thể mở tab Outlook: " + err.message,
      statusType: "error"
    });
  }
}

// Handle Cancel Flow
async function handleCancelFlow() {
  if (flowTimeoutTimer) clearTimeout(flowTimeoutTimer);

  const data = await chrome.storage.local.get(["activeFlow"]);
  const flow = data.activeFlow;
  if (flow && flow.workingTabId) {
    try {
      await chrome.tabs.remove(flow.workingTabId);
    } catch (e) {
      // Tab might already be closed
    }
  }

  await updateFlowState({
    isRunning: false,
    statusMessage: "Đã dừng tiến trình.",
    statusType: "idle",
    workingTabId: null
  });
}

// Handle OTP Extracted event from content_outlook_otp.js
async function handleOtpExtracted(payload) {
  if (flowTimeoutTimer) clearTimeout(flowTimeoutTimer);

  const { otp, subject, sender, preview } = payload;
  console.log(`[Background] OTP Extracted: ${otp}`);

  const now = new Date();
  const timeStr = now.toLocaleTimeString();

  const otpData = {
    otp,
    subject: subject || "Outlook Verification Code",
    sender: sender || "Microsoft / Service",
    preview: preview || "",
    time: timeStr,
    timestamp: Date.now()
  };

  // 1. Save to storage
  const storageData = await chrome.storage.local.get(["otpHistory", "activeFlow"]);
  const history = storageData.otpHistory || [];
  history.unshift(otpData);
  if (history.length > 30) history.pop();

  await chrome.storage.local.set({
    lastOtpData: otpData,
    otpHistory: history
  });

  const activeFlow = storageData.activeFlow || {};
  await updateFlowState({
    isRunning: false,
    statusMessage: `Đã bóc tách thành công OTP: ${otp}`,
    statusType: "success"
  });

  // 2. Trigger System Notification
  const notifId = "otp_notif_" + Date.now();
  notificationOtpMap.set(notifId, otp);

  try {
    chrome.notifications.create(notifId, {
      type: "basic",
      iconUrl: "icon128.png",
      title: `🎉 Mã OTP: ${otp}`,
      message: `${subject ? subject + "\n" : ""}Bấm vào đây để copy mã OTP vào bộ nhớ tạm.`,
      contextMessage: "Outlook Auto-Login & OTP Notifier",
      requireInteraction: true,
      priority: 2,
      buttons: [
        { title: "📋 Sao chép mã OTP" }
      ]
    });
  } catch (err) {
    console.error("[Background] Notification error:", err);
  }

  // 3. Show Floating Toast on the currently active tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      const activeTab = tabs[0];
      // Only send if not a restricted URL
      if (activeTab.url && !activeTab.url.startsWith("chrome://") && !activeTab.url.startsWith("edge://")) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: "SHOW_OTP_TOAST",
          payload: otpData
        }, (res) => {
          if (chrome.runtime.lastError) {
            // If content script was not ready, try inject dynamically
            injectAndShowToast(activeTab.id, otpData);
          }
        });
      }
    }
  } catch (err) {
    console.error("[Background] Send toast to active tab error:", err);
  }

  // 4. Auto close working tab if configured
  if (activeFlow.autoCloseTab && activeFlow.workingTabId) {
    setTimeout(async () => {
      try {
        console.log(`[Background] Auto closing working tab ${activeFlow.workingTabId}`);
        await chrome.tabs.remove(activeFlow.workingTabId);
      } catch (e) {
        // Tab might have been closed by user
      }
    }, 2000);
  }
}

// Dynamic injector for toast script if tab hasn't loaded it yet
function injectAndShowToast(tabId, otpData) {
  try {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ["content_toast_ui.js"]
    }, () => {
      if (!chrome.runtime.lastError) {
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, {
            action: "SHOW_OTP_TOAST",
            payload: otpData
          }, () => {
            if (chrome.runtime.lastError) {
              // Ignore silent error
            }
          });
        }, 100);
      }
    });
  } catch (e) {
    console.warn("[Background] Cannot inject toast script:", e);
  }
}

// Notification Clicks & Buttons
chrome.notifications.onButtonClicked.addListener(async (notifId, buttonIndex) => {
  const otp = notificationOtpMap.get(notifId);
  if (otp) {
    copyOtpViaActiveTab(otp);
  }
  chrome.notifications.clear(notifId);
});

chrome.notifications.onClicked.addListener(async (notifId) => {
  const otp = notificationOtpMap.get(notifId);
  if (otp) {
    copyOtpViaActiveTab(otp);
  }
  chrome.notifications.clear(notifId);
});

// Copy OTP helper via active tab
async function copyOtpViaActiveTab(otpText) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0 && tabs[0].id) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (text) => {
          navigator.clipboard.writeText(text).catch(() => {
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
          });
        },
        args: [otpText]
      });
    }
  } catch (err) {
    console.error("[Background] copyOtpViaActiveTab error:", err);
  }
}

// Tab Removal Listener - if working tab closed unexpectedly
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const data = await chrome.storage.local.get(["activeFlow"]);
  if (data.activeFlow && data.activeFlow.isRunning && data.activeFlow.workingTabId === tabId) {
    console.log("[Background] Working tab was closed while running");
    await updateFlowState({
      isRunning: false,
      statusMessage: "Tab đăng nhập Outlook đã bị đóng trước khi hoàn tất.",
      statusType: "error",
      workingTabId: null
    });
    if (flowTimeoutTimer) clearTimeout(flowTimeoutTimer);
  }
});

// Message Listener from Popup and Content Scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  switch (message.action) {
    case "START_FLOW":
      handleStartFlow(message.payload);
      sendResponse({ status: "ACK" });
      break;

    case "CANCEL_FLOW":
      handleCancelFlow();
      sendResponse({ status: "ACK" });
      break;

    case "UPDATE_STATUS":
      updateFlowState({
        statusMessage: message.message,
        statusType: message.statusType || "running"
      });
      sendResponse({ status: "ACK" });
      break;

    case "LOGIN_ERROR":
      if (flowTimeoutTimer) clearTimeout(flowTimeoutTimer);
      updateFlowState({
        isRunning: false,
        statusMessage: `Lỗi đăng nhập: ${message.error || "Không xác định"}`,
        statusType: "error"
      });
      sendResponse({ status: "ACK" });
      break;

    case "OTP_EXTRACTED":
      handleOtpExtracted(message.payload);
      sendResponse({ status: "ACK" });
      break;

    default:
      break;
  }
  return true;
});

