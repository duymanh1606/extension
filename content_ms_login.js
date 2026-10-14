// content_ms_login.js - Auto Microsoft Login Handler
// Runs on: https://login.live.com/* and https://login.microsoftonline.com/*

(function () {
  console.log("[MS-Login] Script loaded on:", window.location.href);

  let isHandling = false;
  let intervalId = null;
  let emailFilled = false;
  let passwordFilled = false;
  let lastActionTime = 0;

  // React & KnockoutJS safe input setter
  function setNativeInputValue(element, value) {
    if (!element) return;
    try {
      const prototype = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value") ||
                         Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");

      if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
      } else {
        element.value = value;
      }

      // Dispatch comprehensive event sequence
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    } catch (err) {
      console.warn("[MS-Login] setNativeInputValue failed, fallback simple value:", err);
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // Check if an element is visible to the user
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // Send status update to background
  function sendStatus(message, statusType = "running") {
    try {
      chrome.runtime.sendMessage({
        action: "UPDATE_STATUS",
        message,
        statusType
      });
    } catch (e) {
      // Background worker might be inactive
    }
  }

  // Send login error to background
  function sendError(error) {
    try {
      chrome.runtime.sendMessage({
        action: "LOGIN_ERROR",
        error
      });
    } catch (e) {
      // Ignore
    }
  }

  // Click element safely (works with Fluent UI, React, vanilla)
  function safeClick(element) {
    if (!element) return false;
    try {
      element.focus();
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      element.click();
      element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13 }));
      element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13 }));
    } catch (e) {
      element.click();
    }
    return true;
  }

  // Step processor running every 500ms
  async function processLoginStep() {
    if (isHandling) return;

    // Check storage to verify if active flow is running
    chrome.storage.local.get(["activeFlow"], (data) => {
      const flow = data.activeFlow;
      if (!flow || !flow.isRunning) {
        // No active flow, clean up interval
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        return;
      }

      const { email, password } = flow;
      const now = Date.now();

      // Debounce: allow at least 600ms between actions
      if (now - lastActionTime < 600) return;

      isHandling = true;
      try {
        // 0. Check for Login Errors on screen
        const errorEl = document.querySelector("#usernameError, #passwordError, .alert-error, div[role='alert']");
        if (errorEl && isVisible(errorEl) && errorEl.textContent.trim().length > 3) {
          const errText = errorEl.textContent.trim();
          console.error("[MS-Login] Detected login error on screen:", errText);
          sendError(errText);
          isHandling = false;
          return;
        }

        // 1. Check Pick an Account screen ("Use another account")
        const otherTile = document.querySelector("#otherTile, #use_another_account, [data-test-id='otherTile']");
        if (otherTile && isVisible(otherTile)) {
          console.log("[MS-Login] Selecting 'Use another account'...");
          sendStatus("Đang chọn đăng nhập tài khoản khác...");
          lastActionTime = now;
          safeClick(otherTile);
          isHandling = false;
          return;
        }

        // 2. Check EMAIL input screen
        const emailInput = document.querySelector("input[type='email'], input[name='loginfmt'], #i0116");
        if (emailInput && isVisible(emailInput) && !emailFilled) {
          console.log("[MS-Login] Filling email:", email);
          sendStatus("Đang điền tài khoản Outlook...");
          setNativeInputValue(emailInput, email);

          // Find Next button
          const nextBtn = document.querySelector("#idSIButton9, input[type='submit'], button[type='submit']");
          if (nextBtn && isVisible(nextBtn)) {
            emailFilled = true;
            lastActionTime = now;
            setTimeout(() => {
              safeClick(nextBtn);
              sendStatus("Đã gửi email, đang đợi ô mật khẩu...");
            }, 300);
          }
          isHandling = false;
          return;
        }

        // 2b. Check for "Use your password" option if prompted with email verification
        const usePasswordLink = Array.from(document.querySelectorAll("[role='button'], a, button, [role='link']")).find(el => {
          if (!isVisible(el)) return false;
          const text = (el.textContent || "").trim().toLowerCase();
          return (
            text === "use your password" ||
            text === "use password instead" ||
            text === "sử dụng mật khẩu" ||
            text === "sử dụng mật khẩu của bạn" ||
            text.includes("use your password") ||
            text.includes("use password instead") ||
            el.id === "idA_PWD_SwitchToPassword"
          );
        });

        if (usePasswordLink) {
          const innerBtn = usePasswordLink.querySelector("[role='button'], a, button");
          const targetToClick = innerBtn || usePasswordLink;
          console.log("[MS-Login] Found 'Use your password' option, clicking:", targetToClick.tagName, targetToClick.className);
          sendStatus("Đang chọn 'Sử dụng mật khẩu'...");
          lastActionTime = now + 1500;
          targetToClick.click();
          isHandling = false;
          return;
        }

        // 3. Check PASSWORD input screen
        const passwordInput = document.querySelector("input[type='password'], input[name='passwd'], #i0118");
        if (passwordInput && isVisible(passwordInput) && !passwordFilled) {
          console.log("[MS-Login] Filling password...");
          sendStatus("Đang điền mật khẩu...");
          setNativeInputValue(passwordInput, password);

          const submitBtn = document.querySelector("#idSIButton9, input[type='submit'], button[type='submit']");
          if (submitBtn && isVisible(submitBtn)) {
            passwordFilled = true;
            lastActionTime = now;
            setTimeout(() => {
              safeClick(submitBtn);
              sendStatus("Đã gửi mật khẩu, đang xác thực đăng nhập...");
            }, 300);
          }
          isHandling = false;
          return;
        }

        // 4. Check "Stay signed in?" screen (KMSI)
        const kmsiTitle = document.querySelector("#kmsiTitle, #kmsiDescription");
        const kmsiCheck = document.body.innerText.includes("Stay signed in?") ||
                          document.body.innerText.includes("Duy trì đăng nhập?") ||
                          document.body.innerText.includes("Do this to reduce the number of times");
        if (kmsiTitle || kmsiCheck) {
          const yesBtn = document.querySelector("#idSIButton9, button[type='submit'], input[type='submit']");
          if (yesBtn && isVisible(yesBtn)) {
            console.log("[MS-Login] Bypassing 'Stay signed in' screen -> Click Yes...");
            sendStatus("Đang bỏ qua màn hình Duy trì đăng nhập...");
            lastActionTime = now;
            safeClick(yesBtn);
            isHandling = false;
            return;
          }
        }

        // 5. Check Secondary Screens: "Break free from passwords", "Passkey", "Protect your account"
        // Look for Skip/Cancel/Back/No thanks links and buttons
        const skipButtons = [
          document.querySelector("#iShowSkip"),
          document.querySelector("#idBtn_Back"),
          document.querySelector("a#cancelLink"),
          document.querySelector("button[id*='Skip' i]"),
          document.querySelector("a[id*='Skip' i]"),
          document.querySelector("#iCancel")
        ];

        for (const btn of skipButtons) {
          if (btn && isVisible(btn)) {
            console.log("[MS-Login] Clicking skip/cancel button on secondary screen:", btn);
            sendStatus("Đang bỏ qua màn hình phụ bảo mật...");
            lastActionTime = now;
            safeClick(btn);
            isHandling = false;
            return;
          }
        }

        // Search for text links like "Skip for now", "No thanks", "Not now", "Looks good"
        const allLinksAndButtons = Array.from(document.querySelectorAll("a, button, span[role='button']"));
        for (const el of allLinksAndButtons) {
          if (!isVisible(el)) continue;
          const text = (el.textContent || "").trim().toLowerCase();
          if (
            text.includes("skip for now") ||
            text.includes("bỏ qua") ||
            text.includes("không phải bây giờ") ||
            text.includes("no thanks") ||
            text.includes("not now") ||
            text.includes("looks good") ||
            text.includes("ask later")
          ) {
            console.log("[MS-Login] Found text-based skip button:", text);
            sendStatus("Đang bỏ qua đề xuất bảo mật...");
            lastActionTime = now;
            safeClick(el);
            isHandling = false;
            return;
          }
        }

      } catch (err) {
        console.error("[MS-Login] Error in processLoginStep:", err);
      } finally {
        isHandling = false;
      }
    });
  }

  // Start polling
  chrome.storage.local.get(["activeFlow"], (data) => {
    if (data.activeFlow && data.activeFlow.isRunning) {
      console.log("[MS-Login] Active flow detected, starting login watcher...");
      intervalId = setInterval(processLoginStep, 500);
      processLoginStep();
    }
  });

  // Watch for storage changes (in case flow starts after page load)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.activeFlow) {
      const flow = changes.activeFlow.newValue;
      if (flow && flow.isRunning && !intervalId) {
        intervalId = setInterval(processLoginStep, 500);
        processLoginStep();
      } else if (!flow || !flow.isRunning) {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    }
  });
})();

