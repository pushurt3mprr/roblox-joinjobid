// ==UserScript==
// @name         Roblox Multi-Tool & Job ID Joiner
// @namespace    https://github.com/pushurt3mprr
// @version      2.0.1
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
  const APP_VERSION = "2.0.1";
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
      const [flatRes, optRes] = await Promise.all([
        this.request({ url: "https://apis.roblox.com/user-settings-api/v1/user-settings" }).catch(() => ({ ok: false })),
        this.request({ url: "https://apis.roblox.com/user-settings-api/v1/user-settings/settings-and-options" }).catch(() => ({ ok: false })),
      ]);

      if (!flatRes.ok && !optRes.ok) {
        throw new Error(`Failed to load user settings (HTTP ${flatRes.status || optRes.status || 0})`);
      }

      return {
        flat: flatRes.ok && flatRes.data && typeof flatRes.data === "object" ? flatRes.data : {},
        options: optRes.ok && optRes.data && typeof optRes.data === "object" ? optRes.data : {},
      };
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
    FriendsFollowingAndFollowers: "Friends, Following, and Followers",
    FriendsAndFollowing: "Friends and Users I Follow",
    Followers: "Followers",
    Following: "Users I Follow",
    Friends: "Friends",
    TopFriends: "Friends",
    TrustedFriends: "Connections",
    Contacts: "Contacts",
    NoOne: "No one",
    Off: "Off",
    Disabled: "Off",
    Default: "Default",
    Dark: "Dark",
    Light: "Light",
    None: "None",
    Low: "Low",
    Medium: "Medium",
    High: "High",
  };

  function extractSettingString(item, depth = 0) {
    if (item === null || item === undefined || depth > 5) return null;
    if (typeof item === "string") return item.trim() || null;
    if (typeof item === "number" || typeof item === "boolean") return String(item);
    if (typeof item === "object" && !Array.isArray(item)) {
      const priorityKeys = ["optionValue", "currentValue", "value", "option", "name", "key", "id"];
      for (const k of priorityKeys) {
        if (Object.prototype.hasOwnProperty.call(item, k) && item[k] !== item) {
          const unwrapped = extractSettingString(item[k], depth + 1);
          if (unwrapped) return unwrapped;
        }
      }
      for (const v of Object.values(item)) {
        if (typeof v === "string" && v.trim() && v.length < 64) {
          return v.trim();
        }
      }
    }
    return null;
  }

  const QuickSettings = {
    values: {},
    optionsMap: {},
    loaded: false,

    formatOption(opt) {
      const clean = extractSettingString(opt);
      if (!clean) return "Unknown";
      return OPTION_LABELS[clean] || clean.replace(/([a-z])([A-Z])/g, "$1 $2");
    },

    async load() {
      const { flat, options } = await RobloxAPI.getUserSettingsAndOptions();
      const nextValues = {};
      const nextOptions = {};

      for (const def of SETTING_DEFINITIONS) {
        const flatEntry = flat[def.key];
        const optEntry = options[def.key];

        const curVal =
          extractSettingString(flatEntry) ??
          extractSettingString(optEntry?.currentValue) ??
          extractSettingString(optEntry?.value) ??
          extractSettingString(optEntry);

        let rawOpts = null;
        if (optEntry && typeof optEntry === "object" && !Array.isArray(optEntry)) {
          rawOpts =
            optEntry.optionValues ||
            optEntry.options ||
            optEntry.allowedOptions ||
            optEntry.validOptions ||
            null;
        }

        let parsedOpts = [];
        if (Array.isArray(rawOpts)) {
          parsedOpts = rawOpts.map((o) => extractSettingString(o)).filter(Boolean);
        }

        if (parsedOpts.length === 0) {
          parsedOpts = def.fallbackOptions.slice();
        }
        if (curVal && !parsedOpts.includes(curVal)) {
          parsedOpts.unshift(curVal);
        }

        nextOptions[def.key] = Array.from(new Set(parsedOpts));
        if (curVal) {
          nextValues[def.key] = curVal;
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
      return allowed[0] || preferredList[0];
    },

    applyThemeToDom(theme) {
      const isDark = String(theme).toLowerCase() === "dark";
      const targets = [document.documentElement, document.body, document.getElementById("rbx-body")].filter(Boolean);
      targets.forEach((el) => {
        el.classList.toggle("dark-theme", isDark);
        el.classList.toggle("light-theme", !isDark);
      });
      if (typeof HubUI !== "undefined" && HubUI.syncTheme) {
        HubUI.syncTheme();
      }
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
   * 10. ROBLOX FOUNDATION DESIGN SYSTEM, SVG ICONS & SHADOW-DOM HUB UI
   * ============================================================================ */
  const Icons = {
    toolkit: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
    play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>`,
    server: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="7" rx="2"/><rect x="2" y="14" width="20" height="7" rx="2"/><circle cx="6" cy="6.5" r="1" fill="currentColor"/><circle cx="6" cy="17.5" r="1" fill="currentColor"/></svg>`,
    users: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    clock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    code: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    link: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    refresh: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
    eyeOff: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    chatOff: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`,
    download: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    tag: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  };

  const HUB_CSS = `
    :host {
      all: initial;
      --rbx-bg-canvas: #191B1D;
      --rbx-bg-surface: #232527;
      --rbx-bg-elevated: #2B2D2F;
      --rbx-bg-hover: rgba(255, 255, 255, 0.08);
      --rbx-bg-input: #191B1D;
      --rbx-text: #FFFFFF;
      --rbx-text-secondary: #BDBEBE;
      --rbx-border: rgba(255, 255, 255, 0.1);
      --rbx-border-strong: rgba(255, 255, 255, 0.24);
      --rbx-border-focus: #FFFFFF;
      --rbx-cta-bg: #FFFFFF;
      --rbx-cta-text: #191B1D;
      --rbx-cta-hover: #E3E5E7;
      --rbx-growth: #00B06F;
      --rbx-growth-hover: #009E63;
      --rbx-danger: #F74B52;
      --rbx-warning-bg: rgba(247, 185, 40, 0.12);
      --rbx-warning-border: rgba(247, 185, 40, 0.35);
      --rbx-warning-text: #FDE68A;
      --rbx-code-bg: #121315;
      --rbx-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23BDBEBE' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");

      font-family: "Builder Sans", "HCo Gotham SSm", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif;
      color: var(--rbx-text);
      font-size: 14px;
      line-height: 1.4;
      color-scheme: dark;
    }

    :host(.theme-light) {
      --rbx-bg-canvas: #F2F4F5;
      --rbx-bg-surface: #FFFFFF;
      --rbx-bg-elevated: #F2F4F5;
      --rbx-bg-hover: rgba(0, 0, 0, 0.05);
      --rbx-bg-input: #F2F4F5;
      --rbx-text: #191B1D;
      --rbx-text-secondary: #606162;
      --rbx-border: rgba(0, 0, 0, 0.1);
      --rbx-border-strong: rgba(0, 0, 0, 0.22);
      --rbx-border-focus: #191B1D;
      --rbx-cta-bg: #191B1D;
      --rbx-cta-text: #FFFFFF;
      --rbx-cta-hover: #393B3D;
      --rbx-warning-bg: rgba(217, 119, 6, 0.1);
      --rbx-warning-border: rgba(217, 119, 6, 0.35);
      --rbx-warning-text: #92400E;
      --rbx-code-bg: #F2F4F5;
      --rbx-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23606162' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      color-scheme: light;
    }

    * { box-sizing: border-box; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--rbx-border-strong); border-radius: 3px; }

    .rtk-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 2147483640;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.16s ease;
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
      background: var(--rbx-bg-canvas);
      border-left: 1px solid var(--rbx-border);
      box-shadow: -8px 0 28px rgba(0, 0, 0, 0.45);
      z-index: 2147483641;
      display: flex;
      flex-direction: column;
      transform: translateX(104%);
      transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
      color: var(--rbx-text);
    }
    .rtk-drawer.open {
      transform: translateX(0);
    }

    .rtk-header {
      height: 54px;
      padding: 0 18px;
      background: var(--rbx-bg-surface);
      border-bottom: 1px solid var(--rbx-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-shrink: 0;
    }
    .rtk-brand {
      display: flex;
      align-items: center;
      gap: 9px;
      font-weight: 700;
      font-size: 16px;
      letter-spacing: -0.01em;
      color: var(--rbx-text);
    }
    .rtk-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--rbx-bg-elevated);
      color: var(--rbx-text-secondary);
      border: 1px solid var(--rbx-border);
    }
    .rtk-badge-live {
      background: rgba(0, 176, 111, 0.16);
      color: #00B06F;
      border-color: rgba(0, 176, 111, 0.35);
    }
    .rtk-icon-btn {
      background: transparent;
      border: none;
      color: var(--rbx-text-secondary);
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.12s, color 0.12s;
    }
    .rtk-icon-btn:hover {
      background: var(--rbx-bg-hover);
      color: var(--rbx-text);
    }

    /* Roblox Native Underline Navigation Tabs */
    .rtk-tabs {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      background: var(--rbx-bg-surface);
      border-bottom: 1px solid var(--rbx-border);
      flex-shrink: 0;
    }
    .rtk-tab {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--rbx-text-secondary);
      height: 42px;
      padding: 0 4px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      white-space: nowrap;
      transition: color 0.12s, background 0.12s, border-color 0.12s;
    }
    .rtk-tab:hover {
      color: var(--rbx-text);
      background: var(--rbx-bg-hover);
    }
    .rtk-tab.active {
      color: var(--rbx-text);
      border-bottom-color: var(--rbx-text);
      font-weight: 700;
    }

    .rtk-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* Roblox Section Content Card */
    .rtk-card {
      background: var(--rbx-bg-surface);
      border-radius: 8px;
      padding: 16px;
    }
    .rtk-card-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--rbx-text);
      margin: 0 0 12px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .rtk-muted {
      color: var(--rbx-text-secondary);
      font-size: 12px;
      line-height: 1.35;
    }
    .rtk-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--rbx-text);
    }

    .rtk-row { display: flex; gap: 8px; align-items: center; }
    .rtk-col { display: flex; flex-direction: column; gap: 8px; }
    .rtk-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

    /* Roblox Native Inputs & Selects */
    .rtk-input, .rtk-select, .rtk-textarea {
      width: 100%;
      height: 38px;
      background-color: var(--rbx-bg-input);
      border: 1px solid var(--rbx-border-strong);
      color: var(--rbx-text);
      border-radius: 8px;
      padding: 0 12px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.12s;
    }
    .rtk-select {
      appearance: none;
      -webkit-appearance: none;
      background-image: var(--rbx-chevron);
      background-repeat: no-repeat;
      background-position: right 11px center;
      padding-right: 34px;
      cursor: pointer;
    }
    .rtk-select option {
      background-color: var(--rbx-bg-surface);
      color: var(--rbx-text);
    }
    .rtk-textarea {
      height: auto;
      min-height: 74px;
      padding: 8px 12px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    .rtk-input:hover, .rtk-select:hover, .rtk-textarea:hover {
      border-color: var(--rbx-text-secondary);
    }
    .rtk-input:focus, .rtk-select:focus, .rtk-textarea:focus {
      border-color: var(--rbx-border-focus);
    }

    /* Roblox Foundation Buttons */
    .rtk-btn {
      height: 36px;
      padding: 0 14px;
      border-radius: 8px;
      border: 1px solid var(--rbx-border-strong);
      background: transparent;
      color: var(--rbx-text);
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      white-space: nowrap;
      transition: background 0.12s, border-color 0.12s, opacity 0.12s;
    }
    .rtk-btn:hover {
      background: var(--rbx-bg-hover);
      border-color: var(--rbx-text);
    }
    .rtk-btn:disabled { opacity: 0.45; cursor: not-allowed; }

    /* High-contrast Roblox Primary Action (White on Dark / Black on Light) */
    .rtk-btn-cta {
      background: var(--rbx-cta-bg);
      border-color: var(--rbx-cta-bg);
      color: var(--rbx-cta-text);
    }
    .rtk-btn-cta:hover {
      background: var(--rbx-cta-hover);
      border-color: var(--rbx-cta-hover);
    }

    /* Roblox Growth Green (Play / Join Server) */
    .rtk-btn-growth {
      background: var(--rbx-growth);
      border-color: var(--rbx-growth);
      color: #FFFFFF;
    }
    .rtk-btn-growth:hover {
      background: var(--rbx-growth-hover);
      border-color: var(--rbx-growth-hover);
    }

    .rtk-btn-danger {
      border-color: rgba(247, 75, 82, 0.45);
      color: var(--rbx-danger);
    }
    .rtk-btn-danger:hover {
      background: rgba(247, 75, 82, 0.12);
      border-color: var(--rbx-danger);
    }
    .rtk-btn-sm { height: 28px; padding: 0 10px; font-size: 12px; border-radius: 6px; }

    .rtk-alert {
      padding: 12px 14px;
      border-radius: 8px;
      font-size: 12.5px;
      background: var(--rbx-warning-bg);
      border: 1px solid var(--rbx-warning-border);
      color: var(--rbx-warning-text);
    }

    /* Hero Action Cards (Ghost Mode / Mute Chat) */
    .rtk-hero-toggle {
      padding: 13px;
      border-radius: 8px;
      border: 1px solid var(--rbx-border-strong);
      background: var(--rbx-bg-surface);
      cursor: pointer;
      text-align: left;
      color: var(--rbx-text);
      font-family: inherit;
      display: flex;
      flex-direction: column;
      gap: 5px;
      transition: background 0.12s, border-color 0.12s;
    }
    .rtk-hero-toggle:hover { background: var(--rbx-bg-elevated); }
    .rtk-hero-toggle.active {
      border-color: var(--rbx-text);
      background: var(--rbx-bg-elevated);
    }

    /* Roblox Sliding Toggle Switch */
    .rtk-switch-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--rbx-border);
      cursor: pointer;
    }
    .rtk-switch-row:last-child { border-bottom: none; }
    .rtk-toggle {
      position: relative;
      width: 40px;
      height: 22px;
      flex-shrink: 0;
    }
    .rtk-toggle input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }
    .rtk-toggle-track {
      position: absolute;
      inset: 0;
      background: #606162;
      border-radius: 999px;
      transition: background 0.16s;
    }
    .rtk-toggle-track::after {
      content: "";
      position: absolute;
      width: 18px;
      height: 18px;
      left: 2px;
      top: 2px;
      background: #FFFFFF;
      border-radius: 50%;
      transition: transform 0.16s;
    }
    .rtk-toggle input:checked + .rtk-toggle-track {
      background: var(--rbx-growth);
    }
    .rtk-toggle input:checked + .rtk-toggle-track::after {
      transform: translateX(18px);
    }

    /* Roblox Settings Row */
    .rtk-setting-row {
      display: flex;
      flex-direction: column;
      gap: 7px;
      padding: 11px 0;
      border-bottom: 1px solid var(--rbx-border);
    }
    .rtk-setting-row:last-child { border-bottom: none; padding-bottom: 0; }

    /* Account & Game List Rows */
    .rtk-acc-item, .rtk-game-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--rbx-bg-elevated);
      border: 1px solid transparent;
    }
    .rtk-acc-item.current, .rtk-game-item.current {
      border-color: var(--rbx-border-strong);
    }
    .rtk-avatar {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: var(--rbx-bg-canvas);
      object-fit: cover;
      flex-shrink: 0;
    }
    .rtk-game-thumb {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      background: var(--rbx-bg-canvas);
      object-fit: cover;
      flex-shrink: 0;
    }
    .rtk-flex-1 { flex: 1; min-width: 0; }
    .rtk-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .rtk-kv-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 0;
      border-bottom: 1px solid var(--rbx-border);
      gap: 8px;
    }
    .rtk-kv-row:last-child { border-bottom: none; }

    .rtk-code {
      background: var(--rbx-code-bg);
      border: 1px solid var(--rbx-border);
      border-radius: 8px;
      padding: 10px 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      color: var(--rbx-text);
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 240px;
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
      background: var(--rbx-bg-surface);
      border: 1px solid var(--rbx-border-strong);
      color: var(--rbx-text);
      padding: 12px 14px;
      border-radius: 8px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .rtk-toast.error { border-left: 3px solid var(--rbx-danger); }
    .rtk-toast.success { border-left: 3px solid var(--rbx-growth); }
    .rtk-toast.info { border-left: 3px solid var(--rbx-text); }

    .rtk-floating-pill {
      position: fixed;
      bottom: 18px;
      left: 18px;
      z-index: 2147483630;
      background: var(--rbx-bg-surface);
      border: 1px solid var(--rbx-border-strong);
      color: var(--rbx-text);
      height: 36px;
      padding: 0 13px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
    }
    .rtk-floating-pill:hover { background: var(--rbx-bg-elevated); }
    .rtk-dot-live {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--rbx-growth);
      flex-shrink: 0;
    }
  `;

  function renderToggleSwitch(id, checked) {
    return `
      <span class="rtk-toggle">
        <input type="checkbox" id="${id}" ${checked ? "checked" : ""} />
        <span class="rtk-toggle-track"></span>
      </span>
    `;
  }

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

    isPageLightTheme() {
      return Boolean(
        document.body?.classList.contains("light-theme") ||
        document.documentElement?.classList.contains("light-theme") ||
        document.getElementById("rbx-body")?.classList.contains("light-theme")
      );
    },

    syncTheme() {
      if (!this.host) return;
      this.host.classList.toggle("theme-light", this.isPageLightTheme());
    },

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
        <aside class="rtk-drawer" id="rtk-drawer" aria-label="Roblox Toolkit">
          <div class="rtk-header">
            <div class="rtk-brand">
              ${Icons.toolkit}
              <span>Toolkit</span>
              <span class="rtk-badge">v${APP_VERSION}</span>
            </div>
            <div class="rtk-row">
              <span class="rtk-muted" title="Keyboard Shortcut">Alt+R</span>
              <button class="rtk-icon-btn" id="rtk-close" title="Close">${Icons.close}</button>
            </div>
          </div>
          <nav class="rtk-tabs" id="rtk-tabs">
            <button class="rtk-tab active" data-tab="joiner">${Icons.server}<span>Servers</span></button>
            <button class="rtk-tab" data-tab="accounts">${Icons.users}<span>Accounts</span></button>
            <button class="rtk-tab" data-tab="settings">${Icons.toolkit}<span>Settings</span></button>
            <button class="rtk-tab" data-tab="playtime">${Icons.clock}<span>Playtime</span></button>
            <button class="rtk-tab" data-tab="devtools">${Icons.code}<span>Dev</span></button>
          </nav>
          <div class="rtk-body" id="rtk-body"></div>
        </aside>
        <div class="rtk-toast-wrap" id="rtk-toasts"></div>
        <button class="rtk-floating-pill" id="rtk-pill" title="Open Toolkit (Alt+R)" style="display:none;">
          <span id="rtk-pill-dot" style="display:none;" class="rtk-dot-live"></span>
          ${Icons.toolkit}
          <span>Toolkit</span>
        </button>
      `;
      this.shadow.appendChild(wrapper);
      document.documentElement.appendChild(this.host);
      this.syncTheme();

      // Watch body class changes to sync Roblox Dark/Light theme automatically
      if (document.body) {
        new MutationObserver(() => this.syncTheme()).observe(document.body, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }

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
        btn.className = "rtk-btn rtk-btn-sm rtk-btn-cta";
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
      this.syncTheme();
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
      const curLabel = cur ? `Current (@${Utils.escapeHtml(cur.name)})` : "Current Account";
      let html = `<option value="current" ${selectedId === "current" ? "selected" : ""}>${curLabel}</option>`;
      for (const acc of AccountManager.getList()) {
        if (cur && String(acc.userId) === String(cur.id)) continue;
        const tag = acc.note ? ` (${Utils.escapeHtml(acc.note)})` : "";
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
            <span>Direct Server Joiner</span>
            ${pagePlaceId ? `<span class="rtk-badge">Place ${Utils.escapeHtml(pagePlaceId)}</span>` : ""}
          </div>
          <div class="rtk-col">
            <label class="rtk-label">Place ID</label>
            <input class="rtk-input" id="j-place" placeholder="e.g. 920587237" value="${Utils.escapeHtml(pagePlaceId)}" />
          </div>
          <div class="rtk-col">
            <label class="rtk-label">Server Job ID <span class="rtk-muted" style="font-weight:400;">(Optional)</span></label>
            <input class="rtk-input" id="j-job" placeholder="9134c999-91d5-4b52-9f0a-f7cbae67fe77" />
          </div>
          <div class="rtk-col">
            <label class="rtk-label">Account</label>
            <select class="rtk-select" id="j-account">${this.buildAccountOptionsHtml()}</select>
          </div>
          <button class="rtk-btn rtk-btn-growth" id="j-launch-btn" style="height:40px;font-size:14px;margin-top:4px;">
            ${Icons.play}<span>Join Experience</span>
          </button>
          <div class="rtk-grid-2">
            <button class="rtk-btn" id="j-smallest-btn">Smallest Server</button>
            <button class="rtk-btn" id="j-ping-btn">Lowest Ping</button>
          </div>
        </div>

        ${activeSession && activeSession.gameId ? `
          <div class="rtk-card rtk-col">
            <div class="rtk-card-title">
              <span class="rtk-row"><span class="rtk-dot-live"></span> Active Server</span>
            </div>
            <div class="rtk-muted">${Utils.escapeHtml(activeSession.name || "In-Experience")}</div>
            <div class="rtk-code">${Utils.escapeHtml(activeSession.gameId)}</div>
            <div class="rtk-grid-2">
              <button class="rtk-btn" id="j-copy-live-job">${Icons.copy}<span>Copy Job ID</span></button>
              <button class="rtk-btn" id="j-copy-live-link">${Icons.link}<span>Copy Join Link</span></button>
            </div>
          </div>
        ` : ""}

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Recent Servers</span>
            ${recent.length ? `<button class="rtk-btn rtk-btn-sm" id="j-clear-recent">Clear</button>` : ""}
          </div>
          ${recent.length === 0
            ? `<div class="rtk-muted">Recently joined Job IDs appear here for quick rejoining.</div>`
            : recent.map((item, idx) => `
              <div class="rtk-acc-item" data-recent-idx="${idx}">
                <div class="rtk-flex-1">
                  <div style="font-weight:600;" class="rtk-ellipsis">${Utils.escapeHtml(item.gameName || `Place ${item.placeId}`)}</div>
                  <div class="rtk-muted rtk-ellipsis">${Utils.escapeHtml(item.jobId.slice(0, 18))}... · @${Utils.escapeHtml(item.accountName)} · ${Utils.timeAgo(item.joinedAt)}</div>
                </div>
                <button class="rtk-btn rtk-btn-sm" data-copy-job="${Utils.escapeHtml(item.jobId)}">Copy</button>
                <button class="rtk-btn rtk-btn-sm rtk-btn-growth" data-rejoin-place="${Utils.escapeHtml(item.placeId)}" data-rejoin-job="${Utils.escapeHtml(item.jobId)}">Join</button>
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
          this.toast("Launching Roblox...", "success");
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
          this.toast(`Joining smallest server (${s.playing}/${s.maxPlayers})...`, "success");
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
        this.toast("Copied active Job ID.", "success");
      });

      body.querySelector("#j-copy-live-link")?.addEventListener("click", async () => {
        const pId = activeSession.placeId || activeSession.rootPlaceId || pagePlaceId;
        const link = `https://www.roblox.com/games/${pId}/-?serverJobId=${activeSession.gameId}`;
        await Utils.copyText(link);
        this.toast("Copied shareable join link.", "success");
      });

      body.querySelector("#j-clear-recent")?.addEventListener("click", () => {
        Store.set(STORAGE_KEYS.RECENT_SERVERS, []);
        this.renderJoinerTab(body);
      });

      body.querySelectorAll("[data-copy-job]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await Utils.copyText(btn.dataset.copyJob);
          this.toast("Job ID copied.", "success");
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
            <strong>HttpOnly Cookie Access Required for Automatic Switching</strong>
            <div>Enable <code>HttpOnly</code> cookies once in your userscript extension settings:</div>
            <div>• <b>Violentmonkey</b>: Dashboard → Settings → Advanced → Enable <b>HTTP-Only cookies</b>.</div>
            <div>• <b>Tampermonkey</b>: Dashboard → Settings → Config Mode: <b>Advanced</b> → Security → Set <b>Allow scripts to access cookies</b> to <b>All</b>.</div>
            <button class="rtk-btn rtk-btn-sm" id="acc-recheck-btn" style="align-self:flex-start;">${Icons.refresh}<span>Re-check Access</span></button>
          </div>
        ` : ""}

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Current Session</span>
            <span class="rtk-badge ${cur ? "rtk-badge-live" : ""}">${cur ? "Active" : "Signed Out"}</span>
          </div>
          ${cur ? `
            <div class="rtk-acc-item current">
              <img class="rtk-avatar" src="${Utils.escapeHtml(cur.avatarUrl || "https://www.roblox.com/favicon.ico")}" alt="" />
              <div class="rtk-flex-1">
                <div style="font-weight:700;">${Utils.escapeHtml(cur.displayName)}</div>
                <div class="rtk-muted">@${Utils.escapeHtml(cur.name)} · ID ${Utils.escapeHtml(cur.id)}</div>
              </div>
            </div>
          ` : `<div class="rtk-muted">Not signed in. Switch to a saved account below or sign in.</div>`}
          <div class="rtk-grid-2">
            <button class="rtk-btn rtk-btn-cta" id="acc-capture-now">Save Active Cookie</button>
            <button class="rtk-btn" id="acc-clean-login" title="Detaches current cookie without invalidating it on Roblox servers">${Icons.plus}<span>Add via Login</span></button>
          </div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title" style="margin-bottom:4px;"><span>Preferences</span></div>
          <label class="rtk-switch-row">
            <div>
              <div class="rtk-label">Auto-Save Active Account</div>
              <div class="rtk-muted">Automatically store cookie of the signed-in account</div>
            </div>
            ${renderToggleSwitch("acc-opt-auto", settings.autoCaptureAccounts)}
          </label>
          <label class="rtk-switch-row">
            <div>
              <div class="rtk-label">Logout Protection</div>
              <div class="rtk-muted">Prevent Roblox Log Out from invalidating saved cookies</div>
            </div>
            ${renderToggleSwitch("acc-opt-guard", settings.logoutGuard)}
          </label>
          <label class="rtk-switch-row">
            <div>
              <div class="rtk-label">Restore Account After "Join As"</div>
              <div class="rtk-muted">Switch browser back to previous account after client launches</div>
            </div>
            ${renderToggleSwitch("acc-opt-restore", settings.restoreAccountAfterJoin)}
          </label>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title"><span>Manual Cookie Import</span></div>
          <input type="password" class="rtk-input" id="acc-manual-cookie" placeholder="Paste .ROBLOSECURITY cookie..." autocomplete="off" />
          <div class="rtk-row">
            <input type="text" class="rtk-input rtk-flex-1" id="acc-manual-note" placeholder="Label (e.g. Main, Alt, Dev)" />
            <button class="rtk-btn rtk-btn-cta" id="acc-manual-add-btn">Save</button>
          </div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Switch Accounts (${AccountManager.getList().length})</span>
            <div class="rtk-row">
              <button class="rtk-btn rtk-btn-sm" id="acc-export-btn">Export</button>
              <button class="rtk-btn rtk-btn-sm" id="acc-import-btn">Import</button>
            </div>
          </div>
          <input class="rtk-input" id="acc-search" placeholder="Search accounts..." value="${Utils.escapeHtml(this.accSearch)}" />
          <div class="rtk-col" id="acc-list">
            ${accounts.length === 0
              ? `<div class="rtk-muted">No saved accounts match.</div>`
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
                        <div class="rtk-muted rtk-ellipsis">@${Utils.escapeHtml(acc.username)}</div>
                      </div>
                      <div class="rtk-row" style="gap:5px;">
                        ${isCurrent
                          ? `<span class="rtk-badge rtk-badge-live">Current</span>`
                          : `<button class="rtk-btn rtk-btn-sm rtk-btn-cta" data-acc-switch="${Utils.escapeHtml(acc.userId)}">Switch</button>`}
                        <button class="rtk-btn rtk-btn-sm" title="Edit Label" data-acc-note="${Utils.escapeHtml(acc.userId)}">${Icons.tag}</button>
                        <button class="rtk-btn rtk-btn-sm" title="Copy Cookie" data-acc-copy="${Utils.escapeHtml(acc.userId)}">${Icons.copy}</button>
                        <button class="rtk-btn rtk-btn-sm rtk-btn-danger" title="Remove" data-acc-del="${Utils.escapeHtml(acc.userId)}">✕</button>
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
        this.toast(AccountManager.cookieStatus.ok ? "HttpOnly cookie access verified." : "Still blocked — check extension settings.", AccountManager.cookieStatus.ok ? "success" : "error");
      });

      body.querySelector("#acc-capture-now").addEventListener("click", async () => {
        try {
          const saved = await AccountManager.captureCurrentNow();
          this.toast(`Saved @${saved.username}.`, "success");
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
          this.toast(`Added @${entry.username}.`, "success");
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
          const next = window.prompt("Account label (e.g. Main, Alt, Dev):", existing);
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
            this.toast(`Copied cookie for @${entry.username}.`, "info");
          }
        });
      });

      body.querySelectorAll("[data-acc-del]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const uid = btn.dataset.accDel;
          const entry = AccountManager.getAll()[uid];
          if (window.confirm(`Remove @${entry?.username || uid} from saved accounts?`)) {
            AccountManager.removeEntry(uid);
            this.renderAccountsTab(body);
            GamePageUI.refreshAccountSelectors();
          }
        });
      });

      body.querySelector("#acc-export-btn").addEventListener("click", () => {
        const json = JSON.stringify(AccountManager.getAll(), null, 2);
        DevTools.triggerBlobDownload(new TextEncoder().encode(json), `roblox-accounts-backup-${Date.now()}.json`, "application/json");
        this.toast("Exported accounts JSON backup.", "info");
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
            this.toast("Imported accounts.", "success");
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
        body.innerHTML = `<div class="rtk-card"><div class="rtk-muted">Sign in to adjust privacy and experience settings.</div></div>`;
        return;
      }

      if (!QuickSettings.loaded) {
        body.innerHTML = `<div class="rtk-card"><div class="rtk-muted">Loading account settings...</div></div>`;
        try {
          await QuickSettings.load();
        } catch (err) {
          body.innerHTML = `<div class="rtk-alert">Failed to load settings: ${Utils.escapeHtml(err.message)}</div>`;
          return;
        }
      }

      const ghostOn = QuickSettings.isGhostActive();
      const chatMuted = QuickSettings.isChatMuted();

      body.innerHTML = `
        <div class="rtk-grid-2">
          <button class="rtk-hero-toggle ${ghostOn ? "active" : ""}" id="qs-ghost-btn">
            <div class="rtk-row" style="justify-content:space-between;width:100%;">
              <span class="rtk-row" style="font-weight:700;font-size:13.5px;">${Icons.eyeOff}<span>Appear Offline</span></span>
              <span class="rtk-badge ${ghostOn ? "rtk-badge-live" : ""}">${ghostOn ? "ON" : "OFF"}</span>
            </div>
            <div class="rtk-muted">${ghostOn ? "Status & joins hidden. Click to restore." : "Hide online status & block joins"}</div>
          </button>
          <button class="rtk-hero-toggle ${chatMuted ? "active" : ""}" id="qs-mute-btn">
            <div class="rtk-row" style="justify-content:space-between;width:100%;">
              <span class="rtk-row" style="font-weight:700;font-size:13.5px;">${Icons.chatOff}<span>Mute Chat</span></span>
              <span class="rtk-badge ${chatMuted ? "rtk-badge-live" : ""}">${chatMuted ? "ON" : "OFF"}</span>
            </div>
            <div class="rtk-muted">${chatMuted ? "Chat disabled. Click to unmute." : "Disable experience & app chat"}</div>
          </button>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Quick Presets</span>
            <button class="rtk-btn rtk-btn-sm" id="qs-refresh-btn">${Icons.refresh}<span>Sync</span></button>
          </div>
          <div class="rtk-row" style="flex-wrap:wrap;">
            <button class="rtk-btn rtk-btn-sm" data-preset="grinding">Solo Grinding</button>
            <button class="rtk-btn rtk-btn-sm" data-preset="friends">Friends Only</button>
            <button class="rtk-btn rtk-btn-sm" data-preset="public">Everyone / Public</button>
          </div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title" style="margin-bottom:4px;"><span>Privacy & Content Restrictions</span></div>
          ${SETTING_DEFINITIONS.filter((def) => QuickSettings.values[def.key] !== undefined || def.key === "themeType")
            .map((def) => {
              const curVal = QuickSettings.values[def.key] || "";
              const opts = QuickSettings.optionsMap[def.key] || def.fallbackOptions;
              return `
                <div class="rtk-setting-row">
                  <div>
                    <div class="rtk-label">${Utils.escapeHtml(def.label)}</div>
                    <div class="rtk-muted">${Utils.escapeHtml(def.desc)}</div>
                  </div>
                  <select class="rtk-select" data-qs-key="${Utils.escapeHtml(def.key)}">
                    ${opts
                      .map((o) => {
                        const valStr = extractSettingString(o) || String(o);
                        return `<option value="${Utils.escapeHtml(valStr)}" ${String(curVal) === valStr ? "selected" : ""}>${Utils.escapeHtml(QuickSettings.formatOption(valStr))}</option>`;
                      })
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
          this.toast(res.active ? "Appear Offline enabled." : "Online visibility restored.", "success");
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
          this.toast(res.muted ? "All chat muted." : "Chat restored.", "success");
          this.renderSettingsTab(body);
        } catch (err) {
          this.toast(err.message, "error");
          e.currentTarget.disabled = false;
        }
      });

      body.querySelector("#qs-refresh-btn").addEventListener("click", async () => {
        QuickSettings.loaded = false;
        await this.renderSettingsTab(body);
        this.toast("Settings synced.", "info");
      });

      body.querySelectorAll("[data-preset]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            await QuickSettings.applyPreset(btn.dataset.preset);
            this.toast(`Applied ${btn.textContent.trim()} preset.`, "success");
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
            this.toast(`Saved: ${QuickSettings.formatOption(val)}`, "success");
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
          <div class="rtk-card rtk-col" style="border:1px solid var(--rbx-border-strong);">
            <div class="rtk-card-title">
              <span class="rtk-row"><span class="rtk-dot-live"></span> ${activeSession.presenceType === 3 ? "In Roblox Studio" : "Playing Now"}</span>
              <span class="rtk-badge rtk-badge-live" id="rtk-live-session-timer">${Utils.formatDuration(PlaytimeTracker.getLiveSessionElapsed(activeSession))}</span>
            </div>
            <div class="rtk-row">
              ${activeSession.iconUrl ? `<img class="rtk-game-thumb" src="${Utils.escapeHtml(activeSession.iconUrl)}" alt="" />` : ""}
              <div class="rtk-flex-1">
                <div style="font-weight:700;">${Utils.escapeHtml(activeSession.name)}</div>
                <div class="rtk-muted">@${Utils.escapeHtml(activeSession.username || "Current")}${activeSession.gameId ? ` · ${Utils.escapeHtml(activeSession.gameId.slice(0, 8))}...` : ""}</div>
              </div>
              ${activeSession.gameId ? `<button class="rtk-btn rtk-btn-sm" id="pt-copy-job">${Icons.copy}<span>Job ID</span></button>` : ""}
            </div>
          </div>
        ` : `
          <div class="rtk-card">
            <div class="rtk-muted">Playtime tracking runs automatically whenever your online status enters an experience.</div>
          </div>
        `}

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Experiences (${Utils.formatDuration(totalAcrossAll)})</span>
            <div class="rtk-row">
              <button class="rtk-btn rtk-btn-sm" id="pt-poll-now" title="Refresh Presence">${Icons.refresh}</button>
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
              <option value="time" ${this.playtimeSort === "time" ? "selected" : ""}>Most Played</option>
              <option value="recent" ${this.playtimeSort === "recent" ? "selected" : ""}>Recently Played</option>
              <option value="name" ${this.playtimeSort === "name" ? "selected" : ""}>Name (A–Z)</option>
            </select>
          </div>
          <input class="rtk-input" id="pt-search" placeholder="Search experiences..." value="${Utils.escapeHtml(this.playtimeSearch)}" />
          <label class="rtk-switch-row">
            <span class="rtk-muted">Include Roblox Studio time</span>
            ${renderToggleSwitch("pt-studio-opt", settings.trackStudioTime)}
          </label>

          <div class="rtk-col">
            ${list.length === 0
              ? `<div class="rtk-muted" style="padding:8px 0;">No playtime recorded yet.</div>`
              : list
                  .map(
                    (g, i) => `
                    <div class="rtk-game-item ${g.isCurrentlyPlaying ? "current" : ""}">
                      <div style="font-weight:700;width:22px;text-align:center;" class="rtk-muted">${i + 1}</div>
                      <img class="rtk-game-thumb" src="${Utils.escapeHtml(g.iconUrl || "https://www.roblox.com/favicon.ico")}" alt="" />
                      <div class="rtk-flex-1">
                        <div style="font-weight:700;" class="rtk-ellipsis">${Utils.escapeHtml(g.name)}</div>
                        <div class="rtk-muted">
                          <strong style="color:var(--rbx-text);">${Utils.formatDuration(g.computedSeconds)}</strong>
                          · ${g.sessions || 1} session${(g.sessions || 1) === 1 ? "" : "s"}
                          · ${Utils.timeAgo(g.lastPlayedAt)}
                        </div>
                      </div>
                      ${g.rootPlaceId || g.placeId
                        ? `<button class="rtk-btn rtk-btn-sm rtk-btn-growth" data-pt-play="${Utils.escapeHtml(g.rootPlaceId || g.placeId)}">${Icons.play}</button>`
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
        this.toast("Copied active Job ID.", "success");
      });

      body.querySelector("#pt-poll-now").addEventListener("click", async () => {
        await PlaytimeTracker.poll();
        this.renderPlaytimeTab(body);
        this.toast("Presence updated.", "info");
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
        DevTools.triggerBlobDownload(new TextEncoder().encode(json), `roblox-playtime-${Date.now()}.json`, "application/json");
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
            <span>Page & Experience Inspector</span>
            <span class="rtk-badge">${Utils.escapeHtml(ctx.type.toUpperCase())}</span>
          </div>
          <div id="dt-inspector-rows" class="rtk-col">
            <div class="rtk-muted">Loading metadata...</div>
          </div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title"><span>Asset & Image ID Extractor</span></div>
          <div class="rtk-muted">Resolve underlying <code>ImageLabel</code> / Template IDs from Decals, Shirts, Pants, or Models, and download raw asset files.</div>
          <div class="rtk-row">
            <input class="rtk-input rtk-flex-1" id="dt-asset-id" placeholder="Asset ID (Decal, Clothing, Audio, Model)" value="${Utils.escapeHtml(prefillAsset)}" />
            <button class="rtk-btn rtk-btn-cta" id="dt-inspect-asset-btn">Inspect</button>
          </div>
          <div id="dt-asset-result"></div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title"><span>Luau Snippets</span></div>
          ${snippets
            .map(
              (s, i) => `
              <div class="rtk-col">
                <div class="rtk-row" style="justify-content:space-between;">
                  <span class="rtk-muted">${Utils.escapeHtml(s.title)}</span>
                  <button class="rtk-btn rtk-btn-sm" data-snip-idx="${i}">${Icons.copy}<span>Copy</span></button>
                </div>
                <div class="rtk-code">${Utils.escapeHtml(s.code)}</div>
              </div>
            `
            )
            .join("")}
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title"><span>API Console (Auto-CSRF)</span></div>
          <select class="rtk-select" id="dt-api-preset">
            <option value="">Select Endpoint Template...</option>
            <option value="GET|https://users.roblox.com/v1/users/authenticated|">GET Authenticated User</option>
            <option value="POST|https://presence.roblox.com/v1/presence/users|${Utils.escapeHtml(JSON.stringify({ userIds: [AccountManager.activeUser?.id || 1] }))}">POST Presence & Active Job ID</option>
            <option value="GET|https://apis.roblox.com/user-settings-api/v1/user-settings|">GET User Settings</option>
            ${ctx.type === "game" && ctx.id ? `<option value="GET|https://games.roblox.com/v1/games/${ctx.id}/servers/Public?limit=10|">GET Public Servers (Current Place)</option>` : ""}
            <option value="GET|https://economy.roblox.com/v1/users/${AccountManager.activeUser?.id || 1}/currency|">GET Robux Balance</option>
          </select>
          <div class="rtk-row">
            <select class="rtk-select" id="dt-api-method" style="width:100px;">
              <option>GET</option>
              <option>POST</option>
              <option>PATCH</option>
              <option>DELETE</option>
            </select>
            <input class="rtk-input rtk-flex-1" id="dt-api-url" placeholder="https://users.roblox.com/v1/users/authenticated" value="https://users.roblox.com/v1/users/authenticated" />
          </div>
          <textarea class="rtk-textarea" id="dt-api-body" placeholder='Optional JSON body, e.g. {"userIds":[1]}'></textarea>
          <div class="rtk-row">
            <button class="rtk-btn rtk-btn-cta rtk-flex-1" id="dt-api-send">Send Request</button>
            <button class="rtk-btn rtk-btn-sm" id="dt-api-copy-fetch">fetch()</button>
            <button class="rtk-btn rtk-btn-sm" id="dt-api-copy-luau">HttpService</button>
          </div>
          <div id="dt-api-output"></div>
        </div>
      `;

      DevTools.inspectCurrentPage().then((info) => {
        const container = body.querySelector("#dt-inspector-rows");
        if (!container) return;
        let html = info.fields
          .map(
            (f) => `
            <div class="rtk-kv-row">
              <span class="rtk-muted">${Utils.escapeHtml(f.label)}</span>
              <div class="rtk-row">
                <code>${Utils.escapeHtml(f.value)}</code>
                ${f.copy ? `<button class="rtk-btn rtk-btn-sm" data-dt-copy="${Utils.escapeHtml(f.copyVal || f.value)}">${Icons.copy}</button>` : ""}
              </div>
            </div>
          `
          )
          .join("");

        if (info.liveJobId) {
          html += `
            <div class="rtk-kv-row">
              <span class="rtk-muted">Active Job ID</span>
              <div class="rtk-row">
                <code style="color:var(--rbx-growth);">${Utils.escapeHtml(info.liveJobId.slice(0, 13))}...</code>
                <button class="rtk-btn rtk-btn-sm" data-dt-copy="${Utils.escapeHtml(info.liveJobId)}">${Icons.copy}</button>
              </div>
            </div>
          `;
        }
        if (info.contextType === "game" && info.primaryId) {
          html += `
            <div class="rtk-row" style="margin-top:6px;">
              <button class="rtk-btn rtk-flex-1" id="dt-open-studio" data-place="${Utils.escapeHtml(info.primaryId)}" data-univ="${Utils.escapeHtml(info.gameMeta?.id || "")}">Open in Roblox Studio</button>
            </div>
          `;
        }
        container.innerHTML = html || `<div class="rtk-muted">Open a Game, Catalog item, User, or Group page to inspect metadata.</div>`;

        container.querySelectorAll("[data-dt-copy]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            await Utils.copyText(btn.dataset.dtCopy);
            this.toast(`Copied: ${btn.dataset.dtCopy}`, "success");
          });
        });

        container.querySelector("#dt-open-studio")?.addEventListener("click", (e) => {
          const ok = Launcher.openInStudio(e.currentTarget.dataset.place, e.currentTarget.dataset.univ);
          if (ok) this.toast("Opening Roblox Studio...", "info");
          else this.toast("Studio launcher unavailable on this page.", "error");
        });
      });

      body.querySelector("#dt-inspect-asset-btn").addEventListener("click", async (e) => {
        const idVal = body.querySelector("#dt-asset-id").value.trim();
        const out = body.querySelector("#dt-asset-result");
        e.currentTarget.disabled = true;
        out.innerHTML = `<div class="rtk-muted">Fetching asset stream...</div>`;
        try {
          const data = await DevTools.inspectAssetAndExtractIds(idVal);
          out.innerHTML = `
            <div class="rtk-col" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--rbx-border);">
              <div class="rtk-kv-row"><span class="rtk-muted">Name</span><b>${Utils.escapeHtml(data.name)}</b></div>
              <div class="rtk-kv-row"><span class="rtk-muted">Format</span><span>${Utils.escapeHtml(data.format.kind)} (${(data.byteSize / 1024).toFixed(1)} KB)</span></div>
              <div class="rtk-row" style="flex-wrap:wrap;">
                <button class="rtk-btn rtk-btn-sm rtk-btn-cta" id="dt-dl-raw">${Icons.download}<span>Download .${Utils.escapeHtml(data.format.ext)}</span></button>
                <button class="rtk-btn rtk-btn-sm" data-dt-uri="rbxassetid://${Utils.escapeHtml(data.assetId)}">rbxassetid://</button>
                <button class="rtk-btn rtk-btn-sm" data-dt-uri="rbxthumb://type=Asset&id=${Utils.escapeHtml(data.assetId)}&w=420&h=420">rbxthumb://</button>
              </div>
              ${data.extractedIds.length > 0 ? `
                <div class="rtk-muted" style="margin-top:4px;">Referenced Asset / Image IDs (${data.extractedIds.length}):</div>
                ${data.extractedIds
                  .map(
                    (eid) => `
                  <div class="rtk-kv-row">
                    <code>rbxassetid://${Utils.escapeHtml(eid)}</code>
                    <div class="rtk-row">
                      <button class="rtk-btn rtk-btn-sm" data-dt-uri="${Utils.escapeHtml(eid)}">ID</button>
                      <button class="rtk-btn rtk-btn-sm" data-dt-uri="rbxassetid://${Utils.escapeHtml(eid)}">URI</button>
                    </div>
                  </div>
                `
                  )
                  .join("")}
              ` : `<div class="rtk-muted">Direct binary asset — click Download above to save file.</div>`}
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

      body.querySelectorAll("[data-snip-idx]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const snip = snippets[Number(btn.dataset.snipIdx)];
          if (snip) {
            await Utils.copyText(snip.code);
            this.toast("Copied Luau snippet.", "success");
          }
        });
      });

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
              <span class="rtk-badge ${res.ok ? "rtk-badge-live" : ""}">HTTP ${res.status} · ${res.durationMs} ms</span>
              <button class="rtk-btn rtk-btn-sm" id="dt-copy-resp">${Icons.copy}<span>Copy</span></button>
            </div>
            <div class="rtk-code">${Utils.escapeHtml(formatted)}</div>
          `;
          out.querySelector("#dt-copy-resp")?.addEventListener("click", async () => {
            await Utils.copyText(formatted);
            this.toast("Copied response.", "success");
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
        this.toast("Copied fetch() snippet.", "success");
      });

      body.querySelector("#dt-api-copy-luau").addEventListener("click", async () => {
        const { luauCode } = DevTools.buildCodeFromApiCall(
          body.querySelector("#dt-api-method").value,
          body.querySelector("#dt-api-url").value.trim(),
          body.querySelector("#dt-api-body").value
        );
        await Utils.copyText(luauCode);
        this.toast("Copied HttpService snippet.", "success");
      });
    },
  };

  /* ============================================================================
   * 11. IN-PAGE ROBLOX-NATIVE CONTROLS, NAVBAR ICON, LOGOUT GUARD & BOOTSTRAP
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
        vertical-align: middle;
        margin: 0 2px;
      }
      #rtk-navbar-btn {
        position: relative;
        width: 36px;
        height: 36px;
        padding: 0;
        border-radius: 50%;
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.12s ease;
      }
      #rtk-navbar-btn:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }
      .light-theme #rtk-navbar-btn:hover,
      body.light-theme #rtk-navbar-btn:hover {
        background-color: rgba(0, 0, 0, 0.06);
      }
      #rtk-navbar-live-dot {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #00B06F;
        display: none;
      }

      /* Matches Roblox .section-content inside #game-instances */
      #roblox-jobid-joiner-container {
        background-color: #232527;
        border-radius: 8px;
        padding: 16px;
        margin: 12px 0 18px 0;
        font-family: "Builder Sans", "HCo Gotham SSm", "Helvetica Neue", Helvetica, Arial, sans-serif;
        color: #FFFFFF;
      }
      .light-theme #roblox-jobid-joiner-container,
      body.light-theme #roblox-jobid-joiner-container {
        background-color: #FFFFFF;
        color: #191B1D;
        border: 1px solid rgba(0, 0, 0, 0.08);
      }
      .rtk-srv-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        gap: 8px;
      }
      .rtk-srv-title {
        font-size: 16px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
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
        padding: 0 12px;
        font-size: 14px;
        font-family: inherit;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.24);
        background-color: #191B1D;
        color: #FFFFFF;
        outline: none;
        transition: border-color 0.12s ease;
      }
      .light-theme .rtk-srv-input,
      body.light-theme .rtk-srv-input {
        background-color: #F2F4F5;
        border-color: rgba(0, 0, 0, 0.22);
        color: #191B1D;
      }
      .rtk-srv-input:focus {
        border-color: #FFFFFF;
      }
      .light-theme .rtk-srv-input:focus,
      body.light-theme .rtk-srv-input:focus {
        border-color: #191B1D;
      }

      .rtk-srv-select {
        height: 38px;
        padding: 0 32px 0 12px;
        font-size: 13.5px;
        font-family: inherit;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.24);
        background-color: #191B1D;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23BDBEBE' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
        appearance: none;
        -webkit-appearance: none;
        color: #FFFFFF;
        outline: none;
        max-width: 210px;
        cursor: pointer;
      }
      .rtk-srv-select option {
        background-color: #232527;
        color: #FFFFFF;
      }
      .light-theme .rtk-srv-select,
      body.light-theme .rtk-srv-select {
        background-color: #F2F4F5;
        border-color: rgba(0, 0, 0, 0.22);
        color: #191B1D;
      }
      .light-theme .rtk-srv-select option,
      body.light-theme .rtk-srv-select option {
        background-color: #FFFFFF;
        color: #191B1D;
      }

      .rtk-srv-join-btn {
        height: 38px;
        padding: 0 20px;
        border-radius: 8px;
        border: none;
        background-color: #00B06F;
        color: #FFFFFF;
        font-size: 14px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
        transition: background-color 0.12s ease;
      }
      .rtk-srv-join-btn:hover { background-color: #009E63; }

      /* Matches Roblox .btn-control-sm */
      .rtk-srv-chip {
        height: 30px;
        padding: 0 11px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.24);
        background: transparent;
        color: inherit;
        font-size: 12.5px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        transition: background-color 0.12s ease, border-color 0.12s ease;
      }
      .rtk-srv-chip:hover {
        background-color: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.45);
      }
      .light-theme .rtk-srv-chip,
      body.light-theme .rtk-srv-chip {
        border-color: rgba(0, 0, 0, 0.22);
      }
      .light-theme .rtk-srv-chip:hover,
      body.light-theme .rtk-srv-chip:hover {
        background-color: rgba(0, 0, 0, 0.05);
        border-color: rgba(0, 0, 0, 0.45);
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
        margin-top: 8px;
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
        document.querySelector("ul.navbar-right.rbx-navbar-icon-group") ||
        document.querySelector("ul.navbar-right") ||
        document.querySelector(".rbx-navbar-right") ||
        document.querySelector("#header .navbar-right");

      if (navRight) {
        const li = document.createElement("li");
        li.id = "rtk-navbar-item";
        li.className = "rbx-navbar-right-item";
        li.innerHTML = `
          <button type="button" id="rtk-navbar-btn" title="Toolkit (Alt+R)" aria-label="Open Toolkit">
            ${Icons.toolkit}
            <span id="rtk-navbar-live-dot"></span>
          </button>
        `;
        li.querySelector("#rtk-navbar-btn").addEventListener("click", () => HubUI.toggle());
        navRight.insertBefore(li, navRight.firstChild);
        const isVisible = li.offsetParent !== null;
        if (pill) pill.style.display = isVisible ? "none" : "inline-flex";
      } else if (pill) {
        pill.style.display = "inline-flex";
      }
    },

    showServerBarStatus(msg, color = "#00B06F") {
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
          <h3 class="rtk-srv-title">${Icons.server}<span>Join Server by Job ID</span></h3>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-open-hub">${Icons.toolkit}<span>Toolkit (Alt+R)</span></button>
        </div>
        <div class="rtk-srv-row">
          <input
            type="text"
            id="roblox-jobid-input"
            class="rtk-srv-input"
            placeholder="Server Job ID (e.g. 9134c999-91d5-4b52-9f0a-f7cbae67fe77)"
            autocomplete="off"
            spellcheck="false"
          />
          <select id="rtk-srv-account" class="rtk-srv-select rtk-account-dropdown" title="Account to join with">
            ${HubUI.buildAccountOptionsHtml()}
          </select>
          <button type="button" id="roblox-jobid-join-btn" class="rtk-srv-join-btn">Join</button>
        </div>
        <div class="rtk-srv-row" style="margin-top:10px;">
          <button type="button" class="rtk-srv-chip" id="rtk-srv-smallest">Smallest Server</button>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-ping">Lowest Ping</button>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-copy-live">${Icons.copy}<span>Copy Active Job ID</span></button>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-manage-acc">${Icons.users}<span>Accounts</span></button>
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
          this.showServerBarStatus("Enter a valid Server Job ID.", "#F74B52");
          return;
        }
        try {
          this.showServerBarStatus("Launching Roblox...", "#00B06F");
          await Launcher.join(placeId, rawJob, accSelect.value);
        } catch (err) {
          this.showServerBarStatus(err.message, "#F74B52");
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
          this.showServerBarStatus("Finding smallest server...", "#BDBEBE");
          const s = await Launcher.joinSmallestServer(Utils.getPlaceIdFromPage(), accSelect.value);
          this.showServerBarStatus(`Joining server (${s.playing}/${s.maxPlayers} players)...`, "#00B06F");
        } catch (err) {
          this.showServerBarStatus(err.message, "#F74B52");
        }
      });

      box.querySelector("#rtk-srv-ping").addEventListener("click", async () => {
        try {
          this.showServerBarStatus("Finding lowest ping server...", "#BDBEBE");
          const s = await Launcher.joinLowestPingServer(Utils.getPlaceIdFromPage(), accSelect.value);
          this.showServerBarStatus(`Joining server (${s.ping} ms)...`, "#00B06F");
        } catch (err) {
          this.showServerBarStatus(err.message, "#F74B52");
        }
      });

      box.querySelector("#rtk-srv-copy-live").addEventListener("click", async () => {
        await PlaytimeTracker.poll();
        const liveJob = PlaytimeTracker.getData().activeSession?.gameId;
        if (liveJob) {
          await Utils.copyText(liveJob);
          this.showServerBarStatus(`Copied active Job ID: ${liveJob}`, "#00B06F");
        } else {
          this.showServerBarStatus("No active server Job ID detected (ensure you are in an experience and status is visible).", "#BDBEBE");
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
        <select id="rtk-main-play-acc" class="rtk-srv-select rtk-account-dropdown" style="height:34px;font-size:13px;flex:1;max-width:none;">
          ${HubUI.buildAccountOptionsHtml()}
        </select>
        <button type="button" id="rtk-main-play-as-btn" class="rtk-srv-chip" style="height:34px;padding:0 14px;">
          ${Icons.play}<span>Play As</span>
        </button>
      `;

      playContainer.parentElement.insertBefore(bar, playContainer.nextSibling);

      bar.querySelector("#rtk-main-play-as-btn").addEventListener("click", async () => {
        const accId = bar.querySelector("#rtk-main-play-acc").value;
        try {
          await Launcher.join(Utils.getPlaceIdFromPage(), null, accId);
          HubUI.toast("Launching Roblox...", "success");
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
          <button type="button" class="rtk-srv-chip" data-card-copy="${Utils.escapeHtml(jobId)}" title="${Utils.escapeHtml(jobId)}">${Icons.copy}<span>Job ID</span></button>
          <button type="button" class="rtk-srv-chip" data-card-link="${Utils.escapeHtml(jobId)}">${Icons.link}<span>Link</span></button>
          <button type="button" class="rtk-srv-chip" data-card-joinas="${Utils.escapeHtml(jobId)}">${Icons.users}<span>Join As</span></button>
        `;

        tools.querySelector("[data-card-copy]").addEventListener("click", async () => {
          await Utils.copyText(jobId);
          HubUI.toast("Copied server Job ID.", "success");
        });

        tools.querySelector("[data-card-link]").addEventListener("click", async () => {
          const placeId = Utils.getPlaceIdFromPage();
          const url = `https://www.roblox.com/games/${placeId}/-?serverJobId=${jobId}`;
          await Utils.copyText(url);
          HubUI.toast("Copied shareable server link.", "success");
        });

        tools.querySelector("[data-card-joinas]").addEventListener("click", async () => {
          const srvSelect = document.getElementById("rtk-srv-account");
          const accId = srvSelect ? srvSelect.value : "current";
          if (accId === "current") {
            HubUI.toast("Select a target account in the Servers bar dropdown above to join on another account.", "info");
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
          `[Toolkit Logout Protection]\n\n@${AccountManager.activeUser.name} is saved in your Account Switcher.\n\nRoblox's native "Log Out" permanently invalidates your saved .ROBLOSECURITY cookie on Roblox's servers.\n\n• Click OK to safely detach and open the Login page WITHOUT invalidating your saved cookie.\n• Click Cancel to stay signed in. (To permanently log out, remove this account from Toolkit first or disable Logout Protection.)`
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
        `Client launched. Restoring @${prevAcc.username} in 5s...`,
        "info",
        {
          label: "Cancel",
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
        `Joined as @${AccountManager.activeUser?.name || "alt"}.`,
        "info",
        {
          label: `Switch back to @${prevAcc.username}`,
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
