// ==UserScript==
// @name         Roblox Multi-Tool & Job ID Joiner
// @namespace    https://github.com/pushurt3mprr
// @version      2.0.0
// @description  All-in-one Roblox toolkit for Firefox: Job ID Joiner, Real-Time Account Switcher (.ROBLOSECURITY vault), Join As Account, Quick Privacy/Chat Settings, Playtime Tracker & Developer Tools.
// @author       pushurt3mprr
// @match        https://*.roblox.com/*
// @icon         https://www.roblox.com/favicon.ico
// @downloadURL  https://raw.githubusercontent.com/pushurt3mprr/roblox-jobid-join/main/roblox-jobid-join.user.js
// @updateURL    https://raw.githubusercontent.com/pushurt3mprr/roblox-jobid-join/main/roblox-jobid-join.user.js
// @connect      roblox.com
// @connect      rbxcdn.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_cookie
// @grant        GM.cookie
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // Avoid running inside iframes (ads, verification frames, etc.)
  if (window.top !== window.self) return;

  /* ============================================================================
   * 1. CONSTANTS & UTILITIES
   * ============================================================================ */
  const APP_VERSION = "2.0.0";
  const TAB_ID = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : "tab-" + Math.random().toString(36).slice(2) + "-" + Date.now();

  const UUID_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

  const STORAGE_KEYS = {
    ACCOUNTS: "rtk_accounts_v2",
    SETTINGS: "rtk_settings_v2",
    PENDING_LAUNCH: "rtk_pending_launch_v2",
    RESTORE_PROMPT: "rtk_restore_prompt_v2",
    PLAYTIME: "rtk_playtime_v2",
    PRESENCE_LEADER: "rtk_presence_leader_v2",
    RECENT_SERVERS: "rtk_recent_servers_v2",
  };

  const DEFAULT_SETTINGS = {
    autoCaptureAccounts: true,
    logoutGuard: true,
    restoreAccountAfterJoin: false,
    trackStudioTime: true,
    ghostBackup: null,
    muteChatBackup: null,
  };

  const pageWin = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  const Utils = {
    escapeHtml(str) {
      if (str === null || str === undefined) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },

    sanitizeJobId(raw) {
      if (!raw) return "";
      const trimmed = String(raw).trim();
      const match = trimmed.match(UUID_REGEX);
      return match ? match[0] : trimmed.replace(/["';\s]/g, "");
    },

    sanitizeCookie(raw) {
      if (!raw) return "";
      let s = String(raw).trim();
      s = s.replace(/^["']+|["']+$/g, "").trim();
      if (s.startsWith(".ROBLOSECURITY=")) {
        s = s.slice(".ROBLOSECURITY=".length);
      }
      const semiIdx = s.indexOf(";");
      if (semiIdx !== -1 && !s.slice(0, semiIdx).includes("|_")) {
        s = s.slice(0, semiIdx);
      } else if (s.endsWith(";")) {
        s = s.slice(0, -1);
      }
      return s.trim();
    },

    formatDuration(totalSec) {
      const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
      if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
      return `${s}s`;
    },

    timeAgo(ts) {
      if (!ts) return "Never";
      const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (diff < 15) return "Just now";
      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    },

    async copyText(text) {
      try {
        if (typeof GM_setClipboard === "function") {
          GM_setClipboard(String(text), "text");
          return true;
        }
      } catch (_) {}
      try {
        await navigator.clipboard.writeText(String(text));
        return true;
      } catch (_) {
        return false;
      }
    },

    getPlaceIdFromPage() {
      const match = window.location.pathname.match(/\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?games\/(\d+)/i);
      if (match && match[1]) return match[1];
      const meta = document.getElementById("game-detail-meta");
      if (meta && meta.dataset && meta.dataset.placeId) return meta.dataset.placeId;
      return null;
    },

    getPageLoggedInMeta() {
      const meta = document.querySelector('meta[name="user-data"]');
      if (!meta) return null;
      const userId = meta.getAttribute("data-userid");
      const name = meta.getAttribute("data-name");
      const displayName = meta.getAttribute("data-displayname");
      if (!userId) return null;
      return {
        id: Number(userId),
        name: name || `User_${userId}`,
        displayName: displayName || name || `User_${userId}`,
      };
    },

    extractJobIdFromServerCard(cardEl) {
      if (!cardEl) return null;
      const directAttr =
        cardEl.getAttribute("data-id") ||
        cardEl.getAttribute("data-gameid") ||
        cardEl.getAttribute("data-btr-instance-id");
      if (directAttr && UUID_REGEX.test(directAttr)) {
        return directAttr.match(UUID_REGEX)[0];
      }
      // Inspect wrappedJSObject / React fiber for server instance GUID
      try {
        const rawNode = cardEl.wrappedJSObject || cardEl;
        const keys = Object.keys(rawNode);
        const fiberKey = keys.find(
          (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
        );
        if (fiberKey) {
          let curr = rawNode[fiberKey];
          for (let depth = 0; curr && depth < 12; depth++) {
            const props = curr.memoizedProps || curr.pendingProps;
            if (props) {
              const candidate =
                props.id ||
                props.gameId ||
                props.server?.id ||
                props.gameInstance?.id ||
                props.data?.id;
              if (typeof candidate === "string" && UUID_REGEX.test(candidate)) {
                return candidate.match(UUID_REGEX)[0];
              }
            }
            curr = curr.return;
          }
        }
      } catch (_) {}
      return null;
    },
  };

  /* ============================================================================
   * 2. PRIVILEGED STORAGE LAYER
   * ============================================================================ */
  const Store = {
    get(key, fallback) {
      try {
        if (typeof GM_getValue === "function") {
          const raw = GM_getValue(key, null);
          if (raw === null || raw === undefined) return structuredClone(fallback);
          return typeof raw === "string" ? JSON.parse(raw) : raw;
        }
      } catch (e) {
        console.warn("[RTK] Store.get error:", e);
      }
      return structuredClone(fallback);
    },

    set(key, value) {
      try {
        if (typeof GM_setValue === "function") {
          GM_setValue(key, JSON.stringify(value));
          return true;
        }
      } catch (e) {
        console.warn("[RTK] Store.set error:", e);
      }
      return false;
    },

    remove(key) {
      try {
        if (typeof GM_deleteValue === "function") {
          GM_deleteValue(key);
        }
      } catch (_) {}
    },

    getSettings() {
      const saved = this.get(STORAGE_KEYS.SETTINGS, {});
      return Object.assign({}, DEFAULT_SETTINGS, saved);
    },

    updateSettings(patch) {
      const next = Object.assign(this.getSettings(), patch);
      this.set(STORAGE_KEYS.SETTINGS, next);
      return next;
    },

    onChange(key, callback) {
      if (typeof GM_addValueChangeListener === "function") {
        return GM_addValueChangeListener(key, (_name, _oldVal, newVal, remote) => {
          try {
            const parsed = typeof newVal === "string" ? JSON.parse(newVal) : newVal;
            callback(parsed, remote);
          } catch (_) {
            callback(newVal, remote);
          }
        });
      }
      return null;
    },
  };

  /* ============================================================================
   * 3. UNIFIED COOKIE BRIDGE (Violentmonkey GM.cookie + Tampermonkey GM_cookie)
   * ============================================================================ */
  const CookieBridge = {
    hasApi() {
      return Boolean(
        (typeof GM !== "undefined" && GM && GM.cookie && typeof GM.cookie.list === "function") ||
        (typeof GM_cookie !== "undefined" && GM_cookie && typeof GM_cookie.list === "function")
      );
    },

    list(details) {
      return new Promise((resolve, reject) => {
        if (typeof GM !== "undefined" && GM?.cookie?.list) {
          GM.cookie
            .list(details)
            .then((res) => resolve(Array.isArray(res) ? res : []))
            .catch((err) => reject(err));
          return;
        }
        if (typeof GM_cookie !== "undefined" && GM_cookie?.list) {
          GM_cookie.list(details, (cookies, error) => {
            if (error) reject(new Error(String(error)));
            else resolve(Array.isArray(cookies) ? cookies : []);
          });
          return;
        }
        reject(new Error("GM_cookie / GM.cookie API unavailable in userscript manager."));
      });
    },

    setRaw(details) {
      return new Promise((resolve, reject) => {
        if (typeof GM !== "undefined" && GM?.cookie?.set) {
          GM.cookie
            .set(details)
            .then(() => resolve(true))
            .catch((err) => reject(err));
          return;
        }
        if (typeof GM_cookie !== "undefined" && GM_cookie?.set) {
          GM_cookie.set(details, (error) => {
            if (error) reject(new Error(String(error)));
            else resolve(true);
          });
          return;
        }
        reject(new Error("GM_cookie / GM.cookie API unavailable."));
      });
    },

    deleteRaw(details) {
      return new Promise((resolve, reject) => {
        if (typeof GM !== "undefined" && GM?.cookie?.delete) {
          GM.cookie
            .delete(details)
            .then(() => resolve(true))
            .catch((err) => reject(err));
          return;
        }
        if (typeof GM_cookie !== "undefined" && GM_cookie?.delete) {
          GM_cookie.delete(details, (error) => {
            if (error) reject(new Error(String(error)));
            else resolve(true);
          });
          return;
        }
        reject(new Error("GM_cookie / GM.cookie API unavailable."));
      });
    },

    async getRoblosecurity() {
      if (!this.hasApi()) return null;
      try {
        let cookies = await this.list({ url: "https://www.roblox.com/", name: ".ROBLOSECURITY" });
        if (!cookies || cookies.length === 0) {
          cookies = await this.list({ name: ".ROBLOSECURITY" });
        }
        if (!cookies || cookies.length === 0) return null;
        const preferred =
          cookies.find((c) => c.domain === ".roblox.com" && c.value) ||
          cookies.find((c) => c.value);
        return preferred ? preferred.value : null;
      } catch (e) {
        console.debug("[RTK] getRoblosecurity failed:", e);
        return null;
      }
    },

    async deleteRoblosecurity() {
      const targets = [
        { url: "https://www.roblox.com/", name: ".ROBLOSECURITY" },
        { url: "https://roblox.com/", name: ".ROBLOSECURITY" },
      ];
      for (const t of targets) {
        try {
          await this.deleteRaw(t);
        } catch (_) {}
      }
    },

    async setRoblosecurity(rawCookie) {
      const clean = Utils.sanitizeCookie(rawCookie);
      if (!clean) throw new Error("Empty .ROBLOSECURITY cookie.");

      await this.deleteRoblosecurity();

      const expirationDate = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
      await this.setRaw({
        url: "https://www.roblox.com/",
        domain: ".roblox.com",
        path: "/",
        name: ".ROBLOSECURITY",
        value: clean,
        secure: true,
        httpOnly: true,
        expirationDate,
      });
      return true;
    },

    async diagnose(isPageLoggedIn) {
      if (!this.hasApi()) {
        return {
          ok: false,
          reason: "missing_api",
          message:
            "Your userscript manager does not expose GM.cookie / GM_cookie. Please use Violentmonkey (>=2.35.1) or Tampermonkey.",
        };
      }
      try {
        const val = await this.getRoblosecurity();
        if (val) {
          return { ok: true, reason: "ready", message: "HttpOnly cookie access active." };
        }
        if (isPageLoggedIn) {
          return {
            ok: false,
            reason: "httponly_blocked",
            message:
              "HttpOnly cookie access is disabled in your userscript manager settings. Enable HttpOnly cookies in Violentmonkey / Tampermonkey to unlock automatic capture & real-time swapping.",
          };
        }
        return {
          ok: true,
          reason: "logged_out",
          message: "Not currently logged in on Roblox.",
        };
      } catch (err) {
        return {
          ok: false,
          reason: "httponly_blocked",
          message: `Cookie permission blocked (${err.message || err}). Enable HttpOnly cookie access in Violentmonkey / Tampermonkey settings.`,
        };
      }
    },
  };

  /* ============================================================================
   * 4. AUTHENTICATED ROBLOX API CLIENT (Auto X-CSRF-Token + Subdomain Support)
   * ============================================================================ */
  const RobloxAPI = {
    csrfToken: null,
    avatarCache: {},
    universeCache: {},
    gameMetaCache: {},

    getPageCsrf() {
      const meta = document.querySelector('meta[name="csrf-token"]');
      return meta ? meta.getAttribute("data-token") : null;
    },

    rawRequest({
      method = "GET",
      url,
      body = null,
      headers = {},
      anonymous = false,
      cookie = null,
      responseType = "text",
      timeout = 15000,
    }) {
      return new Promise((resolve, reject) => {
        const reqHeaders = Object.assign({}, headers);
        if (body && typeof body === "object" && !(body instanceof ArrayBuffer)) {
          reqHeaders["Content-Type"] = reqHeaders["Content-Type"] || "application/json";
        }
        if (cookie) {
          reqHeaders["Cookie"] = `.ROBLOSECURITY=${cookie}`;
        }

        const details = {
          method: method.toUpperCase(),
          url,
          headers: reqHeaders,
          anonymous: Boolean(anonymous),
          responseType,
          timeout,
          onload: (res) => {
            const headerMap = {};
            if (res.responseHeaders) {
              res.responseHeaders.split(/\r?\n/).forEach((line) => {
                const idx = line.indexOf(":");
                if (idx > 0) {
                  const k = line.slice(0, idx).trim().toLowerCase();
                  const v = line.slice(idx + 1).trim();
                  headerMap[k] = v;
                }
              });
            }
            resolve({
              status: res.status,
              statusText: res.statusText,
              headers: headerMap,
              response: res.response,
              responseText: responseType === "text" ? res.responseText : null,
            });
          },
          onerror: (err) => reject(new Error(err?.error || "Network error")),
          ontimeout: () => reject(new Error("Request timed out")),
        };

        if (cookie) {
          details.cookie = `.ROBLOSECURITY=${cookie}`;
        }
        if (body !== null && body !== undefined) {
          details.data = typeof body === "string" ? body : JSON.stringify(body);
        }

        GM_xmlhttpRequest(details);
      });
    },

    async request(options) {
      const method = (options.method || "GET").toUpperCase();
      const needsCsrf = method !== "GET" && method !== "HEAD";
      const headers = Object.assign({ Accept: "application/json" }, options.headers || {});

      if (needsCsrf && !options.cookie) {
        const token = this.csrfToken || this.getPageCsrf();
        if (token) headers["x-csrf-token"] = token;
      }

      const start = performance.now();
      let res = await this.rawRequest(Object.assign({}, options, { method, headers }));

      // Automatic X-CSRF-Token challenge retry
      if (res.status === 403 && res.headers["x-csrf-token"]) {
        const freshCsrf = res.headers["x-csrf-token"];
        if (!options.cookie) this.csrfToken = freshCsrf;
        headers["x-csrf-token"] = freshCsrf;
        res = await this.rawRequest(Object.assign({}, options, { method, headers }));
      }

      const durationMs = Math.round(performance.now() - start);
      let data = null;
      if (options.responseType !== "arraybuffer" && res.responseText) {
        try {
          data = JSON.parse(res.responseText);
        } catch (_) {
          data = res.responseText;
        }
      }

      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        headers: res.headers,
        data,
        raw: res.response,
        text: res.responseText,
        durationMs,
      };
    },

    async getCurrentUser() {
      const res = await this.request({
        url: "https://users.roblox.com/v1/users/authenticated",
      });
      if (res.ok && res.data && res.data.id) return res.data;
      return Utils.getPageLoggedInMeta();
    },

    async getAvatars(userIds) {
      const missing = userIds.filter((id) => id && !this.avatarCache[id]);
      if (missing.length > 0) {
        const res = await this.request({
          url: `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${missing.join(",")}&size=150x150&format=Png&isCircular=false`,
        });
        if (res.ok && Array.isArray(res.data?.data)) {
          res.data.data.forEach((item) => {
            if (item.imageUrl) this.avatarCache[item.targetId] = item.imageUrl;
          });
        }
      }
      const out = {};
      userIds.forEach((id) => {
        out[id] = this.avatarCache[id] || "";
      });
      return out;
    },

    async getPresences(userIds) {
      const res = await this.request({
        method: "POST",
        url: "https://presence.roblox.com/v1/presence/users",
        body: { userIds: userIds.map(Number) },
      });
      return res.ok && Array.isArray(res.data?.userPresences) ? res.data.userPresences : [];
    },

    async getUniverseId(placeId) {
      if (!placeId) return null;
      if (this.universeCache[placeId]) return this.universeCache[placeId];
      const res = await this.request({
        url: `https://apis.roblox.com/universes/v1/places/${placeId}/universe`,
      });
      if (res.ok && res.data?.universeId) {
        this.universeCache[placeId] = res.data.universeId;
        return res.data.universeId;
      }
      return null;
    },

    async getGameMeta(universeIds) {
      const ids = universeIds.filter(Boolean);
      const missing = ids.filter((u) => !this.gameMetaCache[u]);
      if (missing.length > 0) {
        const [detailsRes, iconsRes] = await Promise.all([
          this.request({
            url: `https://games.roblox.com/v1/games?universeIds=${missing.join(",")}`,
          }),
          this.request({
            url: `https://thumbnails.roblox.com/v1/games/icons?universeIds=${missing.join(",")}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`,
          }),
        ]);
        const iconMap = {};
        if (iconsRes.ok && Array.isArray(iconsRes.data?.data)) {
          iconsRes.data.data.forEach((ic) => {
            if (ic.imageUrl) iconMap[ic.targetId] = ic.imageUrl;
          });
        }
        if (detailsRes.ok && Array.isArray(detailsRes.data?.data)) {
          detailsRes.data.data.forEach((g) => {
            this.gameMetaCache[g.id] = Object.assign({}, g, {
              iconUrl: iconMap[g.id] || "",
            });
          });
        }
      }
      const out = {};
      ids.forEach((u) => {
        if (this.gameMetaCache[u]) out[u] = this.gameMetaCache[u];
      });
      return out;
    },

    async getPublicServers(placeId, sortOrder = "Asc", limit = 100) {
      const res = await this.request({
        url: `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=${sortOrder}&excludeFullGames=true&limit=${limit}`,
      });
      return res.ok && Array.isArray(res.data?.data) ? res.data.data : [];
    },

    async getUserSettingsAndOptions() {
      const rich = await this.request({
        url: "https://apis.roblox.com/user-settings-api/v1/user-settings/settings-and-options",
      });
      if (rich.ok && rich.data) return { mode: "options", data: rich.data };

      const basic = await this.request({
        url: "https://apis.roblox.com/user-settings-api/v1/user-settings",
      });
      if (basic.ok && basic.data) return { mode: "values", data: basic.data };
      throw new Error(`Failed to load user settings (HTTP ${basic.status})`);
    },

    async updateUserSettings(payload) {
      return this.request({
        method: "POST",
        url: "https://apis.roblox.com/user-settings-api/v1/user-settings",
        body: payload,
      });
    },

    async getAssetDetails(assetId) {
      return this.request({
        url: `https://economy.roblox.com/v2/assets/${assetId}/details`,
      });
    },

    async fetchRawAssetBuffer(assetId) {
      return this.request({
        url: `https://assetdelivery.roblox.com/v1/asset/?id=${encodeURIComponent(assetId)}`,
        responseType: "arraybuffer",
        headers: { Accept: "*/*" },
      });
    },
  };

  /* ============================================================================
   * 5. ACCOUNT VAULT & REAL-TIME SWITCHER
   * ============================================================================ */
  const AccountManager = {
    activeUser: null,
    cookieStatus: { ok: false, reason: "init", message: "Checking..." },

    getAll() {
      return Store.get(STORAGE_KEYS.ACCOUNTS, {});
    },

    getList() {
      return Object.values(this.getAll()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },

    saveEntry(entry) {
      const map = this.getAll();
      const key = String(entry.userId);
      const prev = map[key] || {};
      map[key] = Object.assign({}, prev, entry, {
        userId: entry.userId,
        updatedAt: Date.now(),
      });
      Store.set(STORAGE_KEYS.ACCOUNTS, map);
      return map[key];
    },

    removeEntry(userId) {
      const map = this.getAll();
      delete map[String(userId)];
      Store.set(STORAGE_KEYS.ACCOUNTS, map);
    },

    updateNote(userId, note) {
      const map = this.getAll();
      const key = String(userId);
      if (map[key]) {
        map[key].note = String(note || "").trim();
        Store.set(STORAGE_KEYS.ACCOUNTS, map);
      }
    },

    async initAndAutoCapture() {
      this.activeUser = await RobloxAPI.getCurrentUser();
      this.cookieStatus = await CookieBridge.diagnose(Boolean(this.activeUser));

      if (this.activeUser) {
        const avatars = await RobloxAPI.getAvatars([this.activeUser.id]);
        this.activeUser.avatarUrl = avatars[this.activeUser.id] || "";

        // Reconcile any manually-added pending account whose cookie just became active
        const liveCookie = await CookieBridge.getRoblosecurity();
        if (liveCookie) {
          const all = this.getAll();
          for (const k of Object.keys(all)) {
            if (String(k).startsWith("pending_") && all[k].cookie === liveCookie) {
              const note = all[k].note;
              delete all[k];
              Store.set(STORAGE_KEYS.ACCOUNTS, all);
              this.saveEntry({
                userId: this.activeUser.id,
                username: this.activeUser.name,
                displayName: this.activeUser.displayName,
                avatarUrl: this.activeUser.avatarUrl,
                cookie: liveCookie,
                note: note || "",
                addedVia: "manual",
                valid: true,
              });
            }
          }

          if (Store.getSettings().autoCaptureAccounts) {
            const existing = this.getAll()[String(this.activeUser.id)];
            this.saveEntry({
              userId: this.activeUser.id,
              username: this.activeUser.name,
              displayName: this.activeUser.displayName,
              avatarUrl: this.activeUser.avatarUrl,
              cookie: liveCookie,
              note: existing?.note || "",
              addedVia: existing?.addedVia || "auto",
              valid: true,
            });
          }
        }
      }
    },

    async captureCurrentNow() {
      const user = await RobloxAPI.getCurrentUser();
      if (!user) throw new Error("You are not logged into any Roblox account right now.");
      const cookie = await CookieBridge.getRoblosecurity();
      if (!cookie) {
        throw new Error(
          "Could not read .ROBLOSECURITY cookie. Enable HttpOnly cookie access in Violentmonkey / Tampermonkey settings first."
        );
      }
      const avatars = await RobloxAPI.getAvatars([user.id]);
      const existing = this.getAll()[String(user.id)];
      return this.saveEntry({
        userId: user.id,
        username: user.name,
        displayName: user.displayName,
        avatarUrl: avatars[user.id] || "",
        cookie,
        note: existing?.note || "",
        addedVia: "auto",
        valid: true,
      });
    },

    async addManualCookie(rawCookie, customNote = "") {
      const clean = Utils.sanitizeCookie(rawCookie);
      if (!clean || clean.length < 40) {
        throw new Error("Please paste a valid .ROBLOSECURITY cookie value.");
      }

      // Attempt 1: Anonymous GM_xmlhttpRequest with explicit cookie parameter
      let resolvedUser = null;
      try {
        const res = await RobloxAPI.request({
          url: "https://users.roblox.com/v1/users/authenticated",
          anonymous: true,
          cookie: clean,
        });
        if (res.ok && res.data?.id) {
          resolvedUser = res.data;
        }
      } catch (_) {}

      // Attempt 2: Temporary CookieBridge swap-verify-restore (if Firefox stripped manual Cookie header)
      if (!resolvedUser && this.cookieStatus.ok) {
        const previousCookie = await CookieBridge.getRoblosecurity();
        try {
          await CookieBridge.setRoblosecurity(clean);
          const check = await RobloxAPI.request({
            url: "https://users.roblox.com/v1/users/authenticated",
          });
          if (check.ok && check.data?.id) {
            resolvedUser = check.data;
          } else if (check.status === 401) {
            throw new Error("This .ROBLOSECURITY cookie is expired or invalid (HTTP 401).");
          }
        } finally {
          if (previousCookie) {
            await CookieBridge.setRoblosecurity(previousCookie).catch(() => {});
          } else {
            await CookieBridge.deleteRoblosecurity().catch(() => {});
          }
        }
      }

      if (resolvedUser) {
        const avatars = await RobloxAPI.getAvatars([resolvedUser.id]);
        return this.saveEntry({
          userId: resolvedUser.id,
          username: resolvedUser.name,
          displayName: resolvedUser.displayName,
          avatarUrl: avatars[resolvedUser.id] || "",
          cookie: clean,
          note: customNote,
          addedVia: "manual",
          valid: true,
        });
      }

      // Fallback if HttpOnly access is not yet enabled to verify via CookieBridge
      const pendingId = "pending_" + Date.now().toString(36);
      return this.saveEntry({
        userId: pendingId,
        username: customNote || `SavedAccount_${pendingId.slice(-4)}`,
        displayName: customNote || "Unverified (Switch once to resolve profile)",
        avatarUrl: "",
        cookie: clean,
        note: customNote,
        addedVia: "manual",
        valid: true,
      });
    },

    async switchToAccount(userId, options = {}) {
      const entry = this.getAll()[String(userId)];
      if (!entry || !entry.cookie) {
        throw new Error("Saved account cookie not found in vault.");
      }

      // Auto-backup current outgoing account's latest cookie before switching
      if (Store.getSettings().autoCaptureAccounts && this.activeUser) {
        try {
          const currentCookie = await CookieBridge.getRoblosecurity();
          if (currentCookie) {
            const existing = this.getAll()[String(this.activeUser.id)];
            this.saveEntry({
              userId: this.activeUser.id,
              username: this.activeUser.name,
              displayName: this.activeUser.displayName,
              avatarUrl: this.activeUser.avatarUrl || existing?.avatarUrl || "",
              cookie: currentCookie,
              note: existing?.note || "",
              addedVia: existing?.addedVia || "auto",
              valid: true,
            });
          }
        } catch (_) {}
      }

      await CookieBridge.setRoblosecurity(entry.cookie);

      const targetUrl =
        options.targetUrl ||
        (window.location.pathname.startsWith("/login")
          ? "https://www.roblox.com/home"
          : window.location.href);

      if (targetUrl === window.location.href) {
        window.location.reload();
      } else {
        window.location.href = targetUrl;
      }
    },

    async prepareCleanLogin() {
      if (this.activeUser) {
        const currentCookie = await CookieBridge.getRoblosecurity();
        if (currentCookie) {
          const existing = this.getAll()[String(this.activeUser.id)];
          this.saveEntry({
            userId: this.activeUser.id,
            username: this.activeUser.name,
            displayName: this.activeUser.displayName,
            avatarUrl: this.activeUser.avatarUrl || existing?.avatarUrl || "",
            cookie: currentCookie,
            note: existing?.note || "",
            addedVia: existing?.addedVia || "auto",
            valid: true,
          });
        }
      }
      await CookieBridge.deleteRoblosecurity();
      window.location.href = "https://www.roblox.com/login";
    },
  };

  /* ============================================================================
   * 6. GAME LAUNCHER & MULTI-ACCOUNT JOIN ENGINE
   * ============================================================================ */
  const Launcher = {
    recordRecentJoin(placeId, jobId, accountName) {
      const list = Store.get(STORAGE_KEYS.RECENT_SERVERS, []).filter(
        (x) => !(String(x.placeId) === String(placeId) && x.jobId === jobId)
      );
      const pageTitle = document.title.replace(/\s*-\s*Roblox$/i, "").trim();
      list.unshift({
        placeId: String(placeId),
        jobId: jobId || "",
        gameName: Utils.getPlaceIdFromPage() === String(placeId) ? pageTitle : `Place ${placeId}`,
        accountName: accountName || AccountManager.activeUser?.name || "Current",
        joinedAt: Date.now(),
      });
      Store.set(STORAGE_KEYS.RECENT_SERVERS, list.slice(0, 15));
    },

    async recordLaunchedPlaceForPlaytime(placeId) {
      try {
        const universeId = await RobloxAPI.getUniverseId(placeId);
        const pageTitle = document.title.replace(/\s*-\s*Roblox$/i, "").trim();
        const pt = Store.get(STORAGE_KEYS.PLAYTIME, { games: {}, activeSession: null });
        pt.lastLaunchedGame = {
          placeId: Number(placeId),
          universeId: universeId || null,
          name: pageTitle || `Place ${placeId}`,
          launchedAt: Date.now(),
        };
        Store.set(STORAGE_KEYS.PLAYTIME, pt);
      } catch (_) {}
    },

    callPageLauncher(fnName, args) {
      const gl = pageWin.Roblox && pageWin.Roblox.GameLauncher;
      if (gl && typeof gl[fnName] === "function") {
        gl[fnName](...args);
        return true;
      }
      // Fallback inline DOM script bridge
      try {
        const s = document.createElement("script");
        s.textContent = `
          if (window.Roblox && window.Roblox.GameLauncher && typeof window.Roblox.GameLauncher[${JSON.stringify(fnName)}] === "function") {
            window.Roblox.GameLauncher[${JSON.stringify(fnName)}](...${JSON.stringify(args)});
          }
        `;
        (document.head || document.documentElement).appendChild(s);
        s.remove();
        return Boolean(pageWin.Roblox?.GameLauncher);
      } catch (_) {
        return false;
      }
    },

    async waitForGameLauncher(maxWaitMs = 8000) {
      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        if (pageWin.Roblox && pageWin.Roblox.GameLauncher) return true;
        await new Promise((r) => setTimeout(r, 250));
      }
      return Boolean(pageWin.Roblox && pageWin.Roblox.GameLauncher);
    },

    async launchNow(placeId, jobId = null) {
      const cleanPlaceId = Number(String(placeId).trim());
      if (!cleanPlaceId || Number.isNaN(cleanPlaceId)) {
        throw new Error("Invalid Place ID.");
      }

      const cleanJobId = jobId ? Utils.sanitizeJobId(jobId) : "";
      const ready = await this.waitForGameLauncher(4000);
      if (!ready) {
        // Navigate to the game page with pending launch if currently on a non-game page without GameLauncher loaded
        Store.set(STORAGE_KEYS.PENDING_LAUNCH, {
          placeId: cleanPlaceId,
          jobId: cleanJobId || null,
          targetUserId: AccountManager.activeUser?.id || "current",
          previousUserId: null,
          restoreAfterLaunch: false,
          createdAt: Date.now(),
        });
        window.location.href = `https://www.roblox.com/games/${cleanPlaceId}/-`;
        return;
      }

      this.recordLaunchedPlaceForPlaytime(cleanPlaceId);
      if (cleanJobId) {
        this.recordRecentJoin(cleanPlaceId, cleanJobId, AccountManager.activeUser?.name);
        this.callPageLauncher("joinGameInstance", [cleanPlaceId, cleanJobId]);
      } else {
        this.callPageLauncher("joinMultiplayerGame", [cleanPlaceId]);
      }
    },

    async join(placeId, jobId = null, targetAccountId = "current") {
      const cleanPlaceId = Number(String(placeId || Utils.getPlaceIdFromPage() || "").trim());
      if (!cleanPlaceId) {
        throw new Error("Could not detect Place ID. Enter a Place ID or open a game page.");
      }
      const cleanJobId = jobId ? Utils.sanitizeJobId(jobId) : null;

      const currentId = AccountManager.activeUser ? String(AccountManager.activeUser.id) : null;
      if (!targetAccountId || targetAccountId === "current" || String(targetAccountId) === currentId) {
        await this.launchNow(cleanPlaceId, cleanJobId);
        return { switched: false };
      }

      // Switch to target account, persist pendingLaunch, and reload into the game page
      const settings = Store.getSettings();
      const targetUrl =
        Utils.getPlaceIdFromPage() === String(cleanPlaceId)
          ? window.location.origin + window.location.pathname
          : `https://www.roblox.com/games/${cleanPlaceId}/-`;

      Store.set(STORAGE_KEYS.PENDING_LAUNCH, {
        placeId: cleanPlaceId,
        jobId: cleanJobId,
        targetUserId: String(targetAccountId),
        previousUserId: currentId,
        previousUsername: AccountManager.activeUser?.name || "",
        restoreAfterLaunch: Boolean(settings.restoreAccountAfterJoin),
        createdAt: Date.now(),
      });

      await AccountManager.switchToAccount(targetAccountId, { targetUrl });
      return { switched: true };
    },

    async joinSmallestServer(placeId, targetAccountId = "current") {
      const servers = await RobloxAPI.getPublicServers(placeId, "Asc", 100);
      const valid = servers
        .filter((s) => s.id && s.playing >= 1 && s.playing < s.maxPlayers)
        .sort((a, b) => a.playing - b.playing || (a.ping || 999) - (b.ping || 999));
      if (!valid.length) throw new Error("No open public servers found for this place.");
      const chosen = valid[0];
      await this.join(placeId, chosen.id, targetAccountId);
      return chosen;
    },

    async joinLowestPingServer(placeId, targetAccountId = "current") {
      const servers = await RobloxAPI.getPublicServers(placeId, "Desc", 100);
      const valid = servers
        .filter((s) => s.id && s.playing < s.maxPlayers && typeof s.ping === "number" && s.ping > 0)
        .sort((a, b) => a.ping - b.ping);
      if (!valid.length) throw new Error("No open servers with ping data reported right now.");
      const chosen = valid[0];
      await this.join(placeId, chosen.id, targetAccountId);
      return chosen;
    },

    openInStudio(placeId, universeId) {
      const pId = Number(placeId);
      const uId = Number(universeId || 0);
      if (pageWin.Roblox?.GameLauncher?.editGameInStudio) {
        pageWin.Roblox.GameLauncher.editGameInStudio(pId, uId);
        return true;
      }
      return false;
    },

    async handleStartupLaunches(notifyFn) {
      // 1. Check cross-account pending launch
      const pending = Store.get(STORAGE_KEYS.PENDING_LAUNCH, null);
      if (pending && Date.now() - pending.createdAt < 90000) {
        Store.remove(STORAGE_KEYS.PENDING_LAUNCH);
        const accName = AccountManager.activeUser?.name || "Selected Account";
        notifyFn(`Launching Roblox as @${accName}...`, "success");
        await this.launchNow(pending.placeId, pending.jobId);

        if (pending.previousUserId && pending.previousUserId !== String(AccountManager.activeUser?.id)) {
          Store.set(STORAGE_KEYS.RESTORE_PROMPT, {
            previousUserId: pending.previousUserId,
            previousUsername: pending.previousUsername || "Previous Account",
            autoRestore: Boolean(pending.restoreAfterLaunch),
            expiresAt: Date.now() + 45000,
          });
        }
        return;
      }

      // 2. Backward-compatible URL ?serverJobId=<uuid> auto-join
      const urlJobId = new URLSearchParams(window.location.search).get("serverJobId");
      const placeId = Utils.getPlaceIdFromPage();
      if (urlJobId && placeId) {
        notifyFn(`Joining URL serverJobId (${urlJobId.slice(0, 8)}...)...`, "info");
        await this.launchNow(placeId, urlJobId);
      }
    },
  };

  /* ============================================================================
   * 7. QUICK SETTINGS ENGINE (Privacy, Online Status, Chat, Trades, Theme)
   * ============================================================================ */
  const SETTING_DEFINITIONS = [
    {
      key: "whoCanSeeMyOnlineStatus",
      label: "Online Status Visibility",
      desc: "Control who can see when you are online or active",
      fallbackOptions: ["AllUsers", "FriendsFollowingAndFollowers", "FriendsAndFollowing", "Friends", "NoOne"],
    },
    {
      key: "whoCanJoinMeInExperiences",
      label: "Show Current Game / Joins",
      desc: "Control who sees your current experience and can join your server",
      fallbackOptions: ["AllUsers", "FriendsFollowingAndFollowers", "FriendsAndFollowing", "Friends", "NoOne"],
    },
    {
      key: "whoCanChatWithMeInExperiences",
      label: "In-Experience Chat",
      desc: "Enable or disable in-game text chat",
      fallbackOptions: ["AllUsers", "Friends", "NoOne"],
    },
    {
      key: "whoCanChatWithMeInApp",
      label: "App / Party Direct Chat",
      desc: "Control who can message you in Roblox Chat / Parties",
      fallbackOptions: ["AllUsers", "Friends", "NoOne"],
    },
    {
      key: "whoCanWhisperChatWithMeInExperiences",
      label: "In-Game Whisper Chat",
      desc: "Control direct /w whispers inside experiences",
      fallbackOptions: ["AllUsers", "Friends", "NoOne"],
    },
    {
      key: "whoCanInviteMeToPrivateServers",
      label: "Private Server Invites",
      desc: "Who can add you to VIP / private servers",
      fallbackOptions: ["AllUsers", "FriendsFollowingAndFollowers", "FriendsAndFollowing", "Friends", "NoOne"],
    },
    {
      key: "whoCanSeeMyInventory",
      label: "Inventory Visibility",
      desc: "Control who can inspect items in your profile inventory",
      fallbackOptions: ["AllUsers", "FriendsFollowingAndFollowers", "FriendsAndFollowing", "Friends", "NoOne"],
    },
    {
      key: "whoCanTradeWithMe",
      label: "Who Can Trade With Me",
      desc: "Control trade permissions for Limited items",
      fallbackOptions: ["AllUsers", "FriendsFollowingAndFollowers", "FriendsAndFollowing", "Friends", "NoOne"],
    },
    {
      key: "tradeValue",
      label: "Trade Quality Filter",
      desc: "Filter out low-quality automated trade offers",
      fallbackOptions: ["None", "Low", "Medium", "High"],
    },
    {
      key: "themeType",
      label: "Roblox Website Theme",
      desc: "Switch between Dark and Light appearance immediately",
      fallbackOptions: ["Dark", "Light"],
    },
  ];

  const OPTION_LABELS = {
    AllUsers: "Everyone",
    All: "Everyone",
    FriendsFollowingAndFollowers: "Friends, Following & Followers",
    FriendsAndFollowing: "Friends & Following",
    Friends: "Friends Only",
    TopFriends: "Friends Only",
    NoOne: "No One (Disabled / Hidden)",
    Off: "Off",
    Dark: "Dark Mode",
    Light: "Light Mode",
    None: "None",
    Low: "Low",
    Medium: "Medium",
    High: "High",
  };

  const QuickSettings = {
    values: {},
    optionsMap: {},
    loaded: false,

    formatOption(opt) {
      return OPTION_LABELS[opt] || String(opt).replace(/([a-z])([A-Z])/g, "$1 $2");
    },

    async load() {
      const result = await RobloxAPI.getUserSettingsAndOptions();
      const raw = result.data || {};
      const nextValues = {};
      const nextOptions = {};

      for (const def of SETTING_DEFINITIONS) {
        const entry = raw[def.key];
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          const val = entry.currentValue ?? entry.value ?? "";
          const opts = Array.isArray(entry.options)
            ? entry.options.map((o) => (typeof o === "object" ? o.value || o.option : o)).filter(Boolean)
            : def.fallbackOptions;
          if (val !== "") nextValues[def.key] = val;
          nextOptions[def.key] = opts.length ? opts : def.fallbackOptions;
        } else if (entry !== undefined && entry !== null) {
          nextValues[def.key] = String(entry);
          nextOptions[def.key] = def.fallbackOptions;
        } else {
          nextOptions[def.key] = def.fallbackOptions;
        }
      }

      this.values = nextValues;
      this.optionsMap = nextOptions;
      this.loaded = true;
      return { values: this.values, optionsMap: this.optionsMap };
    },

    pickAllowedOption(key, preferredList) {
      const allowed = this.optionsMap[key] || [];
      for (const candidate of preferredList) {
        if (allowed.includes(candidate)) return candidate;
      }
      return preferredList[0];
    },

    applyThemeToDom(theme) {
      const isDark = String(theme).toLowerCase() === "dark";
      const targets = [document.documentElement, document.body, document.getElementById("rbx-body")].filter(Boolean);
      targets.forEach((el) => {
        el.classList.toggle("dark-theme", isDark);
        el.classList.toggle("light-theme", !isDark);
      });
    },

    async update(patch) {
      const res = await RobloxAPI.updateUserSettings(patch);
      if (!res.ok) {
        const msg =
          res.data?.errors?.[0]?.message ||
          res.data?.errorMessage ||
          `Failed to update setting (HTTP ${res.status})`;
        throw new Error(msg);
      }
      Object.assign(this.values, patch);
      if (patch.themeType) {
        this.applyThemeToDom(patch.themeType);
      }
      return this.values;
    },

    isGhostActive() {
      return (
        this.values.whoCanSeeMyOnlineStatus === "NoOne" &&
        this.values.whoCanJoinMeInExperiences === "NoOne"
      );
    },

    isChatMuted() {
      return (
        this.values.whoCanChatWithMeInExperiences === "NoOne" &&
        (!this.values.whoCanChatWithMeInApp || this.values.whoCanChatWithMeInApp === "NoOne")
      );
    },

    async toggleGhostMode() {
      if (!this.loaded) await this.load();
      const settings = Store.getSettings();
      if (this.isGhostActive()) {
        const backup = settings.ghostBackup || {
          whoCanSeeMyOnlineStatus: this.pickAllowedOption("whoCanSeeMyOnlineStatus", ["AllUsers", "Friends"]),
          whoCanJoinMeInExperiences: this.pickAllowedOption("whoCanJoinMeInExperiences", ["Friends", "AllUsers"]),
        };
        await this.update(backup);
        Store.updateSettings({ ghostBackup: null });
        return { active: false };
      } else {
        Store.updateSettings({
          ghostBackup: {
            whoCanSeeMyOnlineStatus: this.values.whoCanSeeMyOnlineStatus || "AllUsers",
            whoCanJoinMeInExperiences: this.values.whoCanJoinMeInExperiences || "Friends",
          },
        });
        await this.update({
          whoCanSeeMyOnlineStatus: "NoOne",
          whoCanJoinMeInExperiences: "NoOne",
        });
        return { active: true };
      }
    },

    async toggleMuteAllChat() {
      if (!this.loaded) await this.load();
      const settings = Store.getSettings();
      if (this.isChatMuted()) {
        const backup = settings.muteChatBackup || {
          whoCanChatWithMeInExperiences: this.pickAllowedOption("whoCanChatWithMeInExperiences", ["AllUsers", "Friends"]),
          whoCanChatWithMeInApp: this.pickAllowedOption("whoCanChatWithMeInApp", ["Friends", "AllUsers"]),
        };
        await this.update(backup);
        Store.updateSettings({ muteChatBackup: null });
        return { muted: false };
      } else {
        const backup = {
          whoCanChatWithMeInExperiences: this.values.whoCanChatWithMeInExperiences || "AllUsers",
        };
        const patch = { whoCanChatWithMeInExperiences: "NoOne" };
        if (this.values.whoCanChatWithMeInApp !== undefined) {
          backup.whoCanChatWithMeInApp = this.values.whoCanChatWithMeInApp;
          patch.whoCanChatWithMeInApp = "NoOne";
        }
        Store.updateSettings({ muteChatBackup: backup });
        await this.update(patch);
        return { muted: true };
      }
    },

    async applyPreset(presetName) {
      if (!this.loaded) await this.load();
      if (presetName === "grinding") {
        return this.update({
          whoCanSeeMyOnlineStatus: this.pickAllowedOption("whoCanSeeMyOnlineStatus", ["Friends", "NoOne"]),
          whoCanJoinMeInExperiences: "NoOne",
          whoCanChatWithMeInExperiences: "NoOne",
          whoCanInviteMeToPrivateServers: "NoOne",
        });
      }
      if (presetName === "friends") {
        return this.update({
          whoCanSeeMyOnlineStatus: this.pickAllowedOption("whoCanSeeMyOnlineStatus", ["Friends", "AllUsers"]),
          whoCanJoinMeInExperiences: this.pickAllowedOption("whoCanJoinMeInExperiences", ["Friends", "AllUsers"]),
          whoCanChatWithMeInExperiences: this.pickAllowedOption("whoCanChatWithMeInExperiences", ["AllUsers", "Friends"]),
          whoCanChatWithMeInApp: this.pickAllowedOption("whoCanChatWithMeInApp", ["Friends", "AllUsers"]),
        });
      }
      if (presetName === "public") {
        return this.update({
          whoCanSeeMyOnlineStatus: this.pickAllowedOption("whoCanSeeMyOnlineStatus", ["AllUsers", "Friends"]),
          whoCanJoinMeInExperiences: this.pickAllowedOption("whoCanJoinMeInExperiences", ["AllUsers", "Friends"]),
          whoCanChatWithMeInExperiences: this.pickAllowedOption("whoCanChatWithMeInExperiences", ["AllUsers", "Friends"]),
        });
      }
    },
  };

  /* ============================================================================
   * 8. TIME IN-GAME TRACKER (Single-Leader Multi-Tab Presence Poller)
   * ============================================================================ */
  const PlaytimeTracker = {
    POLL_INTERVAL_MS: 20000,
    LEADER_TTL_MS: 32000,
    MAX_DELTA_SEC: 45,
    timerId: null,
    livePresence: null,

    getData() {
      return Store.get(STORAGE_KEYS.PLAYTIME, {
        games: {},
        activeSession: null,
        lastLaunchedGame: null,
      });
    },

    tryClaimLeadership() {
      const now = Date.now();
      const lock = Store.get(STORAGE_KEYS.PRESENCE_LEADER, null);
      if (!lock || lock.tabId === TAB_ID || now - (lock.heartbeatAt || 0) > this.LEADER_TTL_MS) {
        Store.set(STORAGE_KEYS.PRESENCE_LEADER, { tabId: TAB_ID, heartbeatAt: now });
        return true;
      }
      return false;
    },

    async poll() {
      if (!this.tryClaimLeadership()) {
        const pt = this.getData();
        this.livePresence = pt.activeSession;
        return;
      }

      const user = AccountManager.activeUser;
      if (!user || !user.id) {
        this.clearActiveSession();
        return;
      }

      try {
        const presences = await RobloxAPI.getPresences([user.id]);
        const p = presences[0];
        if (!p) return;

        const settings = Store.getSettings();
        const isPlayingGame = p.userPresenceType === 2;
        const isInStudio = p.userPresenceType === 3 && settings.trackStudioTime;

        if (!isPlayingGame && !isInStudio) {
          this.clearActiveSession();
          return;
        }

        const now = Date.now();
        const pt = this.getData();
        pt.games = pt.games || {};

        let universeId = p.universeId ? String(p.universeId) : null;
        let placeId = p.placeId || p.rootPlaceId || null;
        let rootPlaceId = p.rootPlaceId || p.placeId || null;
        let gameName = p.lastLocation || "";
        let iconUrl = "";

        // Fallback if privacy settings hide universeId in presence response
        if (!universeId && pt.lastLaunchedGame && now - pt.lastLaunchedGame.launchedAt < 12 * 3600 * 1000) {
          universeId = pt.lastLaunchedGame.universeId
            ? String(pt.lastLaunchedGame.universeId)
            : `place_${pt.lastLaunchedGame.placeId}`;
          placeId = placeId || pt.lastLaunchedGame.placeId;
          rootPlaceId = rootPlaceId || pt.lastLaunchedGame.placeId;
          gameName = gameName || pt.lastLaunchedGame.name;
        }
        if (!universeId) {
          universeId = isInStudio ? "studio_private" : "private_game_session";
          gameName = gameName || (isInStudio ? "Roblox Studio Session" : "Private Experience (Hidden Status)");
        }

        // Enrich metadata from Roblox Games & Thumbnails API when numeric universeId exists
        if (/^\d+$/.test(universeId)) {
          const existingRecord = pt.games[universeId];
          if (!existingRecord || !existingRecord.iconUrl || !existingRecord.name) {
            const metaMap = await RobloxAPI.getGameMeta([universeId]);
            const meta = metaMap[universeId];
            if (meta) {
              gameName = meta.name || gameName;
              iconUrl = meta.iconUrl || "";
              rootPlaceId = meta.rootPlaceId || rootPlaceId;
            }
          } else {
            gameName = existingRecord.name || gameName;
            iconUrl = existingRecord.iconUrl || "";
            rootPlaceId = existingRecord.rootPlaceId || rootPlaceId;
          }
        }

        if (!pt.games[universeId]) {
          pt.games[universeId] = {
            universeId,
            rootPlaceId: rootPlaceId || placeId || null,
            placeId: placeId || null,
            name: gameName || `Experience ${universeId}`,
            iconUrl,
            totalSeconds: 0,
            studioSeconds: 0,
            sessions: 0,
            lastPlayedAt: now,
            byAccount: {},
          };
        }

        const record = pt.games[universeId];
        if (gameName && (!record.name || record.name.startsWith("Experience "))) record.name = gameName;
        if (iconUrl) record.iconUrl = iconUrl;
        if (rootPlaceId) record.rootPlaceId = rootPlaceId;
        if (placeId) record.placeId = placeId;
        record.lastPlayedAt = now;

        const prevSession = pt.activeSession;
        const isSameSession =
          prevSession &&
          String(prevSession.userId) === String(user.id) &&
          String(prevSession.universeId) === String(universeId) &&
          prevSession.presenceType === p.userPresenceType;

        if (isSameSession) {
          const rawDelta = Math.round((now - (prevSession.lastTickAt || now)) / 1000);
          const deltaSec = Math.max(0, Math.min(rawDelta, this.MAX_DELTA_SEC));
          if (isInStudio) {
            record.studioSeconds = (record.studioSeconds || 0) + deltaSec;
          } else {
            record.totalSeconds = (record.totalSeconds || 0) + deltaSec;
          }
          record.byAccount = record.byAccount || {};
          record.byAccount[user.id] = (record.byAccount[user.id] || 0) + deltaSec;

          pt.activeSession = Object.assign({}, prevSession, {
            placeId: placeId || prevSession.placeId,
            rootPlaceId: rootPlaceId || prevSession.rootPlaceId,
            gameId: p.gameId || prevSession.gameId || null,
            name: record.name,
            iconUrl: record.iconUrl,
            lastTickAt: now,
          });
        } else {
          record.sessions = (record.sessions || 0) + 1;
          pt.activeSession = {
            userId: user.id,
            username: user.name,
            universeId,
            rootPlaceId: rootPlaceId || placeId || null,
            placeId: placeId || null,
            gameId: p.gameId || null,
            name: record.name,
            iconUrl: record.iconUrl,
            presenceType: p.userPresenceType,
            startedAt: now,
            lastTickAt: now,
          };
        }

        this.livePresence = pt.activeSession;
        Store.set(STORAGE_KEYS.PLAYTIME, pt);
      } catch (e) {
        console.debug("[RTK] Presence poll error:", e);
      }
    },

    clearActiveSession() {
      const pt = this.getData();
      if (pt.activeSession) {
        pt.activeSession = null;
        Store.set(STORAGE_KEYS.PLAYTIME, pt);
      }
      this.livePresence = null;
    },

    start() {
      this.poll();
      if (this.timerId) clearInterval(this.timerId);
      this.timerId = setInterval(() => this.poll(), this.POLL_INTERVAL_MS);
    },

    getLiveSessionElapsed(session) {
      if (!session || !session.startedAt) return 0;
      return Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
    },

    getSortedGames({ accountId = "all", sortBy = "time", search = "" } = {}) {
      const pt = this.getData();
      const active = pt.activeSession;
      const liveExtra =
        active && active.lastTickAt
          ? Math.max(0, Math.min(30, Math.floor((Date.now() - active.lastTickAt) / 1000)))
          : 0;

      const q = search.trim().toLowerCase();
      const list = Object.values(pt.games || {})
        .map((g) => {
          const isCurrent = active && String(active.universeId) === String(g.universeId);
          let seconds =
            accountId === "all"
              ? (g.totalSeconds || 0) + (g.studioSeconds || 0)
              : g.byAccount?.[accountId] || 0;
          if (isCurrent && (accountId === "all" || String(active.userId) === String(accountId))) {
            seconds += liveExtra;
          }
          return Object.assign({}, g, {
            computedSeconds: seconds,
            isCurrentlyPlaying: Boolean(isCurrent),
          });
        })
        .filter((g) => {
          if (accountId !== "all" && g.computedSeconds <= 0 && !g.isCurrentlyPlaying) return false;
          if (q && !String(g.name || "").toLowerCase().includes(q) && !String(g.universeId).includes(q)) {
            return false;
          }
          return true;
        });

      if (sortBy === "recent") {
        list.sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0));
      } else if (sortBy === "name") {
        list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      } else {
        // Default: sort descending by playtime
        list.sort((a, b) => b.computedSeconds - a.computedSeconds || (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0));
      }
      return { list, activeSession: active };
    },

    resetAll() {
      const pt = this.getData();
      pt.games = {};
      Store.set(STORAGE_KEYS.PLAYTIME, pt);
    },
  };

  /* ============================================================================
   * 9. DEVELOPER TOOLS ENGINE (Inspector, Decal->Image, Raw Asset DL, API Console)
   * ============================================================================ */
  const DevTools = {
    detectUrlContext() {
      const path = window.location.pathname;
      const patterns = [
        { type: "game", regex: /\/games\/(\d+)/i },
        { type: "asset", regex: /\/(?:catalog|library)\/(\d+)/i },
        { type: "asset", regex: /\/store\/asset\/(\d+)/i },
        { type: "bundle", regex: /\/bundles\/(\d+)/i },
        { type: "user", regex: /\/users\/(\d+)/i },
        { type: "group", regex: /\/(?:communities|groups)\/(\d+)/i },
        { type: "gamepass", regex: /\/game-pass\/(\d+)/i },
        { type: "badge", regex: /\/badges\/(\d+)/i },
      ];
      for (const p of patterns) {
        const m = path.match(p.regex);
        if (m && m[1]) return { type: p.type, id: m[1] };
      }
      return { type: "general", id: null };
    },

    async inspectCurrentPage() {
      const ctx = this.detectUrlContext();
      const pt = PlaytimeTracker.getData();
      const result = {
        contextType: ctx.type,
        primaryId: ctx.id,
        fields: [],
        gameMeta: null,
        liveJobId: pt.activeSession?.gameId || null,
        livePlaceId: pt.activeSession?.placeId || null,
      };

      if (ctx.type === "game" && ctx.id) {
        const placeId = ctx.id;
        result.fields.push({ label: "Place ID", value: placeId, copy: true });
        const universeId = await RobloxAPI.getUniverseId(placeId);
        if (universeId) {
          result.fields.push({ label: "Universe ID", value: String(universeId), copy: true });
          const metaMap = await RobloxAPI.getGameMeta([universeId]);
          const g = metaMap[universeId];
          if (g) {
            result.gameMeta = g;
            if (g.rootPlaceId) result.fields.push({ label: "Root Place ID", value: String(g.rootPlaceId), copy: true });
            if (g.creator) {
              result.fields.push({
                label: `Creator (${g.creator.type})`,
                value: `${g.creator.name} (${g.creator.id})`,
                copyVal: String(g.creator.id),
                copy: true,
              });
            }
            result.fields.push({ label: "Active Players", value: Number(g.playing || 0).toLocaleString(), copy: false });
            result.fields.push({ label: "Max Server Size", value: String(g.maxPlayers || "?"), copy: false });
            result.fields.push({ label: "Avatar Rig", value: g.universeAvatarType || "Unknown", copy: false });
            result.fields.push({ label: "Genre", value: g.genre || "All", copy: false });
            if (g.updated) {
              result.fields.push({ label: "Last Updated", value: new Date(g.updated).toLocaleString(), copy: false });
            }
          }
        }
      } else if (ctx.type === "asset" && ctx.id) {
        result.fields.push({ label: "Asset ID", value: ctx.id, copy: true });
        result.fields.push({ label: "Content URI", value: `rbxassetid://${ctx.id}`, copy: true });
        const details = await RobloxAPI.getAssetDetails(ctx.id);
        if (details.ok && details.data) {
          const d = details.data;
          result.fields.push({ label: "Name", value: d.Name || "", copy: false });
          result.fields.push({ label: "AssetTypeId", value: String(d.AssetTypeId ?? ""), copy: true });
          if (d.Creator) {
            result.fields.push({
              label: `Creator (${d.Creator.CreatorType})`,
              value: `${d.Creator.Name} (${d.Creator.CreatorTargetId})`,
              copyVal: String(d.Creator.CreatorTargetId),
              copy: true,
            });
          }
          if (d.PriceInRobux !== null && d.PriceInRobux !== undefined) {
            result.fields.push({ label: "Price (R$)", value: String(d.PriceInRobux), copy: false });
          }
        }
      } else if (ctx.id) {
        result.fields.push({
          label: `${ctx.type.toUpperCase()} ID`,
          value: ctx.id,
          copy: true,
        });
      }

      if (AccountManager.activeUser) {
        result.fields.push({
          label: "Authenticated User ID",
          value: String(AccountManager.activeUser.id),
          copy: true,
        });
      }

      return result;
    },

    detectAssetMagicFormat(uint8) {
      const head = new TextDecoder("latin1").decode(uint8.slice(0, 32));
      if (head.startsWith("<roblox!")) return { ext: "rbxm", kind: "Binary Roblox Model (.rbxm)", mime: "application/octet-stream" };
      if (head.trimStart().startsWith("<roblox")) return { ext: "rbxmx", kind: "XML Roblox Asset (.rbxmx)", mime: "application/xml" };
      if (uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4e && uint8[3] === 0x47) {
        return { ext: "png", kind: "PNG Image (.png)", mime: "image/png" };
      }
      if (uint8[0] === 0xff && uint8[1] === 0xd8 && uint8[2] === 0xff) {
        return { ext: "jpg", kind: "JPEG Image (.jpg)", mime: "image/jpeg" };
      }
      if (head.startsWith("OggS")) return { ext: "ogg", kind: "Ogg Vorbis Audio (.ogg)", mime: "audio/ogg" };
      if (head.startsWith("ID3") || (uint8[0] === 0xff && (uint8[1] & 0xe0) === 0xe0)) {
        return { ext: "mp3", kind: "MP3 Audio (.mp3)", mime: "audio/mpeg" };
      }
      if (head.startsWith("version ")) return { ext: "mesh", kind: "Roblox Mesh (.mesh)", mime: "application/octet-stream" };
      if (head.startsWith("glTF")) return { ext: "glb", kind: "glTF Binary (.glb)", mime: "model/gltf-binary" };
      return { ext: "rbxm", kind: "Raw Binary Stream", mime: "application/octet-stream" };
    },

    async inspectAssetAndExtractIds(rawAssetId) {
      const cleanId = String(rawAssetId || "").replace(/\D/g, "");
      if (!cleanId) throw new Error("Enter a numeric Asset ID.");

      const [detailsRes, rawRes] = await Promise.all([
        RobloxAPI.getAssetDetails(cleanId).catch(() => ({ ok: false })),
        RobloxAPI.fetchRawAssetBuffer(cleanId),
      ]);

      if (!rawRes.ok || !rawRes.raw) {
        throw new Error(`Could not fetch raw asset delivery stream (HTTP ${rawRes.status}).`);
      }

      const uint8 = new Uint8Array(rawRes.raw);
      const format = this.detectAssetMagicFormat(uint8);
      const decoded = new TextDecoder("latin1").decode(uint8);

      // Extract embedded rbxassetid://12345 or ?id=12345 references (Decal->Image, Shirt->Template, Mesh->Texture, etc.)
      const extractedIds = new Set();
      const uriMatches = decoded.matchAll(/(?:rbxassetid:\/\/|asset\/\?id=|id=)(\d{4,20})/gi);
      for (const m of uriMatches) {
        if (m[1] && m[1] !== cleanId) extractedIds.add(m[1]);
      }

      return {
        assetId: cleanId,
        name: detailsRes.ok ? detailsRes.data?.Name || `Asset_${cleanId}` : `Asset_${cleanId}`,
        assetTypeId: detailsRes.ok ? detailsRes.data?.AssetTypeId : null,
        creator: detailsRes.ok ? detailsRes.data?.Creator?.Name : null,
        byteSize: uint8.byteLength,
        format,
        extractedIds: Array.from(extractedIds),
        buffer: rawRes.raw,
      };
    },

    triggerBlobDownload(buffer, filename, mime = "application/octet-stream") {
      const blob = new Blob([buffer], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },

    generateLuauSnippets() {
      const ctx = this.detectUrlContext();
      const pt = PlaytimeTracker.getData();
      const placeId = ctx.type === "game" ? ctx.id : pt.activeSession?.placeId || "PLACE_ID";
      const jobId = pt.activeSession?.gameId || "JOB_ID_UUID";
      const assetId = ctx.type === "asset" ? ctx.id : "ASSET_ID";

      return [
        {
          title: "Teleport to Specific Server Instance (JobId)",
          code: `local TeleportService = game:GetService("TeleportService")\nTeleportService:TeleportToPlaceInstance(${placeId}, "${jobId}", player)`,
        },
        {
          title: "Prompt Asset / GamePass Purchase",
          code: `local MarketplaceService = game:GetService("MarketplaceService")\nMarketplaceService:PromptPurchase(player, ${assetId})`,
        },
        {
          title: "Load Asset Server-Side (InsertService)",
          code: `local InsertService = game:GetService("InsertService")\nlocal model = InsertService:LoadAsset(${assetId})\nmodel.Parent = workspace`,
        },
        {
          title: "High-Res Thumbnail URI (rbxthumb)",
          code: `"rbxthumb://type=Asset&id=${assetId}&w=420&h=420"`,
        },
      ];
    },

    buildCodeFromApiCall(method, url, bodyStr) {
      const m = method.toUpperCase();
      const hasBody = m !== "GET" && m !== "HEAD" && bodyStr.trim();
      const fetchCode = `const res = await fetch(${JSON.stringify(url)}, {\n  method: ${JSON.stringify(m)},\n  credentials: "include",\n  headers: { "Content-Type": "application/json" }${hasBody ? `,\n  body: ${JSON.stringify(bodyStr.trim())}` : ""}\n});\nconst data = await res.json();`;
      const luauCode = `local HttpService = game:GetService("HttpService")\nlocal response = HttpService:RequestAsync({\n  Url = ${JSON.stringify(url)},\n  Method = ${JSON.stringify(m)},\n  Headers = { ["Content-Type"] = "application/json" }${hasBody ? `,\n  Body = [[${bodyStr.trim()}]]` : ""}\n})\nprint(response.StatusCode, response.Body)`;
      return { fetchCode, luauCode };
    },
  };

  /* ============================================================================
   * 10. SHADOW-DOM COMMAND HUB UI & TOAST SYSTEM
   * ============================================================================ */
  const HUB_CSS = `
    :host {
      all: initial;
      font-family: "Builder Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #f1f5f9;
      font-size: 13px;
      line-height: 1.45;
    }
    * { box-sizing: border-box; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 3px; }

    .rtk-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(2px);
      z-index: 2147483640;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease;
    }
    .rtk-backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    .rtk-drawer {
      position: fixed;
      top: 0;
      right: 0;
      width: 480px;
      max-width: 96vw;
      height: 100vh;
      background: #141619;
      border-left: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: -12px 0 36px rgba(0, 0, 0, 0.6);
      z-index: 2147483641;
      display: flex;
      flex-direction: column;
      transform: translateX(104%);
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .rtk-drawer.open {
      transform: translateX(0);
    }

    .rtk-header {
      padding: 14px 18px;
      background: #191c20;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .rtk-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 15px;
      color: #ffffff;
    }
    .rtk-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(0, 176, 111, 0.18);
      color: #34d399;
      border: 1px solid rgba(0, 176, 111, 0.35);
    }
    .rtk-close-btn {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: #cbd5e1;
      width: 30px;
      height: 30px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .rtk-close-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }

    .rtk-tabs {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      background: #191c20;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding: 0 8px;
      gap: 2px;
    }
    .rtk-tab {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: #94a3b8;
      padding: 10px 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      white-space: nowrap;
      transition: color 0.15s, border-color 0.15s;
    }
    .rtk-tab:hover { color: #e2e8f0; }
    .rtk-tab.active {
      color: #00d284;
      border-bottom-color: #00b06f;
    }

    .rtk-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .rtk-card {
      background: #1d2025;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 14px;
    }
    .rtk-card-title {
      font-size: 13px;
      font-weight: 700;
      color: #f8fafc;
      margin: 0 0 10px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .rtk-muted { color: #94a3b8; font-size: 12px; }

    .rtk-row { display: flex; gap: 8px; align-items: center; }
    .rtk-col { display: flex; flex-direction: column; gap: 8px; }
    .rtk-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

    .rtk-input, .rtk-select, .rtk-textarea {
      width: 100%;
      background: #121417;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #f1f5f9;
      border-radius: 7px;
      padding: 8px 10px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
    }
    .rtk-textarea {
      min-height: 70px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    .rtk-input:focus, .rtk-select:focus, .rtk-textarea:focus {
      border-color: #00b06f;
      box-shadow: 0 0 0 2px rgba(0, 176, 111, 0.2);
    }

    .rtk-btn {
      height: 34px;
      padding: 0 12px;
      border-radius: 7px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: #272b32;
      color: #f1f5f9;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      white-space: nowrap;
      transition: background 0.14s, border-color 0.14s;
    }
    .rtk-btn:hover { background: #323741; }
    .rtk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .rtk-btn-primary {
      background: #00b06f;
      border-color: #00b06f;
      color: #ffffff;
    }
    .rtk-btn-primary:hover { background: #009960; }
    .rtk-btn-danger {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.35);
      color: #fca5a5;
    }
    .rtk-btn-danger:hover { background: rgba(239, 68, 68, 0.28); }
    .rtk-btn-sm { height: 27px; padding: 0 9px; font-size: 11px; border-radius: 6px; }

    .rtk-alert {
      padding: 11px 12px;
      border-radius: 8px;
      font-size: 12px;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: #fde68a;
    }

    .rtk-hero-toggle {
      padding: 12px;
      border-radius: 9px;
      border: 1px solid rgba(255,255,255,0.1);
      background: #16191d;
      cursor: pointer;
      text-align: left;
      color: #f1f5f9;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: border-color 0.15s, background 0.15s;
    }
    .rtk-hero-toggle:hover { border-color: rgba(255,255,255,0.24); }
    .rtk-hero-toggle.active {
      background: rgba(0, 176, 111, 0.14);
      border-color: #00b06f;
    }

    .rtk-acc-item, .rtk-game-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      border-radius: 8px;
      background: #15181c;
      border: 1px solid rgba(255,255,255,0.07);
    }
    .rtk-acc-item.current {
      border-color: rgba(0, 176, 111, 0.55);
      background: rgba(0, 176, 111, 0.07);
    }
    .rtk-avatar {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: #262a31;
      object-fit: cover;
      flex-shrink: 0;
    }
    .rtk-flex-1 { flex: 1; min-width: 0; }
    .rtk-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .rtk-kv-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      gap: 8px;
    }
    .rtk-kv-row:last-child { border-bottom: none; }

    .rtk-code {
      background: #0f1114;
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 7px;
      padding: 9px 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11.5px;
      color: #cbd5e1;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 240px;
    }

    .rtk-switch-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 0;
    }

    .rtk-toast-wrap {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483645;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 380px;
    }
    .rtk-toast {
      background: #1b1f24;
      border: 1px solid rgba(255,255,255,0.14);
      border-left: 4px solid #00b06f;
      color: #f8fafc;
      padding: 11px 14px;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      font-size: 12.5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .rtk-toast.error { border-left-color: #ef4444; }
    .rtk-toast.info { border-left-color: #3b82f6; }

    .rtk-floating-pill {
      position: fixed;
      bottom: 18px;
      left: 18px;
      z-index: 2147483630;
      background: #191c20;
      border: 1px solid rgba(255,255,255,0.16);
      color: #f1f5f9;
      height: 36px;
      padding: 0 13px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .rtk-floating-pill:hover { border-color: #00b06f; }
    .rtk-dot-live {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #00d284;
      box-shadow: 0 0 8px #00d284;
    }
  `;

  const HubUI = {
    host: null,
    shadow: null,
    isOpen: false,
    activeTab: "joiner",
    playtimeFilterAcc: "all",
    playtimeSort: "time",
    playtimeSearch: "",
    accSearch: "",
    liveTickInterval: null,

    init() {
      if (this.host) return;
      this.host = document.createElement("div");
      this.host.id = "rtk-shadow-host";
      this.shadow = this.host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = HUB_CSS;
      this.shadow.appendChild(style);

      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
        <div class="rtk-backdrop" id="rtk-backdrop"></div>
        <aside class="rtk-drawer" id="rtk-drawer" aria-label="Roblox Multi-Tool">
          <div class="rtk-header">
            <div class="rtk-brand">
              <span>🧰 RoToolkit</span>
              <span class="rtk-badge">v${APP_VERSION}</span>
            </div>
            <div class="rtk-row">
              <span class="rtk-muted" title="Keyboard Shortcut">Alt+R</span>
              <button class="rtk-close-btn" id="rtk-close" title="Close">✕</button>
            </div>
          </div>
          <nav class="rtk-tabs" id="rtk-tabs">
            <button class="rtk-tab active" data-tab="joiner">🚀 Joiner</button>
            <button class="rtk-tab" data-tab="accounts">👥 Accounts</button>
            <button class="rtk-tab" data-tab="settings">⚡ Settings</button>
            <button class="rtk-tab" data-tab="playtime">⏱️ Playtime</button>
            <button class="rtk-tab" data-tab="devtools">🛠️ Dev</button>
          </nav>
          <div class="rtk-body" id="rtk-body"></div>
        </aside>
        <div class="rtk-toast-wrap" id="rtk-toasts"></div>
        <button class="rtk-floating-pill" id="rtk-pill" title="Open RoToolkit (Alt+R)" style="display:none;">
          <span id="rtk-pill-dot" style="display:none;" class="rtk-dot-live"></span>
          <span>🧰 Toolkit</span>
        </button>
      `;
      this.shadow.appendChild(wrapper);
      document.documentElement.appendChild(this.host);

      this.shadow.getElementById("rtk-backdrop").addEventListener("click", () => this.toggle(false));
      this.shadow.getElementById("rtk-close").addEventListener("click", () => this.toggle(false));
      this.shadow.getElementById("rtk-pill").addEventListener("click", () => this.toggle(true));

      this.shadow.getElementById("rtk-tabs").addEventListener("click", (e) => {
        const btn = e.target.closest(".rtk-tab");
        if (btn && btn.dataset.tab) {
          this.switchTab(btn.dataset.tab);
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.altKey && (e.key === "r" || e.key === "R")) {
          e.preventDefault();
          this.toggle();
        } else if (e.key === "Escape" && this.isOpen) {
          this.toggle(false);
        }
      });

      // Live 1-second ticker for Playtime UI & live indicator dot
      this.liveTickInterval = setInterval(() => this.onSecondTick(), 1000);
    },

    toast(message, type = "success", action = null, durationMs = 4500) {
      if (!this.shadow) this.init();
      const wrap = this.shadow.getElementById("rtk-toasts");
      const el = document.createElement("div");
      el.className = `rtk-toast ${type}`;
      const span = document.createElement("span");
      span.textContent = message;
      el.appendChild(span);

      if (action && action.label && typeof action.onClick === "function") {
        const btn = document.createElement("button");
        btn.className = "rtk-btn rtk-btn-sm rtk-btn-primary";
        btn.textContent = action.label;
        btn.addEventListener("click", () => {
          action.onClick();
          el.remove();
        });
        el.appendChild(btn);
      }

      wrap.appendChild(el);
      if (durationMs > 0) {
        setTimeout(() => el.remove(), durationMs);
      }
      return el;
    },

    toggle(forceState) {
      if (!this.shadow) this.init();
      this.isOpen = typeof forceState === "boolean" ? forceState : !this.isOpen;
      this.shadow.getElementById("rtk-backdrop").classList.toggle("open", this.isOpen);
      this.shadow.getElementById("rtk-drawer").classList.toggle("open", this.isOpen);
      if (this.isOpen) {
        this.renderActiveTab();
      }
    },

    openTab(tabName) {
      this.activeTab = tabName;
      this.updateTabButtons();
      this.toggle(true);
    },

    switchTab(tabName) {
      this.activeTab = tabName;
      this.updateTabButtons();
      this.renderActiveTab();
    },

    updateTabButtons() {
      if (!this.shadow) return;
      this.shadow.querySelectorAll(".rtk-tab").forEach((b) => {
        b.classList.toggle("active", b.dataset.tab === this.activeTab);
      });
    },

    onSecondTick() {
      const pt = PlaytimeTracker.getData();
      const active = pt.activeSession;

      // Update live dot on navbar button & fallback pill
      const navDot = document.getElementById("rtk-navbar-live-dot");
      if (navDot) navDot.style.display = active ? "inline-block" : "none";
      const pillDot = this.shadow?.getElementById("rtk-pill-dot");
      if (pillDot) pillDot.style.display = active ? "inline-block" : "none";

      if (this.isOpen && this.activeTab === "playtime" && active) {
        const el = this.shadow.getElementById("rtk-live-session-timer");
        if (el) {
          el.textContent = Utils.formatDuration(PlaytimeTracker.getLiveSessionElapsed(active));
        }
      }
    },

    buildAccountOptionsHtml(selectedId = "current") {
      const cur = AccountManager.activeUser;
      const curLabel = cur ? `Current (@${Utils.escapeHtml(cur.name)})` : "Current Session";
      let html = `<option value="current" ${selectedId === "current" ? "selected" : ""}>${curLabel}</option>`;
      for (const acc of AccountManager.getList()) {
        if (cur && String(acc.userId) === String(cur.id)) continue;
        const tag = acc.note ? ` [${Utils.escapeHtml(acc.note)}]` : "";
        html += `<option value="${Utils.escapeHtml(acc.userId)}" ${String(selectedId) === String(acc.userId) ? "selected" : ""}>@${Utils.escapeHtml(acc.username)}${tag}</option>`;
      }
      return html;
    },

    renderActiveTab() {
      const body = this.shadow.getElementById("rtk-body");
      if (!body) return;
      if (this.activeTab === "joiner") this.renderJoinerTab(body);
      else if (this.activeTab === "accounts") this.renderAccountsTab(body);
      else if (this.activeTab === "settings") this.renderSettingsTab(body);
      else if (this.activeTab === "playtime") this.renderPlaytimeTab(body);
      else if (this.activeTab === "devtools") this.renderDevToolsTab(body);
    },

    /* ---------------- TAB 1: JOINER & SERVERS ---------------- */
    renderJoinerTab(body) {
      const pagePlaceId = Utils.getPlaceIdFromPage() || "";
      const recent = Store.get(STORAGE_KEYS.RECENT_SERVERS, []);
      const activeSession = PlaytimeTracker.getData().activeSession;

      body.innerHTML = `
        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Direct Job ID & Account Launcher</span>
            ${pagePlaceId ? `<span class="rtk-badge">Place #${Utils.escapeHtml(pagePlaceId)}</span>` : ""}
          </div>
          <div class="rtk-col">
            <label class="rtk-muted">Place ID</label>
            <input class="rtk-input" id="j-place" placeholder="e.g. 920587237" value="${Utils.escapeHtml(pagePlaceId)}" />
          </div>
          <div class="rtk-col">
            <label class="rtk-muted">Server Job ID (Optional — leave blank to join any open server)</label>
            <input class="rtk-input" id="j-job" placeholder="Paste UUID (e.g. 9134c999-91d5-4b52-9f0a-f7cbae67fe77)..." />
          </div>
          <div class="rtk-col">
            <label class="rtk-muted">Join Using Account</label>
            <select class="rtk-select" id="j-account">${this.buildAccountOptionsHtml()}</select>
          </div>
          <div class="rtk-row" style="margin-top:4px;">
            <button class="rtk-btn rtk-btn-primary rtk-flex-1" id="j-launch-btn">▶ Launch Roblox</button>
          </div>
          <div class="rtk-grid-2">
            <button class="rtk-btn" id="j-smallest-btn">👥 Join Smallest Server</button>
            <button class="rtk-btn" id="j-ping-btn">⚡ Join Lowest Ping</button>
          </div>
        </div>

        ${activeSession && activeSession.gameId ? `
          <div class="rtk-card rtk-col">
            <div class="rtk-card-title">
              <span>🟢 Your Active Server Instance</span>
            </div>
            <div class="rtk-muted">${Utils.escapeHtml(activeSession.name || "In-Game")} — Job ID:</div>
            <div class="rtk-code">${Utils.escapeHtml(activeSession.gameId)}</div>
            <div class="rtk-grid-2">
              <button class="rtk-btn" id="j-copy-live-job">📋 Copy Live JobId</button>
              <button class="rtk-btn" id="j-copy-live-link">🔗 Copy Direct Share Link</button>
            </div>
          </div>
        ` : ""}

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>🕒 Recent Joined Servers</span>
            ${recent.length ? `<button class="rtk-btn rtk-btn-sm" id="j-clear-recent">Clear</button>` : ""}
          </div>
          ${recent.length === 0
            ? `<div class="rtk-muted">Servers you join by Job ID will appear here for 1-click rejoining.</div>`
            : recent.map((item, idx) => `
              <div class="rtk-acc-item" data-recent-idx="${idx}">
                <div class="rtk-flex-1">
                  <div style="font-weight:600;" class="rtk-ellipsis">${Utils.escapeHtml(item.gameName || `Place ${item.placeId}`)}</div>
                  <div class="rtk-muted rtk-ellipsis">${Utils.escapeHtml(item.jobId.slice(0, 18))}... • @${Utils.escapeHtml(item.accountName)} • ${Utils.timeAgo(item.joinedAt)}</div>
                </div>
                <button class="rtk-btn rtk-btn-sm" data-copy-job="${Utils.escapeHtml(item.jobId)}">Copy</button>
                <button class="rtk-btn rtk-btn-sm rtk-btn-primary" data-rejoin-place="${Utils.escapeHtml(item.placeId)}" data-rejoin-job="${Utils.escapeHtml(item.jobId)}">Rejoin</button>
              </div>
            `).join("")}
        </div>
      `;

      const getInputs = () => ({
        placeId: body.querySelector("#j-place").value.trim(),
        jobId: body.querySelector("#j-job").value.trim(),
        accId: body.querySelector("#j-account").value,
      });

      body.querySelector("#j-launch-btn").addEventListener("click", async () => {
        const { placeId, jobId, accId } = getInputs();
        try {
          await Launcher.join(placeId, jobId || null, accId);
          this.toast("Launching Roblox client...", "success");
        } catch (err) {
          this.toast(err.message, "error");
        }
      });

      body.querySelector("#j-smallest-btn").addEventListener("click", async (e) => {
        const { placeId, accId } = getInputs();
        if (!placeId) return this.toast("Enter a Place ID first.", "error");
        e.currentTarget.disabled = true;
        try {
          const s = await Launcher.joinSmallestServer(placeId, accId);
          this.toast(`Joining smallest server (${s.playing}/${s.maxPlayers} players)...`, "success");
        } catch (err) {
          this.toast(err.message, "error");
        } finally {
          e.currentTarget.disabled = false;
        }
      });

      body.querySelector("#j-ping-btn").addEventListener("click", async (e) => {
        const { placeId, accId } = getInputs();
        if (!placeId) return this.toast("Enter a Place ID first.", "error");
        e.currentTarget.disabled = true;
        try {
          const s = await Launcher.joinLowestPingServer(placeId, accId);
          this.toast(`Joining lowest ping server (${s.ping} ms)...`, "success");
        } catch (err) {
          this.toast(err.message, "error");
        } finally {
          e.currentTarget.disabled = false;
        }
      });

      body.querySelector("#j-copy-live-job")?.addEventListener("click", async () => {
        await Utils.copyText(activeSession.gameId);
        this.toast("Copied live Job ID!", "success");
      });

      body.querySelector("#j-copy-live-link")?.addEventListener("click", async () => {
        const pId = activeSession.placeId || activeSession.rootPlaceId || pagePlaceId;
        const link = `https://www.roblox.com/games/${pId}/-?serverJobId=${activeSession.gameId}`;
        await Utils.copyText(link);
        this.toast("Copied direct share URL!", "success");
      });

      body.querySelector("#j-clear-recent")?.addEventListener("click", () => {
        Store.set(STORAGE_KEYS.RECENT_SERVERS, []);
        this.renderJoinerTab(body);
      });

      body.querySelectorAll("[data-copy-job]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await Utils.copyText(btn.dataset.copyJob);
          this.toast("Job ID copied!", "success");
        });
      });

      body.querySelectorAll("[data-rejoin-job]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const accId = body.querySelector("#j-account").value;
          try {
            await Launcher.join(btn.dataset.rejoinPlace, btn.dataset.rejoinJob, accId);
            this.toast("Rejoining server...", "success");
          } catch (err) {
            this.toast(err.message, "error");
          }
        });
      });
    },

    /* ---------------- TAB 2: ACCOUNT VAULT & SWITCHER ---------------- */
    renderAccountsTab(body) {
      const settings = Store.getSettings();
      const cur = AccountManager.activeUser;
      const diag = AccountManager.cookieStatus;
      const q = this.accSearch.trim().toLowerCase();
      const accounts = AccountManager.getList().filter((a) => {
        if (!q) return true;
        return (
          String(a.username || "").toLowerCase().includes(q) ||
          String(a.displayName || "").toLowerCase().includes(q) ||
          String(a.note || "").toLowerCase().includes(q) ||
          String(a.userId || "").includes(q)
        );
      });

      body.innerHTML = `
        ${!diag.ok ? `
          <div class="rtk-alert rtk-col">
            <strong>⚠️ Enable HttpOnly Cookie Access for Real-Time Swapping</strong>
            <div>Roblox marks <code>.ROBLOSECURITY</code> as <code>HttpOnly</code>. Enable cookie access once in your extension settings:</div>
            <div>• <b>Violentmonkey</b>: Dashboard → ⚙️ Settings → Advanced → Enable <b>HTTP-Only cookies</b> (and allow in script settings if prompted).</div>
            <div>• <b>Tampermonkey</b>: Dashboard → Settings → Config Mode: <b>Advanced</b> → Security → Set <b>Allow scripts to access cookies</b> to <b>All</b>.</div>
            <button class="rtk-btn rtk-btn-sm" id="acc-recheck-btn" style="align-self:flex-start;">🔄 Re-check Permission</button>
          </div>
        ` : ""}

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Active Browser Account</span>
            <span class="rtk-badge">${cur ? "Logged In" : "Logged Out"}</span>
          </div>
          ${cur ? `
            <div class="rtk-acc-item current">
              <img class="rtk-avatar" src="${Utils.escapeHtml(cur.avatarUrl || "https://www.roblox.com/favicon.ico")}" alt="" />
              <div class="rtk-flex-1">
                <div style="font-weight:700;">${Utils.escapeHtml(cur.displayName)}</div>
                <div class="rtk-muted">@${Utils.escapeHtml(cur.name)} • ID ${Utils.escapeHtml(cur.id)}</div>
              </div>
            </div>
          ` : `<div class="rtk-muted">No active Roblox account in browser. Select an account below or log in.</div>`}
          <div class="rtk-grid-2">
            <button class="rtk-btn rtk-btn-primary" id="acc-capture-now">💾 Save Active Cookie</button>
            <button class="rtk-btn" id="acc-clean-login" title="Backs up current cookie and clears session WITHOUT invalidating token">➕ Clean Login (Add Alt)</button>
          </div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title"><span>Automation & Safety</span></div>
          <label class="rtk-switch-row">
            <span><b>Auto-Capture Active Account</b><br/><span class="rtk-muted">Automatically store/refresh cookie of logged-in account</span></span>
            <input type="checkbox" id="acc-opt-auto" ${settings.autoCaptureAccounts ? "checked" : ""} />
          </label>
          <label class="rtk-switch-row">
            <span><b>Native Logout Guard</b><br/><span class="rtk-muted">Warn before Roblox's Log Out invalidates saved cookies</span></span>
            <input type="checkbox" id="acc-opt-guard" ${settings.logoutGuard ? "checked" : ""} />
          </label>
          <label class="rtk-switch-row">
            <span><b>Auto-Restore Account After "Join As"</b><br/><span class="rtk-muted">Offer/restore previous browser account after game launches</span></span>
            <input type="checkbox" id="acc-opt-restore" ${settings.restoreAccountAfterJoin ? "checked" : ""} />
          </label>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title"><span>Add Account Manually (.ROBLOSECURITY)</span></div>
          <input type="password" class="rtk-input" id="acc-manual-cookie" placeholder="Paste _|WARNING:-DO-NOT-SHARE-THIS...|_ cookie..." autocomplete="off" />
          <div class="rtk-row">
            <input type="text" class="rtk-input rtk-flex-1" id="acc-manual-note" placeholder="Optional label (e.g. Main, Alt, Dev)" />
            <button class="rtk-btn rtk-btn-primary" id="acc-manual-add-btn">Add Account</button>
          </div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Stored Accounts (${AccountManager.getList().length})</span>
            <div class="rtk-row">
              <button class="rtk-btn rtk-btn-sm" id="acc-export-btn" title="Export JSON backup">Export</button>
              <button class="rtk-btn rtk-btn-sm" id="acc-import-btn" title="Import JSON backup">Import</button>
            </div>
          </div>
          <input class="rtk-input" id="acc-search" placeholder="Search saved accounts or labels..." value="${Utils.escapeHtml(this.accSearch)}" />
          <div class="rtk-col" id="acc-list">
            ${accounts.length === 0
              ? `<div class="rtk-muted">No accounts stored yet. Enable Auto-Capture or add a cookie above.</div>`
              : accounts.map((acc) => {
                  const isCurrent = cur && String(cur.id) === String(acc.userId);
                  return `
                    <div class="rtk-acc-item ${isCurrent ? "current" : ""}">
                      <img class="rtk-avatar" src="${Utils.escapeHtml(acc.avatarUrl || "https://www.roblox.com/favicon.ico")}" alt="" />
                      <div class="rtk-flex-1">
                        <div class="rtk-row" style="gap:6px;">
                          <strong class="rtk-ellipsis">${Utils.escapeHtml(acc.displayName || acc.username)}</strong>
                          ${acc.note ? `<span class="rtk-badge">${Utils.escapeHtml(acc.note)}</span>` : ""}
                        </div>
                        <div class="rtk-muted rtk-ellipsis">@${Utils.escapeHtml(acc.username)} • ${acc.addedVia === "manual" ? "Manual" : "Auto"}</div>
                      </div>
                      <div class="rtk-row" style="gap:4px;">
                        ${isCurrent
                          ? `<span class="rtk-badge">Active</span>`
                          : `<button class="rtk-btn rtk-btn-sm rtk-btn-primary" data-acc-switch="${Utils.escapeHtml(acc.userId)}">Switch</button>`}
                        <button class="rtk-btn rtk-btn-sm" title="Set label" data-acc-note="${Utils.escapeHtml(acc.userId)}">🏷️</button>
                        <button class="rtk-btn rtk-btn-sm" title="Copy .ROBLOSECURITY" data-acc-copy="${Utils.escapeHtml(acc.userId)}">📋</button>
                        <button class="rtk-btn rtk-btn-sm rtk-btn-danger" title="Remove from vault" data-acc-del="${Utils.escapeHtml(acc.userId)}">✕</button>
                      </div>
                    </div>
                  `;
                }).join("")}
          </div>
        </div>
      `;

      body.querySelector("#acc-recheck-btn")?.addEventListener("click", async () => {
        await AccountManager.initAndAutoCapture();
        this.renderAccountsTab(body);
        this.toast(AccountManager.cookieStatus.ok ? "HttpOnly cookie access active!" : "Still blocked — check extension settings.", AccountManager.cookieStatus.ok ? "success" : "error");
      });

      body.querySelector("#acc-capture-now").addEventListener("click", async () => {
        try {
          const saved = await AccountManager.captureCurrentNow();
          this.toast(`Saved @${saved.username} to vault!`, "success");
          this.renderAccountsTab(body);
          GamePageUI.refreshAccountSelectors();
        } catch (err) {
          this.toast(err.message, "error");
        }
      });

      body.querySelector("#acc-clean-login").addEventListener("click", async () => {
        try {
          await AccountManager.prepareCleanLogin();
        } catch (err) {
          this.toast(err.message, "error");
        }
      });

      body.querySelector("#acc-opt-auto").addEventListener("change", async (e) => {
        Store.updateSettings({ autoCaptureAccounts: e.target.checked });
        if (e.target.checked) {
          await AccountManager.initAndAutoCapture();
          this.renderAccountsTab(body);
        }
      });
      body.querySelector("#acc-opt-guard").addEventListener("change", (e) => {
        Store.updateSettings({ logoutGuard: e.target.checked });
      });
      body.querySelector("#acc-opt-restore").addEventListener("change", (e) => {
        Store.updateSettings({ restoreAccountAfterJoin: e.target.checked });
      });

      body.querySelector("#acc-manual-add-btn").addEventListener("click", async (e) => {
        const cookieInput = body.querySelector("#acc-manual-cookie");
        const noteInput = body.querySelector("#acc-manual-note");
        e.currentTarget.disabled = true;
        try {
          const entry = await AccountManager.addManualCookie(cookieInput.value, noteInput.value);
          cookieInput.value = "";
          noteInput.value = "";
          this.toast(`Added @${entry.username} to vault!`, "success");
          this.renderAccountsTab(body);
          GamePageUI.refreshAccountSelectors();
        } catch (err) {
          this.toast(err.message, "error");
        } finally {
          e.currentTarget.disabled = false;
        }
      });

      body.querySelector("#acc-search").addEventListener("input", (e) => {
        this.accSearch = e.target.value;
        const pos = e.target.selectionStart;
        this.renderAccountsTab(body);
        const nextInput = body.querySelector("#acc-search");
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(pos, pos);
        }
      });

      body.querySelectorAll("[data-acc-switch]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            await AccountManager.switchToAccount(btn.dataset.accSwitch);
          } catch (err) {
            btn.disabled = false;
            this.toast(err.message, "error");
          }
        });
      });

      body.querySelectorAll("[data-acc-note]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const uid = btn.dataset.accNote;
          const existing = AccountManager.getAll()[uid]?.note || "";
          const next = window.prompt("Set a label/tag for this account (e.g. Main, Alt, Trading):", existing);
          if (next !== null) {
            AccountManager.updateNote(uid, next);
            this.renderAccountsTab(body);
            GamePageUI.refreshAccountSelectors();
          }
        });
      });

      body.querySelectorAll("[data-acc-copy]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const entry = AccountManager.getAll()[btn.dataset.accCopy];
          if (entry?.cookie) {
            await Utils.copyText(entry.cookie);
            this.toast(`Copied .ROBLOSECURITY for @${entry.username}`, "info");
          }
        });
      });

      body.querySelectorAll("[data-acc-del]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const uid = btn.dataset.accDel;
          const entry = AccountManager.getAll()[uid];
          if (window.confirm(`Remove @${entry?.username || uid} from stored accounts?`)) {
            AccountManager.removeEntry(uid);
            this.renderAccountsTab(body);
            GamePageUI.refreshAccountSelectors();
          }
        });
      });

      body.querySelector("#acc-export-btn").addEventListener("click", () => {
        const json = JSON.stringify(AccountManager.getAll(), null, 2);
        DevTools.triggerBlobDownload(new TextEncoder().encode(json), `rotoolkit-accounts-${Date.now()}.json`, "application/json");
        this.toast("Exported accounts vault JSON (keep this file private!).", "info");
      });

      body.querySelector("#acc-import-btn").addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json,.json";
        input.addEventListener("change", async () => {
          const file = input.files?.[0];
          if (!file) return;
          try {
            const parsed = JSON.parse(await file.text());
            const merged = Object.assign(AccountManager.getAll(), parsed);
            Store.set(STORAGE_KEYS.ACCOUNTS, merged);
            this.renderAccountsTab(body);
            GamePageUI.refreshAccountSelectors();
            this.toast("Imported accounts into vault!", "success");
          } catch (err) {
            this.toast("Invalid JSON file: " + err.message, "error");
          }
        });
        input.click();
      });
    },

    /* ---------------- TAB 3: QUICK SETTINGS ---------------- */
    async renderSettingsTab(body) {
      if (!AccountManager.activeUser) {
        body.innerHTML = `<div class="rtk-card"><div class="rtk-muted">Log into a Roblox account to adjust Quick Settings.</div></div>`;
        return;
      }

      if (!QuickSettings.loaded) {
        body.innerHTML = `<div class="rtk-card"><div class="rtk-muted">Loading live Roblox account settings...</div></div>`;
        try {
          await QuickSettings.load();
        } catch (err) {
          body.innerHTML = `<div class="rtk-alert">Could not fetch settings: ${Utils.escapeHtml(err.message)}</div>`;
          return;
        }
      }

      const ghostOn = QuickSettings.isGhostActive();
      const chatMuted = QuickSettings.isChatMuted();

      body.innerHTML = `
        <div class="rtk-grid-2">
          <button class="rtk-hero-toggle ${ghostOn ? "active" : ""}" id="qs-ghost-btn">
            <div style="font-weight:700;font-size:13.5px;">👻 Appear Offline ${ghostOn ? "• ON" : ""}</div>
            <div class="rtk-muted">${ghostOn ? "Online status & current game hidden. Click to restore." : "Hide online status & prevent joins in 1 click."}</div>
          </button>
          <button class="rtk-hero-toggle ${chatMuted ? "active" : ""}" id="qs-mute-btn">
            <div style="font-weight:700;font-size:13.5px;">🔇 Mute All Chat ${chatMuted ? "• ON" : ""}</div>
            <div class="rtk-muted">${chatMuted ? "Experience & App chat disabled. Click to unmute." : "Disable in-game & party chat instantly."}</div>
          </button>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>1-Click Privacy Presets</span>
            <button class="rtk-btn rtk-btn-sm" id="qs-refresh-btn">🔄 Sync</button>
          </div>
          <div class="rtk-row" style="flex-wrap:wrap;">
            <button class="rtk-btn rtk-btn-sm" data-preset="grinding">🛡️ Solo Grinding</button>
            <button class="rtk-btn rtk-btn-sm" data-preset="friends">🤝 Friends Only</button>
            <button class="rtk-btn rtk-btn-sm" data-preset="public">🌐 Public Mode</button>
          </div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title"><span>Granular Account & Privacy Controls</span></div>
          ${SETTING_DEFINITIONS.filter((def) => QuickSettings.values[def.key] !== undefined || def.key === "themeType")
            .map((def) => {
              const curVal = QuickSettings.values[def.key] || "";
              const opts = QuickSettings.optionsMap[def.key] || def.fallbackOptions;
              return `
                <div class="rtk-col" style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                  <div class="rtk-row" style="justify-content:space-between;">
                    <div>
                      <div style="font-weight:600;">${Utils.escapeHtml(def.label)}</div>
                      <div class="rtk-muted">${Utils.escapeHtml(def.desc)}</div>
                    </div>
                  </div>
                  <select class="rtk-select" data-qs-key="${Utils.escapeHtml(def.key)}">
                    ${opts
                      .map(
                        (o) =>
                          `<option value="${Utils.escapeHtml(o)}" ${String(curVal) === String(o) ? "selected" : ""}>${Utils.escapeHtml(QuickSettings.formatOption(o))}</option>`
                      )
                      .join("")}
                  </select>
                </div>
              `;
            })
            .join("")}
        </div>
      `;

      body.querySelector("#qs-ghost-btn").addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        try {
          const res = await QuickSettings.toggleGhostMode();
          this.toast(res.active ? "👻 Ghost Mode enabled (Appearing Offline)" : "🟢 Online visibility restored!", "success");
          this.renderSettingsTab(body);
        } catch (err) {
          this.toast(err.message, "error");
          e.currentTarget.disabled = false;
        }
      });

      body.querySelector("#qs-mute-btn").addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        try {
          const res = await QuickSettings.toggleMuteAllChat();
          this.toast(res.muted ? "🔇 Chat disabled across Roblox" : "💬 Chat re-enabled!", "success");
          this.renderSettingsTab(body);
        } catch (err) {
          this.toast(err.message, "error");
          e.currentTarget.disabled = false;
        }
      });

      body.querySelector("#qs-refresh-btn").addEventListener("click", async () => {
        QuickSettings.loaded = false;
        await this.renderSettingsTab(body);
        this.toast("Synced latest settings from Roblox.", "info");
      });

      body.querySelectorAll("[data-preset]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            await QuickSettings.applyPreset(btn.dataset.preset);
            this.toast(`Applied "${btn.textContent.trim()}" preset!`, "success");
            this.renderSettingsTab(body);
          } catch (err) {
            this.toast(err.message, "error");
            btn.disabled = false;
          }
        });
      });

      body.querySelectorAll("[data-qs-key]").forEach((sel) => {
        sel.addEventListener("change", async () => {
          const key = sel.dataset.qsKey;
          const val = sel.value;
          sel.disabled = true;
          try {
            await QuickSettings.update({ [key]: val });
            this.toast(`Updated ${key} → ${QuickSettings.formatOption(val)}`, "success");
            this.renderSettingsTab(body);
          } catch (err) {
            this.toast(err.message, "error");
            sel.disabled = false;
          }
        });
      });
    },

    /* ---------------- TAB 4: PLAYTIME TRACKER ---------------- */
    renderPlaytimeTab(body) {
      const settings = Store.getSettings();
      const { list, activeSession } = PlaytimeTracker.getSortedGames({
        accountId: this.playtimeFilterAcc,
        sortBy: this.playtimeSort,
        search: this.playtimeSearch,
      });
      const totalAcrossAll = list.reduce((sum, g) => sum + (g.computedSeconds || 0), 0);

      body.innerHTML = `
        ${activeSession ? `
          <div class="rtk-card rtk-col" style="border-color:rgba(0,176,111,0.5);background:rgba(0,176,111,0.08);">
            <div class="rtk-card-title">
              <span class="rtk-row"><span class="rtk-dot-live"></span> ${activeSession.presenceType === 3 ? "Currently in Roblox Studio" : "Currently Playing"}</span>
              <span class="rtk-badge" id="rtk-live-session-timer">${Utils.formatDuration(PlaytimeTracker.getLiveSessionElapsed(activeSession))}</span>
            </div>
            <div class="rtk-row">
              ${activeSession.iconUrl ? `<img class="rtk-avatar" src="${Utils.escapeHtml(activeSession.iconUrl)}" alt="" />` : ""}
              <div class="rtk-flex-1">
                <div style="font-weight:700;">${Utils.escapeHtml(activeSession.name)}</div>
                <div class="rtk-muted">@${Utils.escapeHtml(activeSession.username || "Current")}${activeSession.gameId ? ` • Server ${Utils.escapeHtml(activeSession.gameId.slice(0, 8))}...` : ""}</div>
              </div>
              ${activeSession.gameId ? `<button class="rtk-btn rtk-btn-sm" id="pt-copy-job">Copy JobId</button>` : ""}
            </div>
          </div>
        ` : `
          <div class="rtk-card">
            <div class="rtk-muted">🟢 Playtime tracker is active in the background. As soon as your account's online status enters an experience, counting begins automatically!</div>
          </div>
        `}

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Tracked Playtime (${Utils.formatDuration(totalAcrossAll)})</span>
            <div class="rtk-row">
              <button class="rtk-btn rtk-btn-sm" id="pt-poll-now" title="Check status right now">🔄</button>
              <button class="rtk-btn rtk-btn-sm" id="pt-export">Export</button>
              <button class="rtk-btn rtk-btn-sm rtk-btn-danger" id="pt-reset">Reset</button>
            </div>
          </div>
          <div class="rtk-grid-2">
            <select class="rtk-select" id="pt-acc-filter">
              <option value="all" ${this.playtimeFilterAcc === "all" ? "selected" : ""}>All Accounts</option>
              ${AccountManager.getList()
                .map(
                  (a) =>
                    `<option value="${Utils.escapeHtml(a.userId)}" ${String(this.playtimeFilterAcc) === String(a.userId) ? "selected" : ""}>@${Utils.escapeHtml(a.username)}</option>`
                )
                .join("")}
            </select>
            <select class="rtk-select" id="pt-sort">
              <option value="time" ${this.playtimeSort === "time" ? "selected" : ""}>Sort: Most Played</option>
              <option value="recent" ${this.playtimeSort === "recent" ? "selected" : ""}>Sort: Recently Played</option>
              <option value="name" ${this.playtimeSort === "name" ? "selected" : ""}>Sort: Name (A–Z)</option>
            </select>
          </div>
          <input class="rtk-input" id="pt-search" placeholder="Filter games..." value="${Utils.escapeHtml(this.playtimeSearch)}" />
          <label class="rtk-switch-row">
            <span class="rtk-muted">Also track Roblox Studio sessions</span>
            <input type="checkbox" id="pt-studio-opt" ${settings.trackStudioTime ? "checked" : ""} />
          </label>

          <div class="rtk-col">
            ${list.length === 0
              ? `<div class="rtk-muted" style="padding:8px 0;">No games recorded yet. Launch any Roblox experience to start tracking!</div>`
              : list
                  .map(
                    (g, i) => `
                    <div class="rtk-game-item ${g.isCurrentlyPlaying ? "current" : ""}">
                      <div style="font-weight:700;width:20px;text-align:center;color:#64748b;">#${i + 1}</div>
                      <img class="rtk-avatar" src="${Utils.escapeHtml(g.iconUrl || "https://www.roblox.com/favicon.ico")}" alt="" />
                      <div class="rtk-flex-1">
                        <div style="font-weight:700;" class="rtk-ellipsis">${Utils.escapeHtml(g.name)}</div>
                        <div class="rtk-muted">
                          <b style="color:#e2e8f0;">${Utils.formatDuration(g.computedSeconds)}</b>
                          • ${g.sessions || 1} session${(g.sessions || 1) === 1 ? "" : "s"}
                          • ${Utils.timeAgo(g.lastPlayedAt)}
                        </div>
                      </div>
                      ${g.rootPlaceId || g.placeId
                        ? `<button class="rtk-btn rtk-btn-sm rtk-btn-primary" data-pt-play="${Utils.escapeHtml(g.rootPlaceId || g.placeId)}">▶ Play</button>`
                        : ""}
                    </div>
                  `
                  )
                  .join("")}
          </div>
        </div>
      `;

      body.querySelector("#pt-copy-job")?.addEventListener("click", async () => {
        await Utils.copyText(activeSession.gameId);
        this.toast("Copied active Job ID!", "success");
      });

      body.querySelector("#pt-poll-now").addEventListener("click", async () => {
        await PlaytimeTracker.poll();
        this.renderPlaytimeTab(body);
        this.toast("Presence checked!", "info");
      });

      body.querySelector("#pt-acc-filter").addEventListener("change", (e) => {
        this.playtimeFilterAcc = e.target.value;
        this.renderPlaytimeTab(body);
      });

      body.querySelector("#pt-sort").addEventListener("change", (e) => {
        this.playtimeSort = e.target.value;
        this.renderPlaytimeTab(body);
      });

      body.querySelector("#pt-search").addEventListener("input", (e) => {
        this.playtimeSearch = e.target.value;
        const pos = e.target.selectionStart;
        this.renderPlaytimeTab(body);
        const inp = body.querySelector("#pt-search");
        if (inp) {
          inp.focus();
          inp.setSelectionRange(pos, pos);
        }
      });

      body.querySelector("#pt-studio-opt").addEventListener("change", (e) => {
        Store.updateSettings({ trackStudioTime: e.target.checked });
      });

      body.querySelector("#pt-export").addEventListener("click", () => {
        const json = JSON.stringify(PlaytimeTracker.getData(), null, 2);
        DevTools.triggerBlobDownload(new TextEncoder().encode(json), `rotoolkit-playtime-${Date.now()}.json`, "application/json");
      });

      body.querySelector("#pt-reset").addEventListener("click", () => {
        if (window.confirm("Reset all recorded playtime history?")) {
          PlaytimeTracker.resetAll();
          this.renderPlaytimeTab(body);
        }
      });

      body.querySelectorAll("[data-pt-play]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            await Launcher.join(btn.dataset.ptPlay, null, "current");
            this.toast("Launching experience...", "success");
          } catch (err) {
            this.toast(err.message, "error");
          }
        });
      });
    },

    /* ---------------- TAB 5: DEVELOPER TOOLS ---------------- */
    async renderDevToolsTab(body) {
      const ctx = DevTools.detectUrlContext();
      const prefillAsset = ctx.type === "asset" ? ctx.id : "";
      const snippets = DevTools.generateLuauSnippets();

      body.innerHTML = `
        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>🔍 Live Page & Experience Inspector</span>
            <span class="rtk-badge">${Utils.escapeHtml(ctx.type.toUpperCase())}</span>
          </div>
          <div id="dt-inspector-rows" class="rtk-col">
            <div class="rtk-muted">Inspecting page metadata...</div>
          </div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title"><span>🖼️ Decal / Clothing → Image ID & Raw Asset Extractor</span></div>
          <div class="rtk-muted">Extract true Studio <code>ImageLabel</code> / Template IDs from Decals, Shirts, Pants, or Models, or download raw <code>.rbxm</code> / <code>.png</code> / <code>.ogg</code> files.</div>
          <div class="rtk-row">
            <input class="rtk-input rtk-flex-1" id="dt-asset-id" placeholder="Enter Asset ID (e.g. Decal, Shirt, Audio, Model)" value="${Utils.escapeHtml(prefillAsset)}" />
            <button class="rtk-btn rtk-btn-primary" id="dt-inspect-asset-btn">Inspect</button>
          </div>
          <div id="dt-asset-result"></div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title"><span>📜 Context Luau Snippets</span></div>
          ${snippets
            .map(
              (s, i) => `
              <div class="rtk-col">
                <div class="rtk-row" style="justify-content:space-between;">
                  <span class="rtk-muted">${Utils.escapeHtml(s.title)}</span>
                  <button class="rtk-btn rtk-btn-sm" data-snip-idx="${i}">Copy Luau</button>
                </div>
                <div class="rtk-code">${Utils.escapeHtml(s.code)}</div>
              </div>
            `
            )
            .join("")}
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title"><span>🧪 Authenticated Roblox API Console (Auto-CSRF)</span></div>
          <select class="rtk-select" id="dt-api-preset">
            <option value="">— Quick Endpoint Templates —</option>
            <option value="GET|https://users.roblox.com/v1/users/authenticated|">GET Current Authenticated User</option>
            <option value="POST|https://presence.roblox.com/v1/presence/users|${Utils.escapeHtml(JSON.stringify({ userIds: [AccountManager.activeUser?.id || 1] }))}">POST My Presence & Live JobId</option>
            <option value="GET|https://apis.roblox.com/user-settings-api/v1/user-settings|">GET User Privacy Settings</option>
            ${ctx.type === "game" && ctx.id ? `<option value="GET|https://games.roblox.com/v1/games/${ctx.id}/servers/Public?limit=10|">GET Public Servers (Current Place)</option>` : ""}
            <option value="GET|https://economy.roblox.com/v1/users/${AccountManager.activeUser?.id || 1}/currency|">GET Current Account Robux Balance</option>
          </select>
          <div class="rtk-row">
            <select class="rtk-select" id="dt-api-method" style="width:95px;">
              <option>GET</option>
              <option>POST</option>
              <option>PATCH</option>
              <option>DELETE</option>
            </select>
            <input class="rtk-input rtk-flex-1" id="dt-api-url" placeholder="https://users.roblox.com/v1/users/authenticated" value="https://users.roblox.com/v1/users/authenticated" />
          </div>
          <textarea class="rtk-textarea" id="dt-api-body" placeholder='Optional JSON body for POST/PATCH, e.g. {"userIds":[1]}'></textarea>
          <div class="rtk-row">
            <button class="rtk-btn rtk-btn-primary rtk-flex-1" id="dt-api-send">▶ Send Request</button>
            <button class="rtk-btn rtk-btn-sm" id="dt-api-copy-fetch">Copy fetch()</button>
            <button class="rtk-btn rtk-btn-sm" id="dt-api-copy-luau">Copy HttpService</button>
          </div>
          <div id="dt-api-output"></div>
        </div>
      `;

      // Populate live page inspector asynchronously
      DevTools.inspectCurrentPage().then((info) => {
        const container = body.querySelector("#dt-inspector-rows");
        if (!container) return;
        let html = info.fields
          .map(
            (f) => `
            <div class="rtk-kv-row">
              <span class="rtk-muted">${Utils.escapeHtml(f.label)}</span>
              <div class="rtk-row">
                <code style="color:#f8fafc;">${Utils.escapeHtml(f.value)}</code>
                ${f.copy ? `<button class="rtk-btn rtk-btn-sm" data-dt-copy="${Utils.escapeHtml(f.copyVal || f.value)}">Copy</button>` : ""}
              </div>
            </div>
          `
          )
          .join("");

        if (info.liveJobId) {
          html += `
            <div class="rtk-kv-row">
              <span class="rtk-muted">🟢 Active Server JobId</span>
              <div class="rtk-row">
                <code style="color:#34d399;">${Utils.escapeHtml(info.liveJobId.slice(0, 13))}...</code>
                <button class="rtk-btn rtk-btn-sm" data-dt-copy="${Utils.escapeHtml(info.liveJobId)}">Copy</button>
              </div>
            </div>
          `;
        }
        if (info.contextType === "game" && info.primaryId) {
          html += `
            <div class="rtk-row" style="margin-top:6px;">
              <button class="rtk-btn rtk-flex-1" id="dt-open-studio" data-place="${Utils.escapeHtml(info.primaryId)}" data-univ="${Utils.escapeHtml(info.gameMeta?.id || "")}">🛠️ Open Place in Roblox Studio</button>
            </div>
          `;
        }
        container.innerHTML = html || `<div class="rtk-muted">Navigate to a Game, Asset, User, or Group page to inspect IDs.</div>`;

        container.querySelectorAll("[data-dt-copy]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            await Utils.copyText(btn.dataset.dtCopy);
            this.toast(`Copied: ${btn.dataset.dtCopy}`, "success");
          });
        });

        container.querySelector("#dt-open-studio")?.addEventListener("click", (e) => {
          const ok = Launcher.openInStudio(e.currentTarget.dataset.place, e.currentTarget.dataset.univ);
          if (ok) this.toast("Launching Roblox Studio...", "info");
          else this.toast("Roblox.GameLauncher.editGameInStudio unavailable on this page.", "error");
        });
      });

      // Asset Inspector & Raw Downloader
      let lastAssetData = null;
      body.querySelector("#dt-inspect-asset-btn").addEventListener("click", async (e) => {
        const idVal = body.querySelector("#dt-asset-id").value.trim();
        const out = body.querySelector("#dt-asset-result");
        e.currentTarget.disabled = true;
        out.innerHTML = `<div class="rtk-muted">Fetching asset stream...</div>`;
        try {
          const data = await DevTools.inspectAssetAndExtractIds(idVal);
          lastAssetData = data;
          out.innerHTML = `
            <div class="rtk-col" style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);">
              <div class="rtk-kv-row"><span class="rtk-muted">Name</span><b>${Utils.escapeHtml(data.name)}</b></div>
              <div class="rtk-kv-row"><span class="rtk-muted">Detected Format</span><span>${Utils.escapeHtml(data.format.kind)} (${(data.byteSize / 1024).toFixed(1)} KB)</span></div>
              <div class="rtk-row" style="flex-wrap:wrap;">
                <button class="rtk-btn rtk-btn-sm rtk-btn-primary" id="dt-dl-raw">⬇️ Download .${Utils.escapeHtml(data.format.ext)}</button>
                <button class="rtk-btn rtk-btn-sm" data-dt-uri="rbxassetid://${Utils.escapeHtml(data.assetId)}">Copy rbxassetid://</button>
                <button class="rtk-btn rtk-btn-sm" data-dt-uri="rbxthumb://type=Asset&id=${Utils.escapeHtml(data.assetId)}&w=420&h=420">Copy rbxthumb://</button>
              </div>
              ${data.extractedIds.length > 0 ? `
                <div class="rtk-muted" style="margin-top:4px;">Underlying Referenced Asset / Image IDs (${data.extractedIds.length}):</div>
                ${data.extractedIds
                  .map(
                    (eid) => `
                  <div class="rtk-kv-row">
                    <code>rbxassetid://${Utils.escapeHtml(eid)}</code>
                    <div class="rtk-row">
                      <button class="rtk-btn rtk-btn-sm" data-dt-uri="${Utils.escapeHtml(eid)}">Copy ID</button>
                      <button class="rtk-btn rtk-btn-sm" data-dt-uri="rbxassetid://${Utils.escapeHtml(eid)}">Copy URI</button>
                    </div>
                  </div>
                `
                  )
                  .join("")}
              ` : `<div class="rtk-muted">Direct binary asset (no nested XML IDs — use Download button above).</div>`}
            </div>
          `;

          out.querySelector("#dt-dl-raw")?.addEventListener("click", () => {
            const safeName = data.name.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40);
            DevTools.triggerBlobDownload(data.buffer, `${safeName}_${data.assetId}.${data.format.ext}`, data.format.mime);
          });
          out.querySelectorAll("[data-dt-uri]").forEach((b) => {
            b.addEventListener("click", async () => {
              await Utils.copyText(b.dataset.dtUri);
              this.toast(`Copied: ${b.dataset.dtUri}`, "success");
            });
          });
        } catch (err) {
          out.innerHTML = `<div class="rtk-alert">${Utils.escapeHtml(err.message)}</div>`;
        } finally {
          e.currentTarget.disabled = false;
        }
      });

      // Luau snippets copy
      body.querySelectorAll("[data-snip-idx]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const snip = snippets[Number(btn.dataset.snipIdx)];
          if (snip) {
            await Utils.copyText(snip.code);
            this.toast("Copied Luau snippet!", "success");
          }
        });
      });

      // API Playground
      body.querySelector("#dt-api-preset").addEventListener("change", (e) => {
        if (!e.target.value) return;
        const [m, u, ...rest] = e.target.value.split("|");
        body.querySelector("#dt-api-method").value = m;
        body.querySelector("#dt-api-url").value = u;
        body.querySelector("#dt-api-body").value = rest.join("|") || "";
      });

      body.querySelector("#dt-api-send").addEventListener("click", async (e) => {
        const method = body.querySelector("#dt-api-method").value;
        const url = body.querySelector("#dt-api-url").value.trim();
        const rawBody = body.querySelector("#dt-api-body").value.trim();
        const out = body.querySelector("#dt-api-output");
        if (!url.startsWith("https://")) return this.toast("Enter a valid https://*.roblox.com URL", "error");

        e.currentTarget.disabled = true;
        out.innerHTML = `<div class="rtk-muted">Sending ${Utils.escapeHtml(method)} request...</div>`;
        try {
          const payload = method !== "GET" && rawBody ? JSON.parse(rawBody) : rawBody || null;
          const res = await RobloxAPI.request({ method, url, body: payload });
          const formatted = typeof res.data === "object" ? JSON.stringify(res.data, null, 2) : String(res.text || "");
          out.innerHTML = `
            <div class="rtk-row" style="justify-content:space-between;margin-bottom:6px;">
              <span class="rtk-badge" style="${res.ok ? "" : "background:rgba(239,68,68,0.2);color:#fca5a5;border-color:rgba(239,68,68,0.4);"}">HTTP ${res.status} • ${res.durationMs} ms</span>
              <button class="rtk-btn rtk-btn-sm" id="dt-copy-resp">Copy Response</button>
            </div>
            <div class="rtk-code">${Utils.escapeHtml(formatted)}</div>
          `;
          out.querySelector("#dt-copy-resp")?.addEventListener("click", async () => {
            await Utils.copyText(formatted);
            this.toast("Copied JSON response!", "success");
          });
        } catch (err) {
          out.innerHTML = `<div class="rtk-alert">${Utils.escapeHtml(err.message)}</div>`;
        } finally {
          e.currentTarget.disabled = false;
        }
      });

      body.querySelector("#dt-api-copy-fetch").addEventListener("click", async () => {
        const { fetchCode } = DevTools.buildCodeFromApiCall(
          body.querySelector("#dt-api-method").value,
          body.querySelector("#dt-api-url").value.trim(),
          body.querySelector("#dt-api-body").value
        );
        await Utils.copyText(fetchCode);
        this.toast("Copied JavaScript fetch() snippet!", "success");
      });

      body.querySelector("#dt-api-copy-luau").addEventListener("click", async () => {
        const { luauCode } = DevTools.buildCodeFromApiCall(
          body.querySelector("#dt-api-method").value,
          body.querySelector("#dt-api-url").value.trim(),
          body.querySelector("#dt-api-body").value
        );
        await Utils.copyText(luauCode);
        this.toast("Copied Luau HttpService snippet!", "success");
      });
    },
  };

  /* ============================================================================
   * 11. IN-PAGE GAME CONTROLS, NAVBAR BUTTON, LOGOUT GUARD & BOOTSTRAP
   * ============================================================================ */
  const INPAGE_STYLES_ID = "rtk-inpage-styles";

  function injectInPageStyles() {
    if (document.getElementById(INPAGE_STYLES_ID)) return;
    const st = document.createElement("style");
    st.id = INPAGE_STYLES_ID;
    st.textContent = `
      #rtk-navbar-item {
        display: inline-flex;
        align-items: center;
        margin-right: 6px;
      }
      #rtk-navbar-btn {
        height: 32px;
        padding: 0 11px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(0, 176, 111, 0.14);
        color: inherit;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: background 0.15s, border-color 0.15s;
      }
      #rtk-navbar-btn:hover {
        background: rgba(0, 176, 111, 0.26);
        border-color: #00b06f;
      }
      #rtk-navbar-live-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #00d284;
        box-shadow: 0 0 6px #00d284;
        display: none;
      }

      #roblox-jobid-joiner-container {
        background-color: var(--card-bg, rgba(25, 27, 29, 0.72));
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px;
        padding: 16px 18px;
        margin: 14px 0 18px 0;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
        color: inherit;
      }
      .theme-light #roblox-jobid-joiner-container,
      body.light-theme #roblox-jobid-joiner-container {
        background-color: #ffffff;
        border: 1px solid rgba(0, 0, 0, 0.12);
      }
      .rtk-srv-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
        gap: 8px;
      }
      .rtk-srv-title {
        font-size: 15px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .rtk-srv-row {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }
      .rtk-srv-input {
        flex: 1 1 240px;
        height: 38px;
        padding: 6px 12px;
        font-size: 13.5px;
        border-radius: 7px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(0, 0, 0, 0.26);
        color: inherit;
        outline: none;
      }
      .theme-light .rtk-srv-input,
      body.light-theme .rtk-srv-input {
        background: #f5f6f7;
        border-color: rgba(0, 0, 0, 0.2);
        color: #191b1d;
      }
      .rtk-srv-input:focus {
        border-color: #00b06f;
        box-shadow: 0 0 0 2px rgba(0, 176, 111, 0.25);
      }
      .rtk-srv-select {
        height: 38px;
        padding: 0 10px;
        font-size: 13px;
        border-radius: 7px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: #1b1e22;
        color: #f1f5f9;
        outline: none;
        max-width: 210px;
      }
      .theme-light .rtk-srv-select,
      body.light-theme .rtk-srv-select {
        background: #f5f6f7;
        border-color: rgba(0, 0, 0, 0.2);
        color: #191b1d;
      }
      .rtk-srv-join-btn {
        height: 38px;
        padding: 0 18px;
        border-radius: 7px;
        border: none;
        background: #00b06f;
        color: #ffffff;
        font-size: 13.5px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .rtk-srv-join-btn:hover { background: #009960; }
      .rtk-srv-chip {
        height: 28px;
        padding: 0 10px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.06);
        color: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .rtk-srv-chip:hover {
        background: rgba(255, 255, 255, 0.14);
        border-color: rgba(255, 255, 255, 0.28);
      }
      #roblox-jobid-status {
        margin-top: 8px;
        font-size: 12.5px;
        display: none;
      }

      #rtk-play-as-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
      }
      .rtk-card-tools {
        display: flex;
        gap: 6px;
        margin-top: 6px;
        flex-wrap: wrap;
      }
    `;
    document.head.appendChild(st);
  }

  const GamePageUI = {
    ensureNavbarButton() {
      injectInPageStyles();
      const pill = HubUI.shadow?.getElementById("rtk-pill");

      const existingBtn = document.getElementById("rtk-navbar-btn");
      if (existingBtn) {
        const isVisible = existingBtn.offsetParent !== null;
        if (pill) pill.style.display = isVisible ? "none" : "inline-flex";
        return;
      }

      const navRight =
        document.querySelector("ul.navbar-right") ||
        document.querySelector(".rbx-navbar-right") ||
        document.querySelector("#header .navbar-right");

      if (navRight) {
        const li = document.createElement("li");
        li.id = "rtk-navbar-item";
        li.innerHTML = `
          <button type="button" id="rtk-navbar-btn" title="Open RoToolkit (Alt+R)">
            <span id="rtk-navbar-live-dot"></span>
            <span>🧰 Toolkit</span>
          </button>
        `;
        li.querySelector("#rtk-navbar-btn").addEventListener("click", () => HubUI.toggle());
        navRight.insertBefore(li, navRight.firstChild);
        if (pill) pill.style.display = "none";
      } else if (pill) {
        pill.style.display = "inline-flex";
      }
    },

    showServerBarStatus(msg, color = "#10b981") {
      const el = document.getElementById("roblox-jobid-status");
      if (!el) return;
      el.textContent = msg;
      el.style.color = color;
      el.style.display = msg ? "block" : "none";
    },

    refreshAccountSelectors() {
      const html = HubUI.buildAccountOptionsHtml();
      document.querySelectorAll(".rtk-account-dropdown").forEach((sel) => {
        const prev = sel.value;
        sel.innerHTML = html;
        if (Array.from(sel.options).some((o) => o.value === prev)) {
          sel.value = prev;
        }
      });
    },

    ensureServersTabPanel() {
      if (!Utils.getPlaceIdFromPage()) return;
      if (document.getElementById("roblox-jobid-joiner-container")) return;

      const serversPane =
        document.getElementById("game-instances") ||
        document.getElementById("rbx-running-games") ||
        document.getElementById("rbx-public-running-games");
      if (!serversPane) return;

      injectInPageStyles();

      const box = document.createElement("div");
      box.id = "roblox-jobid-joiner-container";
      box.innerHTML = `
        <div class="rtk-srv-header">
          <div class="rtk-srv-title">
            <span>🚀 Join Server by Job ID</span>
          </div>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-open-hub">🧰 Full Toolkit (Alt+R)</button>
        </div>
        <div class="rtk-srv-row">
          <input
            type="text"
            id="roblox-jobid-input"
            class="rtk-srv-input"
            placeholder="Paste Server Job ID (e.g. 9134c999-91d5-4b52-9f0a-f7cbae67fe77)..."
            autocomplete="off"
            spellcheck="false"
          />
          <select id="rtk-srv-account" class="rtk-srv-select rtk-account-dropdown" title="Choose account to join with">
            ${HubUI.buildAccountOptionsHtml()}
          </select>
          <button type="button" id="roblox-jobid-join-btn" class="rtk-srv-join-btn">Join Server</button>
        </div>
        <div class="rtk-srv-row" style="margin-top:10px;">
          <button type="button" class="rtk-srv-chip" id="rtk-srv-smallest">👥 Join Smallest Server</button>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-ping">⚡ Join Lowest Ping</button>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-copy-live">📋 Copy My Active JobId</button>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-manage-acc">👥 Manage Accounts</button>
        </div>
        <div id="roblox-jobid-status"></div>
      `;

      serversPane.insertBefore(box, serversPane.firstChild);

      const input = box.querySelector("#roblox-jobid-input");
      const accSelect = box.querySelector("#rtk-srv-account");

      const triggerJoin = async () => {
        const placeId = Utils.getPlaceIdFromPage();
        const rawJob = input.value.trim();
        if (!rawJob) {
          this.showServerBarStatus("Please paste a valid Server Job ID.", "#ef4444");
          return;
        }
        try {
          this.showServerBarStatus("Launching Roblox client...", "#10b981");
          await Launcher.join(placeId, rawJob, accSelect.value);
        } catch (err) {
          this.showServerBarStatus(err.message, "#ef4444");
        }
      };

      box.querySelector("#roblox-jobid-join-btn").addEventListener("click", triggerJoin);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          triggerJoin();
        }
      });

      box.querySelector("#rtk-srv-smallest").addEventListener("click", async () => {
        try {
          this.showServerBarStatus("Scanning for smallest public server...", "#3b82f6");
          const s = await Launcher.joinSmallestServer(Utils.getPlaceIdFromPage(), accSelect.value);
          this.showServerBarStatus(`Joining server (${s.playing}/${s.maxPlayers} players)...`, "#10b981");
        } catch (err) {
          this.showServerBarStatus(err.message, "#ef4444");
        }
      });

      box.querySelector("#rtk-srv-ping").addEventListener("click", async () => {
        try {
          this.showServerBarStatus("Scanning for lowest ping server...", "#3b82f6");
          const s = await Launcher.joinLowestPingServer(Utils.getPlaceIdFromPage(), accSelect.value);
          this.showServerBarStatus(`Joining lowest ping server (${s.ping} ms)...`, "#10b981");
        } catch (err) {
          this.showServerBarStatus(err.message, "#ef4444");
        }
      });

      box.querySelector("#rtk-srv-copy-live").addEventListener("click", async () => {
        await PlaytimeTracker.poll();
        const liveJob = PlaytimeTracker.getData().activeSession?.gameId;
        if (liveJob) {
          await Utils.copyText(liveJob);
          this.showServerBarStatus(`Copied your active server JobId: ${liveJob}`, "#10b981");
        } else {
          this.showServerBarStatus("No active in-game JobId detected right now (make sure you're in a server and status isn't hidden).", "#f59e0b");
        }
      });

      box.querySelector("#rtk-srv-open-hub").addEventListener("click", () => HubUI.toggle(true));
      box.querySelector("#rtk-srv-manage-acc").addEventListener("click", () => HubUI.openTab("accounts"));
    },

    ensurePlayAsBar() {
      if (!Utils.getPlaceIdFromPage()) return;
      if (document.getElementById("rtk-play-as-bar")) return;

      const playContainer = document.getElementById("game-details-play-button-container");
      if (!playContainer || !playContainer.parentElement) return;

      injectInPageStyles();
      const bar = document.createElement("div");
      bar.id = "rtk-play-as-bar";
      bar.innerHTML = `
        <select id="rtk-main-play-acc" class="rtk-srv-select rtk-account-dropdown" style="height:32px;font-size:12px;flex:1;">
          ${HubUI.buildAccountOptionsHtml()}
        </select>
        <button type="button" id="rtk-main-play-as-btn" class="rtk-srv-chip" style="height:32px;background:rgba(0,176,111,0.18);border-color:rgba(0,176,111,0.45);">
          ▶ Play As Account
        </button>
      `;

      playContainer.parentElement.insertBefore(bar, playContainer.nextSibling);

      bar.querySelector("#rtk-main-play-as-btn").addEventListener("click", async () => {
        const accId = bar.querySelector("#rtk-main-play-acc").value;
        try {
          await Launcher.join(Utils.getPlaceIdFromPage(), null, accId);
          HubUI.toast("Launching game...", "success");
        } catch (err) {
          HubUI.toast(err.message, "error");
        }
      });
    },

    enhanceServerCards() {
      if (!Utils.getPlaceIdFromPage()) return;
      const cards = document.querySelectorAll(
        ".rbx-public-game-server-item:not([data-rtk-enhanced]), .rbx-game-server-item:not([data-rtk-enhanced])"
      );
      cards.forEach((card) => {
        const jobId = Utils.extractJobIdFromServerCard(card);
        if (!jobId) return;
        card.setAttribute("data-rtk-enhanced", "1");

        const detailsWrap = card.querySelector(".rbx-game-server-details") || card;
        const tools = document.createElement("div");
        tools.className = "rtk-card-tools";
        tools.innerHTML = `
          <button type="button" class="rtk-srv-chip" data-card-copy="${Utils.escapeHtml(jobId)}" title="${Utils.escapeHtml(jobId)}">📋 JobId</button>
          <button type="button" class="rtk-srv-chip" data-card-link="${Utils.escapeHtml(jobId)}">🔗 Link</button>
          <button type="button" class="rtk-srv-chip" data-card-joinas="${Utils.escapeHtml(jobId)}">👤 Join As</button>
        `;

        tools.querySelector("[data-card-copy]").addEventListener("click", async () => {
          await Utils.copyText(jobId);
          HubUI.toast("Copied server Job ID!", "success");
        });

        tools.querySelector("[data-card-link]").addEventListener("click", async () => {
          const placeId = Utils.getPlaceIdFromPage();
          const url = `https://www.roblox.com/games/${placeId}/-?serverJobId=${jobId}`;
          await Utils.copyText(url);
          HubUI.toast("Copied direct ?serverJobId= link!", "success");
        });

        tools.querySelector("[data-card-joinas]").addEventListener("click", async () => {
          const srvSelect = document.getElementById("rtk-srv-account");
          const accId = srvSelect ? srvSelect.value : "current";
          if (accId === "current") {
            HubUI.toast("Tip: Pick a target account in the Job ID bar dropdown at the top of Servers tab, then click Join As!", "info");
          }
          try {
            await Launcher.join(Utils.getPlaceIdFromPage(), jobId, accId);
          } catch (err) {
            HubUI.toast(err.message, "error");
          }
        });

        detailsWrap.appendChild(tools);
      });
    },

    tickDomEnhancements() {
      this.ensureNavbarButton();
      this.ensureServersTabPanel();
      this.ensurePlayAsBar();
      this.enhanceServerCards();
    },
  };

  /* ---------------- NATIVE LOGOUT GUARD ---------------- */
  function setupLogoutGuard() {
    document.addEventListener(
      "click",
      async (e) => {
        if (!Store.getSettings().logoutGuard) return;
        const activeId = AccountManager.activeUser?.id;
        if (!activeId || !AccountManager.getAll()[String(activeId)]) return;

        const target = e.target.closest("a, button, li");
        if (!target) return;
        const idOrAttr = `${target.id || ""} ${target.getAttribute("data-behavior") || ""} ${target.className || ""}`.toLowerCase();
        const text = (target.textContent || "").trim();
        const isLogoutBtn =
          idOrAttr.includes("logout") ||
          (/^log\s*out$/i.test(text) && Boolean(target.closest("[role='menu'], .popover-content, #settings-popover-menu, ul")));

        if (!isLogoutBtn || target.dataset.rtkBypassLogout === "1") return;

        e.preventDefault();
        e.stopPropagation();

        const useCleanSwitch = window.confirm(
          `[RoToolkit Logout Guard]\n\n@${AccountManager.activeUser.name} is saved in your Account Switcher vault!\n\nClicking Roblox's native "Log Out" permanently invalidates your saved .ROBLOSECURITY cookie on Roblox's servers.\n\n• Click OK to safely detach & switch to the Login screen WITHOUT invalidating your saved cookie (Recommended).\n• Click Cancel to abort.`
        );

        if (useCleanSwitch) {
          try {
            await AccountManager.prepareCleanLogin();
          } catch (err) {
            HubUI.toast(err.message, "error");
          }
        }
      },
      true
    );
  }

  /* ---------------- POST-JOIN ACCOUNT RESTORE PROMPT ---------------- */
  function checkPostJoinRestorePrompt() {
    const promptData = Store.get(STORAGE_KEYS.RESTORE_PROMPT, null);
    if (!promptData) return;
    Store.remove(STORAGE_KEYS.RESTORE_PROMPT);

    if (Date.now() > promptData.expiresAt) return;
    const prevAcc = AccountManager.getAll()[String(promptData.previousUserId)];
    if (!prevAcc) return;

    if (promptData.autoRestore) {
      let cancelled = false;
      HubUI.toast(
        `Game launched! Restoring browser to @${prevAcc.username} in 5s...`,
        "info",
        {
          label: "Stay Here",
          onClick: () => {
            cancelled = true;
          },
        },
        5200
      );
      setTimeout(() => {
        if (!cancelled) {
          AccountManager.switchToAccount(prevAcc.userId).catch(() => {});
        }
      }, 5000);
    } else {
      HubUI.toast(
        `Launched on @${AccountManager.activeUser?.name || "alt"}.`,
        "info",
        {
          label: `Back to @${prevAcc.username}`,
          onClick: () => AccountManager.switchToAccount(prevAcc.userId),
        },
        12000
      );
    }
  }

  /* ---------------- MAIN BOOTSTRAP ---------------- */
  async function bootstrap() {
    HubUI.init();
    GamePageUI.tickDomEnhancements();
    setupLogoutGuard();

    // Debounced MutationObserver for Roblox's React SPA navigation & tab switches
    let rafScheduled = false;
    const observer = new MutationObserver(() => {
      if (rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(() => {
        rafScheduled = false;
        GamePageUI.tickDomEnhancements();
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Cross-tab vault synchronization
    Store.onChange(STORAGE_KEYS.ACCOUNTS, () => {
      GamePageUI.refreshAccountSelectors();
      if (HubUI.isOpen && HubUI.activeTab === "accounts") HubUI.renderActiveTab();
    });

    await AccountManager.initAndAutoCapture();
    GamePageUI.refreshAccountSelectors();

    await Launcher.handleStartupLaunches((msg, type) => HubUI.toast(msg, type));
    checkPostJoinRestorePrompt();

    PlaytimeTracker.start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
