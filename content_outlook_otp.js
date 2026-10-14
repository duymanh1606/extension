// content_outlook_otp.js - Smart OTP Extractor for Outlook Inbox & Junk Mail
// Runs on: https://outlook.live.com/*, https://outlook.office.com/*, https://outlook.office365.com/*

(function () {
  console.log("[Outlook-OTP] Script loaded on:", window.location.href);

  let isScanning = false;
  let scanInterval = null;
  let inboxDetectedTime = null;
  let hasSwitchedToJunk = false;
  let clickedFirstMail = false;
  let extractedOtp = null;

  // Keywords that identify verification emails
  const VERIFICATION_KEYWORDS = [
    "otp",
    "code",
    "mã",
    "verify",
    "verification",
    "xác thực",
    "xác nhận",
    "security",
    "passcode",
    "pin",
    "one-time",
    "authentication",
    " mật khẩu một lần"
  ];

  // Check if text has verification context
  function hasVerificationContext(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return VERIFICATION_KEYWORDS.some(kw => lower.includes(kw));
  }

  // Regex to extract clean 4-8 digit OTP
  function extractOtpCandidate(text) {
    if (!text) return null;

    // Pattern 1: High-confidence contextual match (e.g. "code is 123456", "Mã OTP: 987654")
    const contextualRegex = /(?:mã(?:\s+xác\s*(?:nhận|thực))?|otp|code|verification(?:\s+code)?|security\s+code|passcode|pin|one[- ]time\s+password)\D{0,35}\b([0-9]{4,8})\b/i;
    const match1 = text.match(contextualRegex);
    if (match1 && match1[1]) {
      const code = match1[1];
      // Filter out years like 1990 - 2035
      if (!isYear(code)) {
        return code;
      }
    }

    // Pattern 2: Reverse context (e.g. "123456 là mã xác nhận", "654321 is your verification code")
    const reverseContextRegex = /\b([0-9]{4,8})\b\D{0,25}(?:là\s+mã|is\s+your\s+code|is\s+the\s+code|is\s+your\s+verification)/i;
    const match2 = text.match(reverseContextRegex);
    if (match2 && match2[1]) {
      const code = match2[1];
      if (!isYear(code)) {
        return code;
      }
    }

    // Pattern 3: If context is already verified in parent/subject, find stand-alone 4-8 digit number
    if (hasVerificationContext(text)) {
      const generalDigits = text.match(/\b(?!(?:19\d\d|20[2-3]\d)\b)([0-9]{4,8})\b/g);
      if (generalDigits && generalDigits.length > 0) {
        // Return first non-year candidate
        for (const num of generalDigits) {
          if (!isYear(num)) return num;
        }
      }
    }

    return null;
  }

  function isYear(str) {
    const num = parseInt(str, 10);
    return num >= 1990 && num <= 2035;
  }

  function sendStatus(message, statusType = "running") {
    try {
      chrome.runtime.sendMessage({
        action: "UPDATE_STATUS",
        message,
        statusType
      });
    } catch (e) {
      // Ignore
    }
  }

  function emitOtpFound(otp, subject, sender, preview) {
    if (extractedOtp) return; // Prevent double emit
    extractedOtp = otp;

    console.log(`[Outlook-OTP] FOUND OTP: ${otp} | Subject: ${subject}`);
    sendStatus(`Đã tìm thấy mã OTP: ${otp}`, "success");

    if (scanInterval) clearInterval(scanInterval);

    try {
      chrome.runtime.sendMessage({
        action: "OTP_EXTRACTED",
        payload: {
          otp,
          subject: subject || "Outlook Verification Code",
          sender: sender || "Service",
          preview: preview || ""
        }
      });
    } catch (err) {
      console.error("[Outlook-OTP] Failed to send OTP_EXTRACTED:", err);
    }
  }

  // Scan current DOM for emails and OTP
  function scanInboxAndReadingPane() {
    if (extractedOtp) return;

    // 1. Locate mail list items
    const mailRows = document.querySelectorAll("div[role='option'], div[data-convid], div[aria-label*='email' i]");
    
    // Check if mail interface is ready
    if (mailRows.length > 0 && !inboxDetectedTime) {
      inboxDetectedTime = Date.now();
      sendStatus(window.location.href.includes("junk") ? "Đang quét Thư rác (Junk Email)..." : "Đang theo dõi Hộp thư đến (Inbox)...");
    }

    // 2. Click the top (latest) email if not already clicked to ensure reading pane opens
    if (mailRows.length > 0 && !clickedFirstMail) {
      const firstRow = mailRows[0];
      try {
        firstRow.click();
        clickedFirstMail = true;
        console.log("[Outlook-OTP] Automatically clicked the latest email to open Reading Pane.");
      } catch (e) {
        console.warn("[Outlook-OTP] Error clicking first row:", e);
      }
    }

    // 3. Scan the first mail row content (subject, preview, sender)
    if (mailRows.length > 0) {
      const topRow = mailRows[0];
      const rowText = topRow.innerText || topRow.textContent || "";
      const rowAria = topRow.getAttribute("aria-label") || "";
      const combinedRowText = `${rowText} ${rowAria}`;

      // Try extract OTP directly from list preview
      const otpFromRow = extractOtpCandidate(combinedRowText);
      if (otpFromRow) {
        // Extract basic subject/sender from row
        const lines = rowText.split("\n").map(s => s.trim()).filter(Boolean);
        const sender = lines[0] || "Outlook";
        const subject = lines[1] || "Verification Code";
        emitOtpFound(otpFromRow, subject, sender, rowText.substring(0, 150));
        return;
      }
    }

    // 4. Scan Reading Pane (full message content)
    const readingPane = document.querySelector(
      "div[role='region'][aria-label*='Reading Pane' i], " +
      "div[role='region'][aria-label*='Nội dung thư' i], " +
      "div[role='region'][aria-label*='Message body' i], " +
      "div[data-app-section='ConversationContainer'], " +
      "#ItemVisiblePart, " +
      ".ReadingPaneContainer"
    );

    if (readingPane) {
      const paneText = readingPane.innerText || readingPane.textContent || "";
      if (paneText && hasVerificationContext(paneText)) {
        const otpFromPane = extractOtpCandidate(paneText);
        if (otpFromPane) {
          // Extract subject heading if available
          const headingEl = document.querySelector("h1, div[role='heading'], span[role='heading']");
          const subject = headingEl ? headingEl.textContent.trim() : "Outlook Verification Code";
          const senderEl = document.querySelector("div[aria-label*='From' i], div[aria-label*='Từ' i], .SenderText");
          const sender = senderEl ? senderEl.textContent.trim() : "Outlook Sender";

          emitOtpFound(otpFromPane, subject, sender, paneText.substring(0, 200));
          return;
        }
      }
    }

    // 5. Fallback scan: Check entire visible body if verification context present
    const bodyText = document.body.innerText || "";
    if (hasVerificationContext(bodyText)) {
      const broadOtp = extractOtpCandidate(bodyText);
      if (broadOtp) {
        emitOtpFound(broadOtp, "Mã xác nhận bảo mật", "Outlook", "");
        return;
      }
    }

    // 6. 12-Second Fallback Mechanism: Switch to Junk Email if no OTP found in Inbox
    if (inboxDetectedTime && !hasSwitchedToJunk && !extractedOtp) {
      const elapsed = Date.now() - inboxDetectedTime;
      const currentUrl = window.location.href;

      if (elapsed >= 12000 && !currentUrl.includes("junkemail")) {
        hasSwitchedToJunk = true;
        console.log("[Outlook-OTP] 12 seconds elapsed with no OTP in Inbox. Switching to Junk Email...");
        sendStatus("Không có OTP ở Hộp thư đến sau 12 giây, đang kiểm tra Thư rác (Junk Email)...");

        // Try clicking Junk Email folder in sidebar first
        const junkLink = Array.from(document.querySelectorAll("a, div[role='treeitem'], span")).find(el => {
          const t = (el.textContent || "").toLowerCase().trim();
          return t === "junk email" || t === "thư rác" || t === "junk";
        });

        if (junkLink) {
          try {
            junkLink.click();
            clickedFirstMail = false;
            inboxDetectedTime = Date.now(); // reset timer for junk mail
            return;
          } catch (e) {
            // Fallback to URL redirection
          }
        }

        // Direct URL redirection to junkemail folder
        window.location.href = "https://outlook.live.com/mail/0/junkemail";
      }
    }
  }

  // Initialize Scanner
  function startScanner() {
    if (isScanning) return;
    isScanning = true;
    console.log("[Outlook-OTP] Starting OTP scanner loop...");

    // Periodic scanner every 1000ms
    scanInterval = setInterval(scanInboxAndReadingPane, 1000);
    scanInboxAndReadingPane();

    // DOM Mutation Observer for instant reactivity
    const observer = new MutationObserver(() => {
      scanInboxAndReadingPane();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Check if active flow is running
  chrome.storage.local.get(["activeFlow"], (data) => {
    if (data.activeFlow && data.activeFlow.isRunning) {
      sendStatus("Đã vào hòm thư Outlook, đang quét tìm email OTP...");
      startScanner();
    }
  });

  // Watch storage in case flow was initiated earlier
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.activeFlow) {
      const flow = changes.activeFlow.newValue;
      if (flow && flow.isRunning && !isScanning) {
        startScanner();
      } else if (!flow || !flow.isRunning) {
        if (scanInterval) {
          clearInterval(scanInterval);
          scanInterval = null;
        }
      }
    }
  });
})();

