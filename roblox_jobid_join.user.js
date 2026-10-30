// ==UserScript==
// @name         Roblox Job ID Joiner
// @namespace    https://github.com/pushurt3mprr
// @version      1.0.0
// @description  Adds an input field and button to join specific Job IDs directly from the Roblox Servers tab.
// @author       pushurt3mprr
// @match        https://www.roblox.com/games/*
// @match        https://web.roblox.com/games/*
// @icon         https://www.roblox.com/favicon.ico
// @downloadURL  https://raw.githubusercontent.com/pushurt3mprr/roblox-joinjobid/main/roblox-jobid-join.user.js
// @updateURL    https://raw.githubusercontent.com/pushurt3mprr/roblox-joinjobid/main/roblox-jobid-join.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const CONTAINER_ID = "roblox-jobid-joiner-container";
  const INPUT_ID = "roblox-jobid-input";
  const BUTTON_ID = "roblox-jobid-join-btn";
  const STATUS_ID = "roblox-jobid-status";
  const STYLES_ID = "roblox-jobid-joiner-styles";

  // Regex to extract standard UUID format if pasted within strings or quotes
  const UUID_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

  /**
   * Injects stylesheet matching Roblox's native light & dark theme.
   */
  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement("style");
    style.id = STYLES_ID;
    style.textContent = `
      #${CONTAINER_ID} {
        background-color: var(--card-bg, rgba(25, 27, 29, 0.6));
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 16px 20px;
        margin: 15px 0 20px 0;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        font-family: var(--font-family, "Builder Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
        color: inherit;
      }
      .theme-light #${CONTAINER_ID},
      body.light-theme #${CONTAINER_ID} {
        background-color: #ffffff;
        border: 1px solid rgba(0, 0, 0, 0.12);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
      }
      .jobid-header-title {
        font-size: 16px;
        font-weight: 700;
        margin: 0 0 10px 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .jobid-input-group {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: nowrap;
      }
      #${INPUT_ID} {
        flex: 1;
        min-width: 240px;
        height: 38px;
        padding: 6px 12px;
        font-size: 14px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background-color: rgba(0, 0, 0, 0.25);
        color: inherit;
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .theme-light #${INPUT_ID},
      body.light-theme #${INPUT_ID} {
        background-color: #f7f7f7;
        border: 1px solid rgba(0, 0, 0, 0.2);
        color: #191b1d;
      }
      #${INPUT_ID}:focus {
        border-color: #00b06f;
        box-shadow: 0 0 0 2px rgba(0, 176, 111, 0.25);
      }
      #${BUTTON_ID} {
        height: 38px;
        padding: 0 20px;
        font-size: 14px;
        font-weight: 600;
        border-radius: 6px;
        border: none;
        background-color: #00b06f;
        color: #ffffff;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        transition: background-color 0.15s ease, transform 0.05s ease;
      }
      #${BUTTON_ID}:hover {
        background-color: #009960;
      }
      #${BUTTON_ID}:active {
        transform: scale(0.98);
      }
      #${BUTTON_ID}:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      #${STATUS_ID} {
        font-size: 13px;
        margin-top: 8px;
        min-height: 18px;
        display: none;
      }
      #${STATUS_ID}.status-info {
        color: #3b82f6;
        display: block;
      }
      #${STATUS_ID}.status-success {
        color: #10b981;
        display: block;
      }
      #${STATUS_ID}.status-error {
        color: #ef4444;
        display: block;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Retrieves current Place ID from the URL pathname or DOM metadata.
   */
  function getPlaceId() {
    const match = window.location.pathname.match(/\/games\/(\d+)/);
    if (match && match[1]) return match[1];

    const meta = document.getElementById("game-detail-meta");
    if (meta && meta.dataset.placeId) return meta.dataset.placeId;

    return null;
  }

  /**
   * Cleans input to extract a valid Job ID (strips quotes, spaces, or Lua code).
   */
  function sanitizeJobId(rawInput) {
    if (!rawInput) return "";
    const trimmed = rawInput.trim();
    const match = trimmed.match(UUID_REGEX);
    return match ? match[0] : trimmed.replace(/["';\s]/g, "");
  }

  /**
   * Shows a status message below the input.
   */
  function showStatus(message, type = "info") {
    const statusEl = document.getElementById(STATUS_ID);
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = "";
    statusEl.classList.add(`status-${type}`);
    statusEl.style.display = message ? "block" : "none";
  }

  /**
   * Triggers Roblox GameLauncher to join the specific game instance.
   */
  function joinJobId(jobId) {
    const placeId = getPlaceId();
    if (!placeId) {
      showStatus("Could not detect Place ID from page. Are you on a game page?", "error");
      return;
    }

    const cleanJobId = sanitizeJobId(jobId);
    if (!cleanJobId) {
      showStatus("Please enter a valid Server Job ID.", "error");
      return;
    }

    const launcher =
      window.Roblox?.GameLauncher ||
      (typeof unsafeWindow !== "undefined" && unsafeWindow.Roblox?.GameLauncher);

    if (launcher && typeof launcher.joinGameInstance === "function") {
      showStatus(`Launching Roblox client into server (${cleanJobId.slice(0, 8)}...)...`, "success");
      try {
        launcher.joinGameInstance(parseInt(placeId, 10), cleanJobId);
      } catch (err) {
        console.error("[Roblox Job ID Joiner] Launch error:", err);
        showStatus("Error executing GameLauncher: " + err.message, "error");
      }
    } else {
      showStatus("Roblox.GameLauncher is not ready yet. Please wait a moment and retry.", "error");
    }
  }

  /**
   * Creates and injects the UI widget into the Servers tab.
   */
  function createUI() {
    const container = document.createElement("div");
    container.id = CONTAINER_ID;

    container.innerHTML = `
      <div class="jobid-header-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
          <line x1="6" y1="6" x2="6.01" y2="6"></line>
          <line x1="6" y1="18" x2="6.01" y2="18"></line>
        </svg>
        <span>Join Server by Job ID</span>
      </div>
      <div class="jobid-input-group">
        <input
          type="text"
          id="${INPUT_ID}"
          placeholder="Paste Job ID (e.g. 9134c999-91d5-4b52-9f0a-f7cbae67fe77)..."
          autocomplete="off"
          spellcheck="false"
        />
        <button type="button" id="${BUTTON_ID}">Join Server</button>
      </div>
      <div id="${STATUS_ID}"></div>
    `;

    const input = container.querySelector(`#${INPUT_ID}`);
    const button = container.querySelector(`#${BUTTON_ID}`);

    const handleJoin = () => {
      const value = input.value;
      joinJobId(value);
    };

    button.addEventListener("click", handleJoin);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleJoin();
      }
    });

    return container;
  }

  /**
   * Attempts to locate the Servers tab content and inject the UI.
   */
  function tryInjectUI() {
    if (document.getElementById(CONTAINER_ID)) return true;

    // Target the servers tab pane: #game-instances or #rbx-running-games
    const serversTabPane =
      document.getElementById("game-instances") ||
      document.getElementById("rbx-running-games") ||
      document.getElementById("rbx-public-running-games");

    if (!serversTabPane) return false;

    injectStyles();
    const ui = createUI();

    // Insert at top of the servers pane
    serversTabPane.insertBefore(ui, serversTabPane.firstChild);

    // If there is an existing serverJobId in URL query, populate and launch
    checkUrlParam();

    return true;
  }

  /**
   * Backward-compatibility with DaRealRomz/roblox-jobid-join (?serverJobId=...).
   */
  function checkUrlParam() {
    const params = new URLSearchParams(window.location.search);
    const serverJobId = params.get("serverJobId");
    if (serverJobId) {
      const input = document.getElementById(INPUT_ID);
      if (input) {
        input.value = serverJobId;
      }
      joinJobId(serverJobId);
    }
  }

  /**
   * Main observer to handle dynamic tab loading and SPA navigation in Roblox.
   */
  function setupObserver() {
    tryInjectUI();

    const observer = new MutationObserver(() => {
      if (!document.getElementById(CONTAINER_ID)) {
        tryInjectUI();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also re-check when clicking the Servers tab directly
    document.addEventListener("click", (e) => {
      const target = e.target.closest("#tab-game-instances, [data-target='#game-instances'], a[href*='game-instances']");
      if (target) {
        setTimeout(tryInjectUI, 100);
        setTimeout(tryInjectUI, 500);
      }
    });
  }

  // Initial execution
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupObserver);
  } else {
    setupObserver();
  }
})();

