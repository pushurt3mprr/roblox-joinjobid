// ==UserScript==
// @name         Roblox Multi-Tool & Job ID Joiner
// @namespace    https://github.com/pushurt3mprr
// @version      5.0.0
// @description  Ultimate all-in-one Roblox toolkit for Firefox: Job ID Joiner, Spotlight Command Palette (Ctrl+K), Server Region/Version Inspector, Auto-Rejoin Watchdog, Player Finder, VIP Link Vault, Multi-Account Portfolio & Switcher, Friends & Unfriend Tracker, Subplaces/Groups/Banned/Outfit Explorer, Rolimon's Trade & Economy Suite, FFlag Generator, Audio/Script Extractor, QoL & Playtime Heatmap.
// @author       pushurt3mprr
// @match        https://*.roblox.com/*
// @icon         https://www.roblox.com/favicon.ico
// @downloadURL  https://raw.githubusercontent.com/pushurt3mprr/roblox-jobid-join/main/roblox-jobid-join.user.js
// @updateURL    https://raw.githubusercontent.com/pushurt3mprr/roblox-jobid-join/main/roblox-jobid-join.user.js
// @connect      roblox.com
// @connect      rbxcdn.com
// @connect      rolimons.com
// @connect      ipwho.is
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
  const APP_VERSION = "5.0.0";
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
    PINNED_SERVERS: "rtk_pinned_servers_v3",
    VIP_LINKS: "rtk_vip_links_v4",
    GAME_PLAYLISTS: "rtk_game_playlists_v4",
    FRIENDS_SNAPSHOT: "rtk_friends_snapshot_v4",
    ROLIMONS_CACHE: "rtk_rolimons_cache_v4",
    BLOCKLIST: "rtk_blocklist_v4",
    RECENT_PLAYERS: "rtk_recent_players_v5",
  };

  const CURRENCY_MODES = {
    OFF: { label: "Disabled", rate: 0, symbol: "", suffix: "" },
    USD_BUY: { label: "USD — Purchase Rate ($0.0125/R$)", rate: 0.0125, symbol: "$", suffix: "" },
    USD_DEVEX: { label: "USD — DevEx Cashout ($0.0038/R$)", rate: 0.0038, symbol: "$", suffix: " DevEx" },
    EUR_BUY: { label: "EUR — Purchase Rate (€0.0118/R$)", rate: 0.0118, symbol: "€", suffix: "" },
    GBP_BUY: { label: "GBP — Purchase Rate (£0.0100/R$)", rate: 0.01, symbol: "£", suffix: "" },
    BRL_BUY: { label: "BRL — Purchase Rate (R$0.068/R$)", rate: 0.068, symbol: "R$", suffix: "" },
    CAD_BUY: { label: "CAD — Purchase Rate (CA$0.017/R$)", rate: 0.017, symbol: "CA$", suffix: "" },
  };

  const DEFAULT_SETTINGS = {
    autoCaptureAccounts: true,
    logoutGuard: true,
    restoreAccountAfterJoin: false,
    trackStudioTime: true,
    autoRejoinWatchdog: false,
    ghostBackup: null,
    muteChatBackup: null,
    qolBlockAds: true,
    qolHideAppBanners: true,
    qolWideLayout: false,
    qolProfileStatsBar: true,
    qolGameInsightsBar: true,
    qolAssetQuickBar: true,
    qolHomePinnedShelf: true,
    qolContentBlocker: true,
    currencyMode: "USD_BUY",
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

    formatNumber(n) {
      if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
      return Number(n).toLocaleString();
    },

    formatCompact(n) {
      const num = Number(n);
      if (!Number.isFinite(num)) return "—";
      if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
      if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
      if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
      return String(num);
    },

    formatDateShort(iso) {
      if (!iso) return "—";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

    async getPublicServersPage(placeId, sortOrder = "Desc", limit = 100, cursor = "") {
      const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const res = await this.request({
        url: `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=${sortOrder}&limit=${limit}${cursorParam}`,
      });
      return {
        data: res.ok && Array.isArray(res.data?.data) ? res.data.data : [],
        nextPageCursor: res.ok ? res.data?.nextPageCursor || null : null,
      };
    },

    async batchThumbnails(requests) {
      const res = await this.request({
        method: "POST",
        url: "https://thumbnails.roblox.com/v1/batch",
        body: requests,
      });
      return res.ok && Array.isArray(res.data?.data) ? res.data.data : [];
    },

    async resolveUsername(username) {
      const res = await this.request({
        method: "POST",
        url: "https://users.roblox.com/v1/usernames/users",
        body: { usernames: [String(username).trim()], excludeBannedUsers: false },
      });
      return res.ok && Array.isArray(res.data?.data) && res.data.data[0] ? res.data.data[0] : null;
    },

    async getUserProfile(userId) {
      const res = await this.request({
        url: `https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`,
      });
      return res.ok && res.data?.id ? res.data : null;
    },

    async getUsernameHistory(userId) {
      const res = await this.request({
        url: `https://users.roblox.com/v1/users/${encodeURIComponent(userId)}/username-history?limit=50&sortOrder=Desc`,
      });
      return res.ok && Array.isArray(res.data?.data) ? res.data.data.map((x) => x.name).filter(Boolean) : [];
    },

    async getUserCollectibles(userId) {
      let cursor = "";
      const all = [];
      for (let page = 0; page < 3; page++) {
        const res = await this.request({
          url: `https://inventory.roblox.com/v1/users/${encodeURIComponent(userId)}/assets/collectibles?limit=100&sortOrder=Asc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        });
        if (!res.ok) {
          if (page === 0) return { privateInventory: res.status === 403, items: [], totalRap: 0 };
          break;
        }
        if (Array.isArray(res.data?.data)) all.push(...res.data.data);
        cursor = res.data?.nextPageCursor || "";
        if (!cursor) break;
      }
      const totalRap = all.reduce((sum, item) => sum + (Number(item.recentAveragePrice) || 0), 0);
      all.sort((a, b) => (Number(b.recentAveragePrice) || 0) - (Number(a.recentAveragePrice) || 0));
      return { privateInventory: false, items: all, totalRap };
    },

    async getUserSocialCounts(userId) {
      const [fr, fl, fw] = await Promise.all([
        this.request({ url: `https://friends.roblox.com/v1/users/${userId}/friends/count` }).catch(() => ({ ok: false })),
        this.request({ url: `https://friends.roblox.com/v1/users/${userId}/followers/count` }).catch(() => ({ ok: false })),
        this.request({ url: `https://friends.roblox.com/v1/users/${userId}/followings/count` }).catch(() => ({ ok: false })),
      ]);
      return {
        friends: fr.ok ? fr.data?.count ?? 0 : null,
        followers: fl.ok ? fl.data?.count ?? 0 : null,
        following: fw.ok ? fw.data?.count ?? 0 : null,
      };
    },

    async getCurrentlyWearing(userId) {
      const res = await this.request({
        url: `https://avatar.roblox.com/v1/users/${encodeURIComponent(userId)}/currently-wearing`,
      });
      return res.ok && Array.isArray(res.data?.assetIds) ? res.data.assetIds : [];
    },

    async getUniversePlaces(universeId) {
      const res = await this.request({
        url: `https://develop.roblox.com/v1/universes/${encodeURIComponent(universeId)}/places?isUniverseCreation=false&limit=100&sortOrder=Asc`,
      });
      return res.ok && Array.isArray(res.data?.data) ? res.data.data : [];
    },

    async getGameVotes(universeIds) {
      const res = await this.request({
        url: `https://games.roblox.com/v1/games/votes?universeIds=${universeIds.join(",")}`,
      });
      const out = {};
      if (res.ok && Array.isArray(res.data?.data)) {
        res.data.data.forEach((v) => {
          out[v.id] = v;
        });
      }
      return out;
    },

    async getGamePasses(universeId) {
      const res = await this.request({
        url: `https://games.roblox.com/v1/games/${encodeURIComponent(universeId)}/game-passes?limit=100&sortOrder=Asc`,
      });
      return res.ok && Array.isArray(res.data?.data) ? res.data.data : [];
    },

    async getUniverseBadges(universeId) {
      const res = await this.request({
        url: `https://badges.roblox.com/v1/universes/${encodeURIComponent(universeId)}/badges?limit=25&sortOrder=Desc`,
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

    async fetchRawAssetBuffer(assetId, versionNumber = 0) {
      const verParam = Number(versionNumber) > 0 ? `&version=${encodeURIComponent(versionNumber)}` : "";
      return this.request({
        url: `https://assetdelivery.roblox.com/v1/asset/?id=${encodeURIComponent(assetId)}${verParam}`,
        responseType: "arraybuffer",
        headers: { Accept: "*/*" },
      });
    },

    async getServerConnectionInfo(placeId, jobId) {
      return this.request({
        method: "POST",
        url: "https://gamejoin.roblox.com/v1/join-game-instance",
        body: {
          placeId: Number(placeId),
          isTeleport: false,
          gameId: String(jobId),
          gameJoinAttemptId: String(jobId),
        },
      });
    },

    ipGeoCache: {},
    async geolocateIp(ip) {
      const cleanIp = String(ip || "").trim();
      if (!cleanIp) return null;
      if (this.ipGeoCache[cleanIp]) return this.ipGeoCache[cleanIp];
      const res = await this.request({
        url: `https://ipwho.is/${encodeURIComponent(cleanIp)}`,
        withCredentials: false,
      }).catch(() => ({ ok: false }));
      if (res.ok && res.data && res.data.success !== false && res.data.city) {
        const info = {
          city: res.data.city || "",
          region: res.data.region_code || res.data.region || "",
          country: res.data.country_code || res.data.country || "",
          isp: res.data.connection?.org || "",
          label: `${res.data.city}, ${res.data.region_code || res.data.country_code || ""}`.replace(/,\s*$/, ""),
        };
        this.ipGeoCache[cleanIp] = info;
        return info;
      }
      return null;
    },

    async getFriendsList(userId) {
      const res = await this.request({
        url: `https://friends.roblox.com/v1/users/${encodeURIComponent(userId)}/friends`,
      });
      return res.ok && Array.isArray(res.data?.data) ? res.data.data : [];
    },

    async getActiveAvatar() {
      const res = await this.request({
        url: "https://avatar.roblox.com/v1/avatar",
      });
      return res.ok && res.data ? res.data : null;
    },

    async setAvatarRigType(rigType) {
      return this.request({
        method: "POST",
        url: "https://avatar.roblox.com/v1/avatar/set-player-avatar-type",
        body: { playerAvatarType: rigType },
      });
    },

    async setAvatarScales(scales) {
      return this.request({
        method: "POST",
        url: "https://avatar.roblox.com/v1/avatar/set-scales",
        body: scales,
      });
    },

    async setWearingAssets(assetIds) {
      const ids = assetIds.map(Number).filter(Boolean);
      const v2 = await this.request({
        method: "POST",
        url: "https://avatar.roblox.com/v2/avatar/set-wearing-assets",
        body: { assets: ids.map((id) => ({ id })) },
      });
      if (v2.ok) return v2;
      return this.request({
        method: "POST",
        url: "https://avatar.roblox.com/v1/avatar/set-wearing-assets",
        body: { assetIds: ids },
      });
    },

    async getUserOutfits(userId) {
      const res = await this.request({
        url: `https://avatar.roblox.com/v1/users/${encodeURIComponent(userId)}/outfits?page=1&itemsPerPage=50&isEditable=true`,
      });
      return res.ok && Array.isArray(res.data?.data) ? res.data.data : [];
    },

    async getOutfitDetails(outfitId) {
      const res = await this.request({
        url: `https://avatar.roblox.com/v1/outfits/${encodeURIComponent(outfitId)}/details`,
      });
      return res.ok && res.data ? res.data : null;
    },

    async getBadgeAwardedDates(userId, badgeIds) {
      if (!userId || !badgeIds.length) return {};
      const out = {};
      for (let i = 0; i < badgeIds.length; i += 50) {
        const chunk = badgeIds.slice(i, i + 50);
        const res = await this.request({
          url: `https://badges.roblox.com/v1/users/${encodeURIComponent(userId)}/badges/awarded-dates?badgeIds=${chunk.join(",")}`,
        }).catch(() => ({ ok: false }));
        if (res.ok && Array.isArray(res.data?.data)) {
          res.data.data.forEach((b) => {
            out[b.badgeId] = b.awardedDate;
          });
        }
      }
      return out;
    },

    async getEconomySummary(userId, timeFrame = "Month") {
      const [balRes, sumRes] = await Promise.all([
        this.request({ url: `https://economy.roblox.com/v1/users/${encodeURIComponent(userId)}/currency` }).catch(() => ({ ok: false })),
        this.request({
          url: `https://economy.roblox.com/v2/users/${encodeURIComponent(userId)}/transaction-totals?timeFrame=${encodeURIComponent(timeFrame)}&transactionType=summary`,
        }).catch(() => ({ ok: false })),
      ]);
      const robux = balRes.ok ? balRes.data?.robux ?? null : null;
      const summary = sumRes.ok && sumRes.data ? sumRes.data : null;
      return {
        robux,
        balance: robux,
        summary,
        totals: summary,
      };
    },

    async getRecentTransactions(userId, transactionType = "Sale", limit = 25) {
      const res = await this.request({
        url: `https://economy.roblox.com/v2/users/${encodeURIComponent(userId)}/transactions?transactionType=${encodeURIComponent(transactionType)}&limit=${limit}`,
      }).catch(() => ({ ok: false }));
      return res.ok && Array.isArray(res.data?.data) ? res.data.data : [];
    },

    async getTradesList(tradeType = "inbound", limit = 25) {
      const cleanType = String(tradeType || "inbound").toLowerCase();
      const res = await this.request({
        url: `https://trades.roblox.com/v1/trades/${encodeURIComponent(cleanType)}?limit=${limit}&sortOrder=Desc`,
      });
      return res.ok && Array.isArray(res.data?.data) ? res.data.data : [];
    },

    async getTradeDetails(tradeId) {
      const res = await this.request({
        url: `https://trades.roblox.com/v1/trades/${encodeURIComponent(tradeId)}`,
      });
      return res.ok && res.data ? res.data : null;
    },

    async declineTrade(tradeId) {
      return this.request({
        method: "POST",
        url: `https://trades.roblox.com/v1/trades/${encodeURIComponent(tradeId)}/decline`,
      });
    },

    async getUserGroupsRoles(userId) {
      const res = await this.request({
        url: `https://groups.roblox.com/v1/users/${encodeURIComponent(userId)}/groups/roles`,
      }).catch(() => ({ ok: false }));
      return res.ok && Array.isArray(res.data?.data) ? res.data.data : [];
    },

    async getUserCreatedGames(userId) {
      const res = await this.request({
        url: `https://games.roblox.com/v2/users/${encodeURIComponent(userId)}/games?accessFilter=2&limit=25&sortOrder=Desc`,
      }).catch(() => ({ ok: false }));
      return res.ok && Array.isArray(res.data?.data) ? res.data.data : [];
    },

    async getGroupDetails(groupId) {
      const res = await this.request({
        url: `https://groups.roblox.com/v1/groups/${encodeURIComponent(groupId)}`,
      });
      if (!res.ok || !res.data) throw new Error(`Group ${groupId} not found (HTTP ${res.status}).`);
      return res.data;
    },

    async getGroupRoles(groupId) {
      const res = await this.request({
        url: `https://groups.roblox.com/v1/groups/${encodeURIComponent(groupId)}/roles`,
      }).catch(() => ({ ok: false }));
      return res.ok && Array.isArray(res.data?.roles) ? res.data.roles : [];
    },

    async getGroupGames(groupId) {
      const res = await this.request({
        url: `https://games.roblox.com/v2/groups/${encodeURIComponent(groupId)}/games?accessFilter=2&limit=25&sortOrder=Desc`,
      }).catch(() => ({ ok: false }));
      return res.ok && Array.isArray(res.data?.data) ? res.data.data : [];
    },

    async getAvatarFullBodyThumb(userId) {
      const res = await this.request({
        url: `https://thumbnails.roblox.com/v1/users/avatar?userIds=${encodeURIComponent(userId)}&size=420x420&format=Png&isCircular=false`,
      }).catch(() => ({ ok: false }));
      return res.ok && res.data?.data?.[0]?.imageUrl ? res.data.data[0].imageUrl : "";
    },

    async getClientVersionInfo() {
      const [playerRes, studioRes] = await Promise.all([
        this.request({
          url: "https://clientsettings.roblox.com/v2/client-version/WindowsPlayer",
          withCredentials: false,
        }).catch(() => ({ ok: false })),
        this.request({
          url: "https://clientsettings.roblox.com/v2/client-version/WindowsStudio64",
          withCredentials: false,
        }).catch(() => ({ ok: false })),
      ]);
      return {
        playerVersion: playerRes.ok ? playerRes.data?.clientVersionUpload || playerRes.data?.version || "Unknown" : "Unavailable",
        playerDisplay: playerRes.ok ? playerRes.data?.version || "" : "",
        studioVersion: studioRes.ok ? studioRes.data?.clientVersionUpload || studioRes.data?.version || "Unknown" : "Unavailable",
        studioDisplay: studioRes.ok ? studioRes.data?.version || "" : "",
      };
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

    async scanAllAccountsPortfolio() {
      await RolimonsEngine.ensureLoaded().catch(() => {});
      const list = this.getList();
      const numericIds = list.map((a) => a.userId).filter((id) => /^\d+$/.test(String(id)));
      const presences = numericIds.length ? await RobloxAPI.getPresences(numericIds).catch(() => []) : [];
      const presMap = {};
      presences.forEach((p) => {
        presMap[String(p.userId)] = p;
      });

      let totalRap = 0;
      let totalValue = 0;
      let totalRobux = 0;
      let bannedCount = 0;

      for (const acc of list) {
        const uid = String(acc.userId);
        if (!/^\d+$/.test(uid)) continue;
        const [profile, colRaw, eco] = await Promise.all([
          RobloxAPI.getUserProfile(uid).catch(() => null),
          RobloxAPI.getUserCollectibles(uid).catch(() => ({ privateInventory: false, items: [], totalRap: 0 })),
          this.activeUser && String(this.activeUser.id) === uid
            ? RobloxAPI.getEconomySummary(uid, "Month").catch(() => null)
            : Promise.resolve(null),
        ]);

        const col = RolimonsEngine.enrichCollectibles(colRaw);
        const rap = col.totalRap || 0;
        const val = col.totalValue || rap;
        const isBanned = Boolean(profile?.isBanned);
        const robux = eco?.balance != null ? eco.balance : acc.robuxBalance ?? null;
        const pending = eco?.totals?.pendingRobuxTotal != null ? Math.abs(Number(eco.totals.pendingRobuxTotal)) : acc.pendingRobux ?? null;

        totalRap += rap;
        totalValue += val;
        if (Number.isFinite(robux)) totalRobux += robux;
        if (isBanned) bannedCount++;

        this.saveEntry(
          Object.assign({}, acc, {
            username: profile?.name || acc.username,
            displayName: profile?.displayName || acc.displayName,
            isBanned,
            rap,
            rolimonsValue: val,
            robuxBalance: robux,
            pendingRobux: pending,
            presence: presMap[uid] || null,
            lastScannedAt: Date.now(),
          })
        );
      }

      return {
        accountCount: list.length,
        totalRap,
        totalValue,
        totalRobux,
        bannedCount,
      };
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

    async serverHop(placeId, targetAccountId = "current") {
      const servers = await RobloxAPI.getPublicServers(placeId, "Desc", 100);
      const activeJob = PlaytimeTracker.getData().activeSession?.gameId || "";
      const recent = Store.get(STORAGE_KEYS.RECENT_SERVERS, [])
        .filter((r) => String(r.placeId) === String(placeId))
        .slice(0, 8)
        .map((r) => r.jobId);
      const excluded = new Set([activeJob, ...recent].filter(Boolean));

      let candidates = servers.filter((s) => s.id && s.playing >= 1 && s.playing < s.maxPlayers && !excluded.has(s.id));
      if (!candidates.length) {
        candidates = servers.filter((s) => s.id && s.playing < s.maxPlayers && s.id !== activeJob);
      }
      if (!candidates.length) {
        throw new Error("No alternate open servers available to hop into.");
      }

      candidates.sort((a, b) => {
        const fpsDiff = Math.min(60, Math.round(b.fps || 60)) - Math.min(60, Math.round(a.fps || 60));
        if (Math.abs(fpsDiff) > 8) return fpsDiff;
        return (a.ping || 250) - (b.ping || 250);
      });

      const pool = candidates.slice(0, Math.min(6, candidates.length));
      const chosen = pool[Math.floor(Math.random() * pool.length)];
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

          const dayKey = new Date(now).toISOString().slice(0, 10);
          pt.dailyHistory = pt.dailyHistory || {};
          pt.dailyHistory[dayKey] = (pt.dailyHistory[dayKey] || 0) + deltaSec;

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
      const droppedSession = pt.activeSession;
      if (pt.activeSession) {
        pt.activeSession = null;
        Store.set(STORAGE_KEYS.PLAYTIME, pt);
      }
      this.livePresence = null;

      if (
        droppedSession &&
        droppedSession.presenceType === 2 &&
        (droppedSession.placeId || droppedSession.rootPlaceId) &&
        Store.getSettings().autoRejoinWatchdog &&
        typeof HubUI !== "undefined"
      ) {
        const targetPlace = droppedSession.placeId || droppedSession.rootPlaceId;
        const targetJob = droppedSession.gameId || null;
        let cancelled = false;
        HubUI.toast(
          `Watchdog: Disconnected from ${droppedSession.name || "server"}. Auto-rejoining in 5s...`,
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
          if (!cancelled && Store.getSettings().autoRejoinWatchdog) {
            Launcher.join(targetPlace, targetJob, "current").catch(() => {});
          }
        }, 5000);
      }
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
      pt.dailyHistory = {};
      Store.set(STORAGE_KEYS.PLAYTIME, pt);
    },

    getHeatmap28Days() {
      const pt = this.getData();
      const hist = pt.dailyHistory || {};
      const days = [];
      for (let i = 27; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toISOString().slice(0, 10);
        const sec = Number(hist[key] || 0);
        days.push({
          dayKey: key,
          dateKey: key,
          dayNum: String(d.getDate()),
          label: key.slice(5),
          seconds: sec,
          level: sec <= 0 ? 0 : sec < 900 ? 1 : sec < 3600 ? 2 : sec < 10800 ? 3 : 4,
        });
      }
      return days;
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

    async inspectAssetAndExtractIds(rawAssetId, versionNumber = 0) {
      const cleanId = String(rawAssetId || "").replace(/\D/g, "");
      if (!cleanId) throw new Error("Enter a numeric Asset ID.");
      const ver = Math.max(0, Math.floor(Number(versionNumber) || 0));

      const [detailsRes, rawRes] = await Promise.all([
        RobloxAPI.getAssetDetails(cleanId).catch(() => ({ ok: false })),
        RobloxAPI.fetchRawAssetBuffer(cleanId, ver),
      ]);

      if (!rawRes.ok || !rawRes.raw) {
        throw new Error(`Could not fetch raw asset delivery stream${ver ? ` (v${ver})` : ""} (HTTP ${rawRes.status}).`);
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

      // Extract embedded Luau script sources from XML (.rbxmx) or readable chunks in .rbxm
      const extractedScripts = [];
      const xmlScriptRegex = /<ProtectedString\s+name="Source">(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/ProtectedString>/gi;
      let sm;
      let idx = 1;
      while ((sm = xmlScriptRegex.exec(decoded)) !== null) {
        const rawCode = (sm[1] ?? sm[2] ?? "").trim();
        if (rawCode) {
          extractedScripts.push({ title: `Embedded Script #${idx++}`, code: rawCode.slice(0, 8000) });
        }
      }

      return {
        assetId: cleanId,
        versionNumber: ver,
        name: detailsRes.ok ? detailsRes.data?.Name || `Asset_${cleanId}` : `Asset_${cleanId}`,
        assetTypeId: detailsRes.ok ? detailsRes.data?.AssetTypeId : null,
        creator: detailsRes.ok ? detailsRes.data?.Creator?.Name : null,
        byteSize: uint8.byteLength,
        format,
        isAudio: format.ext === "ogg" || format.ext === "mp3",
        extractedIds: Array.from(extractedIds),
        extractedScripts,
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
   * 9B. PINNED SERVERS, PLAYER SERVER SCANNER, EXPLORER & SITE QOL ENGINES
   * ============================================================================ */
  const PinnedServers = {
    getAll() {
      return Store.get(STORAGE_KEYS.PINNED_SERVERS, []);
    },

    getForPlace(placeId) {
      const all = this.getAll();
      if (!placeId) return all;
      return all.filter((p) => String(p.placeId) === String(placeId));
    },

    isPinned(jobId) {
      const clean = Utils.sanitizeJobId(jobId);
      return this.getAll().some((p) => p.jobId === clean);
    },

    async pin({ jobId, placeId, label = "", gameName = "" }) {
      const cleanJob = Utils.sanitizeJobId(jobId);
      if (!UUID_REGEX.test(cleanJob)) throw new Error("Enter a valid Server Job ID UUID to pin.");
      if (!placeId || !/^\d+$/.test(String(placeId))) throw new Error("A valid Place ID is required to pin a server.");

      let resolvedName = gameName;
      if (!resolvedName) {
        const uId = await RobloxAPI.getUniverseId(placeId).catch(() => null);
        if (uId) {
          const meta = await RobloxAPI.getGameMeta([uId]).catch(() => ({}));
          resolvedName = meta[uId]?.name || "";
        }
      }

      const list = this.getAll().filter((p) => p.jobId !== cleanJob);
      const entry = {
        jobId: cleanJob,
        placeId: String(placeId),
        label: String(label || "").trim(),
        gameName: resolvedName || `Place ${placeId}`,
        pinnedAt: Date.now(),
      };
      list.unshift(entry);
      Store.set(STORAGE_KEYS.PINNED_SERVERS, list.slice(0, 50));
      return entry;
    },

    unpin(jobId) {
      const clean = Utils.sanitizeJobId(jobId);
      const next = this.getAll().filter((p) => p.jobId !== clean);
      Store.set(STORAGE_KEYS.PINNED_SERVERS, next);
    },
  };

  const ServerScanner = {
    activeAbort: null,

    abort() {
      if (this.activeAbort) {
        this.activeAbort.aborted = true;
        this.activeAbort = null;
      }
    },

    async findPlayerInServers(placeId, usernameOrId, onProgress) {
      if (!placeId || !/^\d+$/.test(String(placeId))) {
        throw new Error("Enter a valid Place ID first.");
      }
      const query = String(usernameOrId || "").trim().replace(/^@/, "");
      if (!query) throw new Error("Enter a Roblox username or User ID to search.");

      this.abort();
      const signal = { aborted: false };
      this.activeAbort = signal;

      // 1. Resolve target user
      let user = null;
      if (/^\d+$/.test(query)) {
        user = await RobloxAPI.getUserProfile(query);
      } else {
        const resolved = await RobloxAPI.resolveUsername(query);
        if (resolved?.id) {
          user = await RobloxAPI.getUserProfile(resolved.id).catch(() => resolved);
        }
      }
      if (!user || !user.id) {
        throw new Error(`User "${query}" was not found on Roblox.`);
      }

      // 2. Fetch fresh 150x150 headshot URL for exact token comparison
      const avatarRes = await RobloxAPI.request({
        url: `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=false`,
      });
      const targetAvatarUrl = avatarRes.ok && avatarRes.data?.data?.[0]?.imageUrl ? avatarRes.data.data[0].imageUrl : "";
      if (!targetAvatarUrl) {
        throw new Error(`Could not resolve @${user.name}'s avatar headshot thumbnail.`);
      }

      // 3. Fast-path check via Presence API (instant hit if user's joins are public)
      const presences = await RobloxAPI.getPresences([user.id]).catch(() => []);
      const pres = presences[0];
      if (pres && String(pres.placeId) === String(placeId) && pres.gameId) {
        RecentPlayersTracker.logPlayer({
          userId: user.id,
          username: user.name,
          displayName: user.displayName,
          avatarUrl: targetAvatarUrl,
          placeId,
          jobId: pres.gameId,
          gameName: pres.lastLocation || `Place ${placeId}`,
        });
        return {
          found: true,
          source: "presence",
          user,
          avatarUrl: targetAvatarUrl,
          server: { id: pres.gameId, playing: "?", maxPlayers: "?", ping: null, fps: null },
          serversChecked: 1,
          playersChecked: 1,
        };
      }

      // 4. Deep scan public server playerTokens against batchThumbnails
      let cursor = "";
      let serversChecked = 0;
      let playersChecked = 0;
      const maxPages = 15;

      for (let page = 1; page <= maxPages; page++) {
        if (signal.aborted) throw new Error("Scan cancelled.");
        const pageRes = await RobloxAPI.getPublicServersPage(placeId, "Desc", 100, cursor);
        const servers = pageRes.data || [];
        if (!servers.length) break;

        const serverById = {};
        const tokenItems = [];
        for (const srv of servers) {
          if (!srv.id) continue;
          serverById[srv.id] = srv;
          serversChecked++;
          const tokens = Array.isArray(srv.playerTokens) ? srv.playerTokens : [];
          for (let i = 0; i < tokens.length; i++) {
            tokenItems.push({
              requestId: `${srv.id}:${i}`,
              targetId: 0,
              token: tokens[i],
              type: "AvatarHeadShot",
              size: "150x150",
              format: "Png",
              isCircular: false,
            });
          }
        }

        playersChecked += tokenItems.length;
        if (typeof onProgress === "function") {
          onProgress({ page, serversChecked, playersChecked, username: user.name });
        }

        // Batch in chunks of 100, up to 3 requests in parallel
        const batches = [];
        for (let i = 0; i < tokenItems.length; i += 100) {
          batches.push(tokenItems.slice(i, i + 100));
        }

        for (let b = 0; b < batches.length; b += 3) {
          if (signal.aborted) throw new Error("Scan cancelled.");
          const slice = batches.slice(b, b + 3);
          const results = await Promise.all(slice.map((batch) => RobloxAPI.batchThumbnails(batch)));
          for (const resArr of results) {
            for (const thumb of resArr) {
              if (thumb.imageUrl && thumb.imageUrl === targetAvatarUrl) {
                const matchedJobId = String(thumb.requestId || "").split(":")[0];
                const matchedServer = serverById[matchedJobId] || { id: matchedJobId };
                this.activeAbort = null;
                RecentPlayersTracker.logPlayer({
                  userId: user.id,
                  username: user.name,
                  displayName: user.displayName,
                  avatarUrl: targetAvatarUrl,
                  placeId,
                  jobId: matchedJobId,
                  gameName: `Place ${placeId}`,
                });
                return {
                  found: true,
                  source: "scanner",
                  user,
                  avatarUrl: targetAvatarUrl,
                  server: matchedServer,
                  serversChecked,
                  playersChecked,
                };
              }
            }
          }
        }

        cursor = pageRes.nextPageCursor || "";
        if (!cursor) break;
      }

      this.activeAbort = null;
      return {
        found: false,
        user,
        avatarUrl: targetAvatarUrl,
        server: null,
        serversChecked,
        playersChecked,
      };
    },

    async browseServers(placeId, opts = {}) {
      if (!placeId || !/^\d+$/.test(String(placeId))) {
        throw new Error("Enter a valid Place ID first.");
      }
      const sortBy = opts.sortBy || "smallest";
      const maxPlayersFilter = Number(opts.maxPlayers) || 0;
      const minFpsFilter = Number(opts.minFps) || 0;
      const pages = Math.min(3, Math.max(1, Number(opts.pages) || 2));
      const apiOrder = sortBy === "smallest" ? "Asc" : "Desc";

      let cursor = "";
      const seen = new Set();
      const collected = [];

      for (let p = 0; p < pages; p++) {
        const res = await RobloxAPI.getPublicServersPage(placeId, apiOrder, 100, cursor);
        for (const srv of res.data) {
          if (!srv.id || seen.has(srv.id)) continue;
          seen.add(srv.id);
          if (opts.excludeFull !== false && srv.playing >= srv.maxPlayers) continue;
          if (maxPlayersFilter > 0 && srv.playing > maxPlayersFilter) continue;
          if (minFpsFilter > 0 && typeof srv.fps === "number" && srv.fps < minFpsFilter) continue;
          collected.push(srv);
        }
        cursor = res.nextPageCursor || "";
        if (!cursor) break;
      }

      collected.sort((a, b) => {
        if (sortBy === "ping") return (a.ping || 9999) - (b.ping || 9999);
        if (sortBy === "fps") return (b.fps || 0) - (a.fps || 0);
        if (sortBy === "largest") return (b.playing || 0) - (a.playing || 0);
        return (a.playing || 0) - (b.playing || 0);
      });

      return collected.slice(0, 60);
    },
  };

  const ExplorerEngine = {
    experienceCache: {},
    userCache: {},

    async inspectExperience(placeId, force = false) {
      const pId = String(placeId || "").trim();
      if (!/^\d+$/.test(pId)) throw new Error("Enter a valid numeric Place ID.");
      if (!force && this.experienceCache[pId] && Date.now() - this.experienceCache[pId].fetchedAt < 60000) {
        return this.experienceCache[pId];
      }

      const universeId = await RobloxAPI.getUniverseId(pId);
      if (!universeId) throw new Error(`Could not resolve Universe ID for Place ${pId}.`);

      const [metaMap, votesMap, places, passes, badges] = await Promise.all([
        RobloxAPI.getGameMeta([universeId]),
        RobloxAPI.getGameVotes([universeId]),
        RobloxAPI.getUniversePlaces(universeId).catch(() => []),
        RobloxAPI.getGamePasses(universeId).catch(() => []),
        RobloxAPI.getUniverseBadges(universeId).catch(() => []),
      ]);

      const awardedDates =
        AccountManager.activeUser?.id && badges.length
          ? await RobloxAPI.getBadgeAwardedDates(
              AccountManager.activeUser.id,
              badges.map((b) => b.id)
            ).catch(() => ({}))
          : {};

      const meta = metaMap[universeId] || {};
      const votes = votesMap[universeId] || { upVotes: 0, downVotes: 0 };
      const totalVotes = (votes.upVotes || 0) + (votes.downVotes || 0);
      const likeRatio = totalVotes > 0 ? ((votes.upVotes / totalVotes) * 100).toFixed(1) : null;
      const totalPassRobux = passes.reduce((sum, gp) => sum + (Number(gp.price) || 0), 0);

      const sortedPlaces = [...places].sort((a, b) => {
        if (String(a.id) === String(meta.rootPlaceId)) return -1;
        if (String(b.id) === String(meta.rootPlaceId)) return 1;
        return 0;
      });

      const enrichedBadges = badges.map((b) =>
        Object.assign({}, b, {
          awardedDate: awardedDates[b.id] || null,
        })
      );

      const result = {
        placeId: pId,
        universeId,
        meta,
        upVotes: votes.upVotes || 0,
        downVotes: votes.downVotes || 0,
        likeRatio,
        places: sortedPlaces,
        passes,
        totalPassRobux,
        badges: enrichedBadges,
        fetchedAt: Date.now(),
      };
      this.experienceCache[pId] = result;
      return result;
    },

    async inspectUser(query, force = false) {
      const q = String(query || "").trim().replace(/^@/, "");
      if (!q) throw new Error("Enter a Username or User ID.");

      let userId = q;
      if (!/^\d+$/.test(q)) {
        const resolved = await RobloxAPI.resolveUsername(q);
        if (!resolved?.id) throw new Error(`No Roblox account found matching "${q}".`);
        userId = String(resolved.id);
      }

      if (!force && this.userCache[userId] && Date.now() - this.userCache[userId].fetchedAt < 60000) {
        return this.userCache[userId];
      }

      const profile = await RobloxAPI.getUserProfile(userId);
      if (!profile) throw new Error(`User ID ${userId} does not exist.`);

      const [avatars, fullBodyThumb, presences, social, pastNames, collectibles, wearingIds, outfits, groupsRoles, createdGames] = await Promise.all([
        RobloxAPI.getAvatars([userId]).catch(() => ({})),
        RobloxAPI.getAvatarFullBodyThumb(userId).catch(() => ""),
        RobloxAPI.getPresences([userId]).catch(() => []),
        RobloxAPI.getUserSocialCounts(userId),
        RobloxAPI.getUsernameHistory(userId).catch(() => []),
        RobloxAPI.getUserCollectibles(userId).catch(() => ({ privateInventory: false, items: [], totalRap: 0 })),
        RobloxAPI.getCurrentlyWearing(userId).catch(() => []),
        RobloxAPI.getUserOutfits(userId).catch(() => []),
        RobloxAPI.getUserGroupsRoles(userId).catch(() => []),
        RobloxAPI.getUserCreatedGames(userId).catch(() => []),
      ]);

      await RolimonsEngine.ensureLoaded().catch(() => {});
      const enrichedCollectibles = RolimonsEngine.enrichCollectibles(collectibles);

      const createdMs = profile.created ? new Date(profile.created).getTime() : 0;
      const accountAgeDays = createdMs ? Math.max(0, Math.floor((Date.now() - createdMs) / 86400000)) : 0;

      const result = {
        userId: String(profile.id),
        profile,
        avatarUrl: avatars[profile.id] || "",
        fullBodyThumb: fullBodyThumb || avatars[profile.id] || "",
        presence: presences[0] || null,
        social,
        pastNames,
        collectibles: enrichedCollectibles,
        wearingIds,
        outfits,
        groupsRoles,
        createdGames,
        accountAgeDays,
        fetchedAt: Date.now(),
      };
      this.userCache[userId] = result;
      return result;
    },

    groupCache: {},

    async inspectGroup(rawGroupId, force = false) {
      const gId = String(rawGroupId || "").trim().replace(/\D+/g, "");
      if (!gId) throw new Error("Enter a valid numeric Group ID.");
      if (!force && this.groupCache[gId] && Date.now() - this.groupCache[gId].fetchedAt < 60000) {
        return this.groupCache[gId];
      }

      const [details, roles, games] = await Promise.all([
        RobloxAPI.getGroupDetails(gId),
        RobloxAPI.getGroupRoles(gId),
        RobloxAPI.getGroupGames(gId),
      ]);

      const sortedRoles = [...roles].sort((a, b) => (b.rank || 0) - (a.rank || 0));
      const result = {
        groupId: gId,
        details,
        roles: sortedRoles,
        games,
        fetchedAt: Date.now(),
      };
      this.groupCache[gId] = result;
      return result;
    },
  };

  const SiteQoL = {
    STYLE_ID: "rtk-qol-global-styles",

    ensureStyles() {
      if (document.getElementById(this.STYLE_ID)) return;
      const st = document.createElement("style");
      st.id = this.STYLE_ID;
      st.textContent = `
        html.rtk-qol-adblock .abp,
        html.rtk-qol-adblock .abp-container,
        html.rtk-qol-adblock #AdvertisingLeaderboard,
        html.rtk-qol-adblock #Skyscraper-Abp-Left,
        html.rtk-qol-adblock #Skyscraper-Abp-Right,
        html.rtk-qol-adblock .ads-container,
        html.rtk-qol-adblock .ad-annotations,
        html.rtk-qol-adblock iframe[src*="user-sponsorship"] {
          display: none !important;
        }
        html.rtk-qol-nobanners #desktop-app-banner,
        html.rtk-qol-nobanners #upgrade-account-banner,
        html.rtk-qol-nobanners [class*="app-upsell"],
        html.rtk-qol-nobanners .upsell-banner-container {
          display: none !important;
        }
        @media (min-width: 1360px) {
          html.rtk-qol-wide .content,
          html.rtk-qol-wide .container-main .content {
            max-width: 1480px !important;
          }
        }
        [data-rtk-fiat]::after {
          content: attr(data-rtk-fiat);
          font-size: 0.82em;
          font-weight: 500;
          opacity: 0.72;
          margin-left: 4px;
        }
      `;
      (document.head || document.documentElement).appendChild(st);
    },

    formatFiat(robuxAmount, modeKey) {
      const mode = CURRENCY_MODES[modeKey || Store.getSettings().currencyMode];
      if (!mode || !mode.rate) return "";
      const num = Number(robuxAmount);
      if (!Number.isFinite(num) || num <= 0) return "";
      const val = num * mode.rate;
      if (val < 0.01) return ` (<${mode.symbol}0.01${mode.suffix})`;
      if (val >= 1000) return ` (${mode.symbol}${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}${mode.suffix})`;
      return ` (${mode.symbol}${val.toFixed(2)}${mode.suffix})`;
    },

    applySettings() {
      this.ensureStyles();
      const s = Store.getSettings();
      const root = document.documentElement;
      root.classList.toggle("rtk-qol-adblock", Boolean(s.qolBlockAds));
      root.classList.toggle("rtk-qol-nobanners", Boolean(s.qolHideAppBanners));
      root.classList.toggle("rtk-qol-wide", Boolean(s.qolWideLayout));

      if (!s.currencyMode || s.currencyMode === "OFF") {
        document.querySelectorAll("[data-rtk-fiat]").forEach((el) => el.removeAttribute("data-rtk-fiat"));
      } else {
        this.annotateRobuxPricesOnPage();
      }
    },

    annotateRobuxPricesOnPage() {
      const modeKey = Store.getSettings().currencyMode;
      if (!modeKey || modeKey === "OFF" || !CURRENCY_MODES[modeKey]?.rate) return;

      const nodes = document.querySelectorAll(
        ".text-robux, .text-robux-lg, .text-robux-tile, #nav-robux-amount"
      );
      nodes.forEach((el) => {
        const raw = (el.textContent || "").trim();
        if (!raw || !/\d/.test(raw)) {
          if (el.hasAttribute("data-rtk-fiat")) el.removeAttribute("data-rtk-fiat");
          return;
        }
        let amount = 0;
        const compactMatch = raw.replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([KMB])\+?$/i);
        if (compactMatch) {
          const base = parseFloat(compactMatch[1]);
          const mult = compactMatch[2].toUpperCase() === "B" ? 1e9 : compactMatch[2].toUpperCase() === "M" ? 1e6 : 1e3;
          amount = base * mult;
        } else {
          const digits = raw.replace(/[^0-9]/g, "");
          amount = digits ? Number(digits) : 0;
        }
        const tag = this.formatFiat(amount, modeKey);
        if (tag && el.getAttribute("data-rtk-fiat") !== tag) {
          el.setAttribute("data-rtk-fiat", tag);
        }
      });
    },

    calcTaxAndDevEx(rawAmount) {
      const n = Math.max(0, Math.floor(Number(rawAmount) || 0));
      const afterTax = Math.floor(n * 0.7);
      const taxTaken = n - afterTax;
      const grossNeeded = n > 0 ? Math.ceil(n / 0.7) : 0;
      return {
        input: n,
        afterTax,
        taxTaken,
        grossNeeded,
        devExUsd: (n * 0.0038).toFixed(2),
        afterTaxDevExUsd: (afterTax * 0.0038).toFixed(2),
        purchaseUsd: (n * 0.0125).toFixed(2),
      };
    },
  };

  /* ============================================================================
   * 9C. SERVER REGION INSPECTOR, VIP VAULT, PLAYLISTS, FRIENDS, ROLIMONS & AVATAR
   * ============================================================================ */
  const ServerRegionInspector = {
    cache: {},
    DATACENTER_MAP: {
      154: "US-West (Los Angeles)",
      166: "US-West (San Jose)",
      171: "US-West (Seattle)",
      174: "US-Central (Dallas)",
      179: "US-Central (Chicago)",
      185: "US-East (Ashburn)",
      189: "US-East (New York)",
      194: "US-East (Miami)",
      198: "US-East (Atlanta)",
      204: "EU-West (London)",
      209: "EU-Central (Frankfurt)",
      213: "EU-West (Amsterdam)",
      218: "EU-West (Paris)",
      224: "EU-Central (Warsaw)",
      231: "AP-East (Tokyo)",
      236: "AP-Southeast (Singapore)",
      241: "AP-South (Mumbai)",
      246: "AU-East (Sydney)",
      251: "SA-East (São Paulo)",
    },

    async inspectServer(placeId, jobId) {
      const cleanJob = Utils.sanitizeJobId(jobId);
      if (!placeId || !cleanJob) throw new Error("Valid Place ID and Job ID required.");
      if (this.cache[cleanJob]) return this.cache[cleanJob];

      const res = await RobloxAPI.getServerConnectionInfo(placeId, cleanJob);
      if (!res.ok || !res.data) {
        throw new Error(`Could not query server instance (HTTP ${res.status}). Ensure you are signed in.`);
      }
      const js = res.data.joinScript || {};
      const udmux = Array.isArray(js.UdmuxEndpoints) && js.UdmuxEndpoints[0] ? js.UdmuxEndpoints[0] : null;
      const ip = udmux?.Address || js.MachineAddress || "";
      const port = udmux?.Port || js.ServerPort || "";
      const dcId = js.DataCenterId || null;
      const placeVersion = js.PlaceVersion || null;

      let regionLabel = dcId && this.DATACENTER_MAP[dcId] ? this.DATACENTER_MAP[dcId] : "";
      if (ip) {
        const geo = await RobloxAPI.geolocateIp(ip).catch(() => null);
        if (geo?.label) {
          regionLabel = geo.label;
        }
      }
      if (!regionLabel) {
        regionLabel = dcId ? `Datacenter #${dcId}` : "Protected / Unknown Region";
      }

      const info = {
        jobId: cleanJob,
        placeId: String(placeId),
        status: res.data.status,
        ip: ip || "Hidden",
        port,
        dataCenterId: dcId,
        placeVersion,
        regionLabel,
      };
      this.cache[cleanJob] = info;
      return info;
    },
  };

  const VipLinkVault = {
    getAll() {
      return Store.get(STORAGE_KEYS.VIP_LINKS, []);
    },

    parseVipUrl(rawUrl) {
      const s = String(rawUrl || "").trim();
      if (!s) return null;
      const hasPrivateCode = /privateServerLinkCode=([A-Za-z0-9_-]+)/i.test(s);
      const hasShareCode = /roblox\.com\/share\?[^\s]*code=([A-Za-z0-9_-]+)/i.test(s);
      if (!hasPrivateCode && !hasShareCode) return null;
      const placeMatch = s.match(/\/games\/(\d+)/i);
      return {
        url: s.startsWith("http") ? s : `https://${s.replace(/^\/+/, "")}`,
        placeId: placeMatch ? placeMatch[1] : "",
      };
    },

    async add({ url, label = "", gameName = "", placeIdFallback = "" }) {
      const parsed = this.parseVipUrl(url);
      if (!parsed) {
        throw new Error("Paste a valid Roblox Private Server link (?privateServerLinkCode=... or roblox.com/share?code=...).");
      }
      const pId = parsed.placeId || String(placeIdFallback || "");
      let resolvedName = gameName;
      if (!resolvedName && pId) {
        const uId = await RobloxAPI.getUniverseId(pId).catch(() => null);
        if (uId) {
          const meta = await RobloxAPI.getGameMeta([uId]).catch(() => ({}));
          resolvedName = meta[uId]?.name || "";
        }
      }
      const list = this.getAll().filter((v) => v.url !== parsed.url);
      const entry = {
        id: "vip_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        url: parsed.url,
        placeId: pId,
        label: String(label || "").trim() || resolvedName || "VIP Server",
        gameName: resolvedName || (pId ? `Place ${pId}` : "Shared Server"),
        addedAt: Date.now(),
      };
      list.unshift(entry);
      Store.set(STORAGE_KEYS.VIP_LINKS, list.slice(0, 60));
      return entry;
    },

    async addLink(opts) {
      return this.add(opts);
    },

    remove(id) {
      Store.set(
        STORAGE_KEYS.VIP_LINKS,
        this.getAll().filter((v) => v.id !== id)
      );
    },

    removeLink(id) {
      this.remove(id);
    },
  };

  const PlaylistManager = {
    getAll() {
      return Store.get(STORAGE_KEYS.GAME_PLAYLISTS, []);
    },

    isPinned(placeId) {
      return this.getAll().some((g) => String(g.placeId) === String(placeId));
    },

    async pinGame(optsOrPlaceId, folderArg = "Favorites") {
      const isObj = typeof optsOrPlaceId === "object" && optsOrPlaceId !== null;
      const pId = String(isObj ? optsOrPlaceId.placeId : optsOrPlaceId || "").trim();
      const folder = String(isObj ? optsOrPlaceId.folder || "Favorites" : folderArg || "Favorites").trim() || "Favorites";
      if (!/^\d+$/.test(pId)) throw new Error("Enter a valid numeric Place ID.");
      const uId = await RobloxAPI.getUniverseId(pId);
      let name = (isObj && optsOrPlaceId.name) || `Place ${pId}`;
      let iconUrl = (isObj && optsOrPlaceId.iconUrl) || "";
      if (uId && (!name || name.startsWith("Place ") || !iconUrl)) {
        const meta = await RobloxAPI.getGameMeta([uId]).catch(() => ({}));
        if (meta[uId]) {
          name = meta[uId].name || name;
          iconUrl = meta[uId].iconUrl || iconUrl;
        }
      }
      const list = this.getAll().filter((g) => String(g.placeId) !== pId);
      const entry = {
        placeId: pId,
        universeId: uId ? String(uId) : "",
        name,
        iconUrl,
        folder,
        addedAt: Date.now(),
      };
      list.unshift(entry);
      Store.set(STORAGE_KEYS.GAME_PLAYLISTS, list.slice(0, 60));
      return entry;
    },

    async pin(placeId, folder = "Favorites") {
      return this.pinGame({ placeId, folder });
    },

    unpinGame(placeId) {
      Store.set(
        STORAGE_KEYS.GAME_PLAYLISTS,
        this.getAll().filter((g) => String(g.placeId) !== String(placeId))
      );
    },

    unpin(placeId) {
      this.unpinGame(placeId);
    },
  };

  const RecentPlayersTracker = {
    getAll() {
      return Store.get(STORAGE_KEYS.RECENT_PLAYERS, []);
    },

    logPlayer({ userId, name, username, displayName = "", avatarUrl = "", placeId = "", jobId = "", gameName = "", source = "Server" }) {
      const resolvedName = name || username || "";
      if (!userId || !resolvedName) return;
      const uid = String(userId);
      const list = this.getAll().filter((p) => String(p.userId) !== uid);
      list.unshift({
        userId: uid,
        name: resolvedName,
        username: resolvedName,
        displayName: displayName || resolvedName,
        avatarUrl,
        placeId: String(placeId || ""),
        jobId: String(jobId || ""),
        gameName: gameName || (placeId ? `Place ${placeId}` : ""),
        source,
        metAt: Date.now(),
      });
      Store.set(STORAGE_KEYS.RECENT_PLAYERS, list.slice(0, 40));
    },

    clear() {
      Store.set(STORAGE_KEYS.RECENT_PLAYERS, []);
    },
  };

  const FriendsTracker = {
    getAllSnapshots() {
      return Store.get(STORAGE_KEYS.FRIENDS_SNAPSHOT, {});
    },

    getAccountSnapshot(userId) {
      if (!userId) return null;
      const snap = this.getAllSnapshots()[String(userId)];
      if (!snap) return null;
      const map = snap.map || snap.friendsMap || {};
      const events = Array.isArray(snap.events) ? snap.events : Array.isArray(snap.history) ? snap.history : [];
      return {
        map,
        friendsMap: map,
        events,
        history: events,
        updatedAt: snap.updatedAt || Date.now(),
      };
    },

    async syncActiveAccountFriends() {
      const user = AccountManager.activeUser;
      if (!user || !user.id) throw new Error("Sign in to view friends activity.");
      const uid = String(user.id);
      const friends = await RobloxAPI.getFriendsList(uid);
      const fIds = friends.map((f) => f.id).filter(Boolean);

      const [avatars, presences] = await Promise.all([
        fIds.length ? RobloxAPI.getAvatars(fIds).catch(() => ({})) : {},
        fIds.length ? RobloxAPI.getPresences(fIds).catch(() => []) : [],
      ]);

      const presMap = {};
      presences.forEach((p) => {
        presMap[p.userId] = p;
      });

      const store = this.getAllSnapshots();
      const prev = this.getAccountSnapshot(uid) || { map: {}, events: [] };
      const nextMap = {};
      const events = Array.isArray(prev.events) ? [...prev.events] : [];
      const hadPrevSnapshot = Object.keys(prev.map || {}).length > 0;

      for (const f of friends) {
        nextMap[f.id] = {
          id: f.id,
          userId: f.id,
          name: f.name,
          displayName: f.displayName || f.name,
          avatarUrl: avatars[f.id] || "",
        };
        if (hadPrevSnapshot && !prev.map[f.id]) {
          events.unshift({
            type: "added",
            id: f.id,
            userId: f.id,
            name: f.name,
            displayName: f.displayName || f.name,
            avatarUrl: avatars[f.id] || "",
            timestamp: Date.now(),
          });
        }
      }

      if (hadPrevSnapshot) {
        for (const [oldId, oldInfo] of Object.entries(prev.map)) {
          if (!nextMap[oldId]) {
            events.unshift({
              type: "unfriended",
              id: oldId,
              userId: oldId,
              name: oldInfo.name,
              displayName: oldInfo.displayName || oldInfo.name,
              avatarUrl: oldInfo.avatarUrl || "",
              timestamp: Date.now(),
            });
          }
        }
      }

      const trimmedEvents = events.slice(0, 80);
      store[uid] = {
        map: nextMap,
        friendsMap: nextMap,
        events: trimmedEvents,
        history: trimmedEvents,
        updatedAt: Date.now(),
      };
      Store.set(STORAGE_KEYS.FRIENDS_SNAPSHOT, store);

      const enrichedFriends = friends
        .map((f) => {
          const pres = presMap[f.id] || { userPresenceType: 0, lastLocation: "Offline" };
          if (pres.userPresenceType === 2 && pres.placeId) {
            RecentPlayersTracker.logPlayer({
              userId: f.id,
              name: f.name,
              displayName: f.displayName || f.name,
              avatarUrl: avatars[f.id] || "",
              placeId: pres.placeId,
              jobId: pres.gameId || "",
              gameName: pres.lastLocation || "",
              source: "Friend In-Game",
            });
          }
          return {
            id: f.id,
            userId: f.id,
            name: f.name,
            displayName: f.displayName || f.name,
            avatarUrl: avatars[f.id] || "",
            presence: pres,
          };
        })
        .sort((a, b) => {
          const pa = a.presence?.userPresenceType || 0;
          const pb = b.presence?.userPresenceType || 0;
          const score = (p) => (p === 2 ? 4 : p === 3 ? 3 : p === 1 ? 2 : 0);
          return score(pb) - score(pa) || a.name.localeCompare(b.name);
        });

      return {
        totalCount: enrichedFriends.length,
        friends: enrichedFriends,
        events: trimmedEvents,
      };
    },
  };

  const RolimonsEngine = {
    memoryItems: null,
    DEMAND_LABELS: { "-1": "Unassigned", 0: "Terrible", 1: "Low", 2: "Normal", 3: "High", 4: "Amazing" },
    TREND_LABELS: { "-1": "Stable", 0: "Lowering", 1: "Unstable", 2: "Stable", 3: "Rising", 4: "Fluctuating" },

    async ensureLoaded() {
      if (this.memoryItems) return this.memoryItems;
      const cached = Store.get(STORAGE_KEYS.ROLIMONS_CACHE, null);
      if (cached && cached.items && Date.now() - (cached.fetchedAt || 0) < 15 * 60 * 1000) {
        this.memoryItems = cached.items;
        return this.memoryItems;
      }
      const res = await RobloxAPI.request({
        url: "https://www.rolimons.com/itemapi/itemdetails",
        withCredentials: false,
      }).catch(() => ({ ok: false }));
      if (res.ok && res.data?.items) {
        this.memoryItems = res.data.items;
        try {
          Store.set(STORAGE_KEYS.ROLIMONS_CACHE, {
            fetchedAt: Date.now(),
            items: res.data.items,
          });
        } catch (_) {}
        return this.memoryItems;
      }
      this.memoryItems = cached?.items || {};
      return this.memoryItems;
    },

    getItemInfo(assetId) {
      const table = this.memoryItems || {};
      const row = table[String(assetId)];
      if (!Array.isArray(row)) return null;
      const rap = Number(row[2]) || 0;
      const rawVal = Number(row[3]);
      const value = rawVal > 0 ? rawVal : Number(row[4]) || rap;
      const demandLabel = this.DEMAND_LABELS[String(row[5])] || "Normal";
      const trendLabel = this.TREND_LABELS[String(row[6])] || "Stable";
      const isProjected = row[7] === 1;
      const isHyped = row[8] === 1;
      const isRare = row[9] === 1;
      return {
        assetId: String(assetId),
        name: row[0] || `Item ${assetId}`,
        acronym: row[1] || "",
        rap,
        value,
        demandNum: Number(row[5]),
        demand: demandLabel,
        demandLabel,
        trend: trendLabel,
        trendLabel,
        isProjected,
        projected: isProjected,
        isHyped,
        hyped: isHyped,
        isRare,
        rare: isRare,
      };
    },

    enrichCollectibles(colData) {
      if (!colData || !Array.isArray(colData.items)) return colData;
      let totalValue = 0;
      const enriched = colData.items.map((it) => {
        const roli = this.getItemInfo(it.assetId);
        const val = roli ? roli.value : Number(it.recentAveragePrice) || 0;
        totalValue += val;
        return Object.assign({}, it, {
          rolimons: roli,
          rolimonsValue: val,
          demand: roli?.demand || "—",
          trend: roli?.trend || "—",
          isProjected: Boolean(roli?.isProjected),
          isRare: Boolean(roli?.isRare),
        });
      });
      enriched.sort((a, b) => (b.rolimonsValue || 0) - (a.rolimonsValue || 0));
      return Object.assign({}, colData, {
        items: enriched,
        totalValue: totalValue || colData.totalRap || 0,
      });
    },

    async searchItems(query, limit = 12) {
      await this.ensureLoaded().catch(() => {});
      const q = String(query || "").trim().toLowerCase();
      if (!q || !this.memoryItems) return [];
      const matches = [];
      for (const [id, row] of Object.entries(this.memoryItems)) {
        if (!Array.isArray(row)) continue;
        const name = String(row[0] || "").toLowerCase();
        const acr = String(row[1] || "").toLowerCase();
        if (id === q || acr === q || name.includes(q)) {
          matches.push(this.getItemInfo(id));
          if (matches.length >= limit) break;
        }
      }
      return matches;
    },

    async getTopDeals(filterMode = "high_demand", limit = 15) {
      await this.ensureLoaded().catch(() => {});
      if (!this.memoryItems) return [];
      const all = [];
      for (const id of Object.keys(this.memoryItems)) {
        const info = this.getItemInfo(id);
        if (!info || info.rap <= 0) continue;
        if (filterMode === "high_demand" && info.demandNum >= 3 && !info.isProjected) {
          all.push(info);
        } else if (filterMode === "undervalued" && info.value > info.rap * 1.12 && !info.isProjected) {
          all.push(info);
        } else if (filterMode === "projected" && info.isProjected) {
          all.push(info);
        } else if (filterMode === "rare" && info.isRare) {
          all.push(info);
        }
      }
      if (filterMode === "undervalued") {
        all.sort((a, b) => b.value - b.rap - (a.value - a.rap));
      } else {
        all.sort((a, b) => b.value - a.value);
      }
      return all.slice(0, limit);
    },

    evaluateTradeOfferSide(offer) {
      const assets = Array.isArray(offer?.userAssets) ? offer.userAssets : [];
      const robux = Number(offer?.robux) || 0;
      let rap = robux;
      let value = robux;
      let hasProjected = false;
      const items = assets.map((a) => {
        const info = this.getItemInfo(a.assetId);
        const itemRap = Number(a.recentAveragePrice) || info?.rap || 0;
        const itemVal = info?.value || itemRap;
        rap += itemRap;
        value += itemVal;
        if (info?.isProjected) hasProjected = true;
        return {
          assetId: a.assetId,
          name: a.name || info?.name || `Item ${a.assetId}`,
          serialNumber: a.serialNumber,
          rap: itemRap,
          value: itemVal,
          demand: info?.demand || "—",
          isProjected: Boolean(info?.isProjected),
          isRare: Boolean(info?.isRare),
        };
      });
      return { items, robux, rap, value, totalRap: rap, totalValue: value, hasProjected };
    },
  };

  const AvatarQuickEngine = {
    async calculateOutfitCost(assetIds) {
      const ids = assetIds.slice(0, 25);
      const detailsList = await Promise.all(
        ids.map((id) => RobloxAPI.getAssetDetails(id).catch(() => ({ ok: false })))
      );
      let totalRobux = 0;
      const items = [];
      detailsList.forEach((res, idx) => {
        const id = ids[idx];
        const d = res.ok && res.data ? res.data : null;
        const price = d && Number.isFinite(Number(d.PriceInRobux)) ? Number(d.PriceInRobux) : 0;
        totalRobux += price;
        items.push({
          assetId: id,
          name: d?.Name || `Asset ${id}`,
          price: d?.PriceInRobux ?? null,
        });
      });
      return { totalRobux, items };
    },
  };

  const ContentBlocker = {
    getRules() {
      const raw = Store.get(STORAGE_KEYS.BLOCKLIST, []);
      if (!Array.isArray(raw)) return [];
      return raw
        .map((item, idx) => {
          if (typeof item === "string") {
            return {
              id: `rule_${idx}_${item}`,
              type: /^\d+$/.test(item) ? "placeId" : "keyword",
              value: item,
            };
          }
          if (item && typeof item === "object" && item.value) {
            return {
              id: item.id || `rule_${idx}_${item.value}`,
              type: item.type || (/^\d+$/.test(String(item.value)) ? "placeId" : "keyword"),
              value: String(item.value),
            };
          }
          return null;
        })
        .filter(Boolean);
    },

    addRule(ruleOrString) {
      const isObj = typeof ruleOrString === "object" && ruleOrString !== null;
      const value = String(isObj ? ruleOrString.value : ruleOrString || "").trim();
      if (!value) throw new Error("Enter a keyword or Place ID to block.");
      const type = isObj && ruleOrString.type ? ruleOrString.type : /^\d+$/.test(value) ? "placeId" : "keyword";
      const list = this.getRules().filter((r) => r.value.toLowerCase() !== value.toLowerCase());
      list.unshift({
        id: "blk_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        type,
        value,
      });
      Store.set(STORAGE_KEYS.BLOCKLIST, list.slice(0, 100));
      this.applyDomFilter();
    },

    removeRule(idOrValue) {
      const target = String(idOrValue || "");
      Store.set(
        STORAGE_KEYS.BLOCKLIST,
        this.getRules().filter((r) => r.id !== target && r.value !== target)
      );
      document.querySelectorAll("[data-rtk-blocked]").forEach((el) => {
        el.style.display = "";
        el.removeAttribute("data-rtk-blocked");
      });
      this.applyDomFilter();
    },

    applyDomFilter() {
      if (!Store.getSettings().qolContentBlocker) return;
      const rules = this.getRules();
      if (!rules.length) return;

      const tiles = document.querySelectorAll(
        ".game-card-container:not([data-rtk-blocked]), .grid-item-container:not([data-rtk-blocked]), li.list-item.game-card:not([data-rtk-blocked])"
      );
      tiles.forEach((tile) => {
        const text = (tile.textContent || "").toLowerCase();
        const link = tile.querySelector("a[href*='/games/']")?.getAttribute("href") || "";
        const matched = rules.some((r) => {
          const val = r.value.toLowerCase();
          return r.type === "placeId" ? link.includes(`/games/${val}`) : text.includes(val);
        });
        if (matched) {
          tile.setAttribute("data-rtk-blocked", "1");
          tile.style.display = "none";
        }
      });
    },
  };

  const FFlagGenerator = {
    PRESETS: [
      {
        id: "fps240",
        label: "Unlock 240 FPS Target",
        desc: "Sets DFIntTaskSchedulerTargetFps to 240",
        flags: { DFIntTaskSchedulerTargetFps: 240 },
      },
      {
        id: "notelemetry",
        label: "Reduce Client Telemetry",
        desc: "Disables EventIngest & ephemeral counter reporting",
        flags: {
          FFlagDebugDisableTelemetryEphemeralCounter: true,
          FFlagDebugDisableTelemetryEphemeralStat: true,
          FFlagDebugDisableTelemetryEventIngest: true,
          FFlagDebugDisableTelemetryPoint: true,
        },
      },
      {
        id: "lighting_phase3",
        label: "Force Future Is Bright (Phase 3 Shadows)",
        desc: "Enables Future lighting technology in supported places",
        flags: { FFlagDebugForceFutureIsBrightPhase3: true },
      },
      {
        id: "low_latency",
        label: "DX11 Low-Latency Frame Queue",
        desc: "Reduces render queue lag on Direct3D 11",
        flags: { FFlagD3D11UseFrameLatencyWaitableObject: true },
      },
      {
        id: "disable_titlebar",
        label: "Disable Fullscreen Top Bar Delay",
        desc: "Prevents accidental top-bar hover dropdown in fullscreen",
        flags: { FIntFullscreenTitleBarTriggerDelayMillis: 3600000 },
      },
    ],

    buildJson(selectedIds) {
      const merged = {};
      for (const preset of this.PRESETS) {
        if (selectedIds.includes(preset.id)) {
          Object.assign(merged, preset.flags);
        }
      }
      return JSON.stringify(merged, null, 2);
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
    search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    compass: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
    pin: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/></svg>`,
    shuffle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
    dollar: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    thumbsUp: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`,
    layers: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    globe: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    volume: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
    shield: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
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
      width: 540px;
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
    .rtk-badge-danger {
      background: rgba(247, 75, 82, 0.16);
      color: #F74B52;
      border-color: rgba(247, 75, 82, 0.35);
    }
    .rtk-badge-warn {
      background: rgba(247, 185, 40, 0.16);
      color: #FDE68A;
      border-color: rgba(247, 185, 40, 0.35);
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
      grid-template-columns: repeat(7, 1fr);
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
      padding: 0 2px;
      font-size: 11.5px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
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

    /* Spotlight Command Palette (Ctrl+K) */
    .rtk-cmd-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.62);
      z-index: 2147483646;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding-top: 12vh;
    }
    .rtk-cmd-backdrop.open {
      display: flex;
    }
    .rtk-cmd-modal {
      width: 540px;
      max-width: 94vw;
      background: var(--rbx-bg-surface);
      border: 1px solid var(--rbx-border-strong);
      border-radius: 10px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .rtk-cmd-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--rbx-border);
      background: var(--rbx-bg-input);
    }
    .rtk-cmd-input {
      flex: 1;
      border: none;
      background: transparent;
      color: var(--rbx-text);
      font-size: 15px;
      font-family: inherit;
      outline: none;
    }
    .rtk-cmd-list {
      max-height: 360px;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .rtk-cmd-item {
      padding: 9px 12px;
      border-radius: 8px;
      background: transparent;
      border: none;
      color: var(--rbx-text);
      font-family: inherit;
      font-size: 13.5px;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .rtk-cmd-item:hover, .rtk-cmd-item.selected {
      background: var(--rbx-bg-elevated);
    }

    /* 28-Day Playtime Heatmap */
    .rtk-heatmap {
      display: grid;
      grid-template-columns: repeat(14, 1fr);
      gap: 4px;
    }
    .rtk-heat-cell {
      aspect-ratio: 1;
      border-radius: 4px;
      background: var(--rbx-bg-elevated);
      border: 1px solid var(--rbx-border);
    }
    .rtk-heat-1 { background: rgba(0, 176, 111, 0.25); }
    .rtk-heat-2 { background: rgba(0, 176, 111, 0.5); }
    .rtk-heat-3 { background: rgba(0, 176, 111, 0.75); }
    .rtk-heat-4 { background: #00B06F; }

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
    .rtk-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .rtk-stat-box {
      background: var(--rbx-bg-elevated);
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .rtk-stat-val {
      font-size: 15px;
      font-weight: 700;
      color: var(--rbx-text);
    }
    .rtk-seg-bar {
      display: flex;
      background: var(--rbx-bg-elevated);
      padding: 3px;
      border-radius: 8px;
      gap: 4px;
    }
    .rtk-seg-btn {
      flex: 1;
      height: 30px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--rbx-text-secondary);
      font-size: 12.5px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
    }
    .rtk-seg-btn.active {
      background: var(--rbx-bg-surface);
      color: var(--rbx-text);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

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
    exploreMode: "experience",
    explorePlaceQuery: "",
    exploreUserQuery: "",
    exploreGroupQuery: "",
    exploreExpSubtab: "places",
    exploreUnownedBadgesOnly: false,
    pendingDevAssetId: "",
    cmdOpen: false,
    cmdSelectedIdx: 0,
    cmdFilteredActions: [],
    economyTimeFrame: "Month",
    tradeListType: "Inbound",
    recentTxType: "Sale",
    rolimonsDealMode: "high_demand",
    portfolioSummary: null,
    customTradeGive: [],
    customTradeReceive: [],
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
              <button class="rtk-btn rtk-btn-sm" id="rtk-cmd-open" title="Spotlight Command Palette (Ctrl+K / Alt+K)">${Icons.search}<span>Ctrl+K</span></button>
              <span class="rtk-muted" title="Keyboard Shortcut">Alt+R</span>
              <button class="rtk-icon-btn" id="rtk-close" title="Close">${Icons.close}</button>
            </div>
          </div>
          <nav class="rtk-tabs" id="rtk-tabs">
            <button class="rtk-tab active" data-tab="joiner">${Icons.server}<span>Servers</span></button>
            <button class="rtk-tab" data-tab="accounts">${Icons.users}<span>Accounts</span></button>
            <button class="rtk-tab" data-tab="explore">${Icons.compass}<span>Explore</span></button>
            <button class="rtk-tab" data-tab="economy">${Icons.dollar}<span>Economy</span></button>
            <button class="rtk-tab" data-tab="settings">${Icons.toolkit}<span>Settings</span></button>
            <button class="rtk-tab" data-tab="playtime">${Icons.clock}<span>Playtime</span></button>
            <button class="rtk-tab" data-tab="devtools">${Icons.code}<span>Dev</span></button>
          </nav>
          <div class="rtk-body" id="rtk-body"></div>
        </aside>
        <div class="rtk-cmd-backdrop" id="rtk-cmd-backdrop">
          <div class="rtk-cmd-modal" role="dialog" aria-label="Command Palette">
            <input class="rtk-cmd-input" id="rtk-cmd-input" placeholder="Type a command, @username, Place ID, Job ID, or Asset ID... (Esc to close)" />
            <div class="rtk-cmd-list" id="rtk-cmd-list"></div>
          </div>
        </div>
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

      if (document.body) {
        new MutationObserver(() => this.syncTheme()).observe(document.body, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }

      this.shadow.getElementById("rtk-backdrop").addEventListener("click", () => this.toggle(false));
      this.shadow.getElementById("rtk-close").addEventListener("click", () => this.toggle(false));
      this.shadow.getElementById("rtk-pill").addEventListener("click", () => this.toggle(true));
      this.shadow.getElementById("rtk-cmd-open").addEventListener("click", () => this.toggleCommandPalette(true));
      this.shadow.getElementById("rtk-cmd-backdrop").addEventListener("click", (e) => {
        if (e.target.id === "rtk-cmd-backdrop") this.toggleCommandPalette(false);
      });

      const cmdInput = this.shadow.getElementById("rtk-cmd-input");
      cmdInput.addEventListener("input", () => {
        this.cmdSelectedIdx = 0;
        this.renderCommandPaletteList(cmdInput.value);
      });
      cmdInput.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (this.cmdFilteredActions.length) {
            this.cmdSelectedIdx = (this.cmdSelectedIdx + 1) % this.cmdFilteredActions.length;
            this.renderCommandPaletteList(cmdInput.value);
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (this.cmdFilteredActions.length) {
            this.cmdSelectedIdx = (this.cmdSelectedIdx - 1 + this.cmdFilteredActions.length) % this.cmdFilteredActions.length;
            this.renderCommandPaletteList(cmdInput.value);
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          const chosen = this.cmdFilteredActions[this.cmdSelectedIdx];
          if (chosen && typeof chosen.run === "function") {
            this.toggleCommandPalette(false);
            chosen.run();
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.toggleCommandPalette(false);
        }
      });

      this.shadow.getElementById("rtk-tabs").addEventListener("click", (e) => {
        const btn = e.target.closest(".rtk-tab");
        if (btn && btn.dataset.tab) {
          this.switchTab(btn.dataset.tab);
        }
      });

      document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.altKey) && (e.key === "k" || e.key === "K")) {
          e.preventDefault();
          this.toggleCommandPalette();
        } else if (e.altKey && (e.key === "r" || e.key === "R")) {
          e.preventDefault();
          this.toggle();
        } else if (e.key === "Escape") {
          if (this.cmdOpen) this.toggleCommandPalette(false);
          else if (this.isOpen) this.toggle(false);
        }
      });

      this.liveTickInterval = setInterval(() => this.onSecondTick(), 1000);
    },

    toggleCommandPalette(force) {
      if (!this.shadow) this.init();
      this.syncTheme();
      this.cmdOpen = typeof force === "boolean" ? force : !this.cmdOpen;
      const bd = this.shadow.getElementById("rtk-cmd-backdrop");
      const inp = this.shadow.getElementById("rtk-cmd-input");
      bd.classList.toggle("open", this.cmdOpen);
      if (this.cmdOpen) {
        inp.value = "";
        this.cmdSelectedIdx = 0;
        this.renderCommandPaletteList("");
        setTimeout(() => inp.focus(), 20);
      }
    },

    renderCommandPaletteList(rawQuery) {
      const q = String(rawQuery || "").trim();
      const qLower = q.toLowerCase();
      const pagePlaceId = Utils.getPlaceIdFromPage();
      const actions = [];

      // Dynamic query actions when user types an ID or username
      if (Utils.isValidJobId(q) && pagePlaceId) {
        actions.push({
          title: `Join Job ID ${q.slice(0, 18)}...`,
          sub: `Launch Place ${pagePlaceId} directly into this server`,
          badge: "Direct Join",
          run: () => Launcher.join(pagePlaceId, q, "current").catch((err) => this.toast(err.message, "error")),
        });
      }
      if (/^\d{5,15}$/.test(q)) {
        actions.push({
          title: `Join Place ID ${q}`,
          sub: "Launch Roblox experience directly",
          badge: "Launch",
          run: () => Launcher.join(q, null, "current").catch((err) => this.toast(err.message, "error")),
        });
        actions.push({
          title: `Inspect Experience / Universe ${q}`,
          sub: "View subplaces, passes, badges & creation date",
          badge: "Explore",
          run: () => this.openExplore({ mode: "experience", query: q }),
        });
        actions.push({
          title: `Inspect Asset / Binary ${q}`,
          sub: "Open in DevTools Asset & Script Extractor",
          badge: "DevTools",
          run: () => this.openDevAsset(q),
        });
        actions.push({
          title: `Inspect User ID ${q}`,
          sub: "Lookup User Profile, RAP, Rolimon's Value & Outfits",
          badge: "User",
          run: () => this.openExplore({ mode: "user", query: q }),
        });
        actions.push({
          title: `Inspect Group ID ${q}`,
          sub: "View Group Roles, Member Ranks, Shout & Experiences",
          badge: "Group",
          run: () => this.openExplore({ mode: "group", query: q }),
        });
      } else if (q.length >= 2) {
        const cleanUser = q.replace(/^@/, "");
        actions.push({
          title: `Lookup User @${cleanUser}`,
          sub: "Inspect RAP, Rolimon's Value, Banned status & Outfits",
          badge: "User Lookup",
          run: () => this.openExplore({ mode: "user", query: cleanUser }),
        });
        if (pagePlaceId) {
          actions.push({
            title: `Find @${cleanUser} in Current Experience`,
            sub: `Scan Place ${pagePlaceId} servers for @${cleanUser}`,
            badge: "Server Scanner",
            run: () => {
              this.openTab("joiner");
              setTimeout(() => {
                const inp = this.shadow.getElementById("j-find-user");
                const btn = this.shadow.getElementById("j-find-btn");
                if (inp && btn) {
                  inp.value = cleanUser;
                  btn.click();
                }
              }, 80);
            },
          });
        }
      }

      // Context actions for current game page
      if (pagePlaceId) {
        actions.push({
          title: `Server Hop Current Game (Place ${pagePlaceId})`,
          sub: "Switch to a fresh server in this experience",
          badge: "Action",
          run: () => Launcher.serverHop(pagePlaceId, "current").then(() => this.toast("Server hopping...", "success")).catch((e) => this.toast(e.message, "error")),
        });
        actions.push({
          title: `Join Smallest Server (Place ${pagePlaceId})`,
          sub: "Find and launch the lowest-population server",
          badge: "Action",
          run: () => Launcher.joinSmallestServer(pagePlaceId, "current").then(() => this.toast("Joining smallest server...", "success")).catch((e) => this.toast(e.message, "error")),
        });
        actions.push({
          title: `Join Lowest Ping Server (Place ${pagePlaceId})`,
          sub: "Find and launch the fastest ping server",
          badge: "Action",
          run: () => Launcher.joinLowestPingServer(pagePlaceId, "current").then(() => this.toast("Joining lowest ping server...", "success")).catch((e) => this.toast(e.message, "error")),
        });
      }

      // Saved Accounts
      for (const acc of AccountManager.getList()) {
        actions.push({
          title: `Switch Account to @${acc.username}`,
          sub: acc.displayName ? `${acc.displayName} (${acc.userId})` : `User ID ${acc.userId}`,
          badge: "Account",
          run: () => AccountManager.switchToAccount(acc.userId).then(() => window.location.reload()).catch((e) => this.toast(e.message, "error")),
        });
      }

      // Pinned Experiences
      for (const g of PlaylistManager.getAll()) {
        actions.push({
          title: `Play Pinned Game: ${g.name}`,
          sub: `Folder: ${g.folder} · Place ${g.placeId}`,
          badge: "Playlist",
          run: () => Launcher.join(g.placeId, null, "current").catch((e) => this.toast(e.message, "error")),
        });
      }

      // Pinned Servers
      for (const p of PinnedServers.getAll()) {
        actions.push({
          title: `Join Pinned Server: ${p.label || p.gameName || p.placeId}`,
          sub: `Job ${p.jobId.slice(0, 18)}...`,
          badge: "Pinned Server",
          run: () => Launcher.join(p.placeId, p.jobId, "current").catch((e) => this.toast(e.message, "error")),
        });
      }

      // Quick Presets & Navigation
      actions.push(
        {
          title: "Preset: Appear Offline (Stealth Mode)",
          sub: "Hide online status and join visibility",
          badge: "Privacy",
          run: () => QuickSettings.applyPreset("stealth").then(() => this.toast("Stealth Mode applied.", "success")).catch((e) => this.toast(e.message, "error")),
        },
        {
          title: "Preset: Social / Public Mode",
          sub: "Enable Friends joins and chat visibility",
          badge: "Privacy",
          run: () => QuickSettings.applyPreset("social").then(() => this.toast("Social Mode applied.", "success")).catch((e) => this.toast(e.message, "error")),
        },
        {
          title: "Avatar: Switch Active Rig to R6",
          sub: "1-click switch avatar rig type to classic R6",
          badge: "Avatar",
          run: () => RobloxAPI.setAvatarRigType("R6").then(() => this.toast("Switched avatar to R6.", "success")).catch((e) => this.toast(e.message, "error")),
        },
        {
          title: "Avatar: Switch Active Rig to R15",
          sub: "1-click switch avatar rig type to R15",
          badge: "Avatar",
          run: () => RobloxAPI.setAvatarRigType("R15").then(() => this.toast("Switched avatar to R15.", "success")).catch((e) => this.toast(e.message, "error")),
        },
        {
          title: "Open Tab: Economy, Trades & Rolimon's Values",
          sub: "View Pending Robux, Revenue, Trade Evaluator & Calculator",
          badge: "Tab",
          run: () => this.openTab("economy"),
        },
        {
          title: "Open Tab: Playtime & 28-Day Heatmap",
          sub: "View session logs, leaderboard & daily activity",
          badge: "Tab",
          run: () => this.openTab("playtime"),
        }
      );

      this.cmdFilteredActions = qLower
        ? actions.filter((a) => `${a.title} ${a.sub} ${a.badge}`.toLowerCase().includes(qLower)).slice(0, 18)
        : actions.slice(0, 14);

      if (this.cmdSelectedIdx >= this.cmdFilteredActions.length) {
        this.cmdSelectedIdx = 0;
      }

      const listEl = this.shadow.getElementById("rtk-cmd-list");
      if (!this.cmdFilteredActions.length) {
        listEl.innerHTML = `<div class="rtk-muted" style="padding:14px;">No matching commands. Type a Place ID, Job ID, or @username.</div>`;
        return;
      }

      listEl.innerHTML = this.cmdFilteredActions.map((act, idx) => `
        <div class="rtk-cmd-item ${idx === this.cmdSelectedIdx ? "active" : ""}" data-cmd-idx="${idx}">
          <div class="rtk-flex-1">
            <div style="font-weight:700;">${Utils.escapeHtml(act.title)}</div>
            <div class="rtk-muted">${Utils.escapeHtml(act.sub)}</div>
          </div>
          <span class="rtk-badge">${Utils.escapeHtml(act.badge)}</span>
        </div>
      `).join("");

      listEl.querySelectorAll("[data-cmd-idx]").forEach((el) => {
        el.addEventListener("click", () => {
          const idx = Number(el.dataset.cmdIdx);
          const chosen = this.cmdFilteredActions[idx];
          if (chosen && typeof chosen.run === "function") {
            this.toggleCommandPalette(false);
            chosen.run();
          }
        });
      });
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

    openExplore({ mode = "experience", query = "", subtab = "" } = {}) {
      this.exploreMode = mode;
      if (mode === "experience" && query) this.explorePlaceQuery = String(query);
      if (mode === "user" && query) this.exploreUserQuery = String(query);
      if (mode === "group" && query) this.exploreGroupQuery = String(query);
      if (subtab) this.exploreExpSubtab = subtab;
      this.openTab("explore");
    },

    openDevAsset(assetId) {
      this.pendingDevAssetId = String(assetId || "");
      this.openTab("devtools");
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
      else if (this.activeTab === "explore") this.renderExploreTab(body);
      else if (this.activeTab === "economy") this.renderEconomyTab(body);
      else if (this.activeTab === "settings") this.renderSettingsTab(body);
      else if (this.activeTab === "playtime") this.renderPlaytimeTab(body);
      else if (this.activeTab === "devtools") this.renderDevToolsTab(body);
    },

    /* ---------------- TAB 1: JOINER, PLAYER FINDER, REGION & VIP VAULT ---------------- */
    renderJoinerTab(body) {
      const pagePlaceId = Utils.getPlaceIdFromPage() || "";
      const recent = Store.get(STORAGE_KEYS.RECENT_SERVERS, []);
      const recentPlayers = RecentPlayersTracker.getAll();
      const pinned = PinnedServers.getAll();
      const vipLinks = VipLinkVault.getAll();
      const currentUrlIsVip = VipLinkVault.parseVipUrl(window.location.href) ? window.location.href : "";
      const activeSession = PlaytimeTracker.getData().activeSession;
      const settings = Store.getSettings();

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
            <div class="rtk-row">
              <input class="rtk-input rtk-flex-1" id="j-job" placeholder="9134c999-91d5-4b52-9f0a-f7cbae67fe77" />
              <button class="rtk-btn" id="j-pin-input-btn" title="Pin this Job ID">${Icons.pin}<span>Pin</span></button>
            </div>
          </div>
          <div class="rtk-col">
            <label class="rtk-label">Account</label>
            <div class="rtk-row">
              <select class="rtk-select rtk-flex-1" id="j-account">${this.buildAccountOptionsHtml()}</select>
              <button class="rtk-btn" id="j-random-alt-btn" title="Pick a random saved alt account and launch">${Icons.shuffle}<span>Random Alt</span></button>
            </div>
          </div>
          <button class="rtk-btn rtk-btn-growth" id="j-launch-btn" style="height:40px;font-size:14px;margin-top:4px;">
            ${Icons.play}<span>Join Experience</span>
          </button>
          <div class="rtk-grid-3">
            <button class="rtk-btn rtk-btn-sm" id="j-hop-btn">${Icons.shuffle}<span>Server Hop</span></button>
            <button class="rtk-btn rtk-btn-sm" id="j-smallest-btn">Smallest</button>
            <button class="rtk-btn rtk-btn-sm" id="j-ping-btn">Lowest Ping</button>
          </div>
          <label class="rtk-switch-row" style="margin-top:2px;">
            <div>
              <div class="rtk-label">Auto-Rejoin Watchdog</div>
              <div class="rtk-muted">Auto-reconnect to your exact Job ID if an active session drops unexpectedly</div>
            </div>
            ${renderToggleSwitch("j-watchdog-opt", settings.autoRejoinWatchdog)}
          </label>
        </div>

        ${activeSession && activeSession.gameId ? `
          <div class="rtk-card rtk-col">
            <div class="rtk-card-title">
              <span class="rtk-row"><span class="rtk-dot-live"></span> Active Server</span>
              <div class="rtk-row">
                <button class="rtk-btn rtk-btn-sm" id="j-inspect-live-region">${Icons.globe}<span>Region & Version</span></button>
                <button class="rtk-btn rtk-btn-sm" id="j-pin-live-btn">${Icons.pin}<span>Pin</span></button>
              </div>
            </div>
            <div class="rtk-muted">${Utils.escapeHtml(activeSession.name || "In-Experience")}</div>
            <div class="rtk-code">${Utils.escapeHtml(activeSession.gameId)}</div>
            <div id="j-live-region-out" class="rtk-muted" style="display:none;"></div>
            <div class="rtk-grid-3">
              <button class="rtk-btn rtk-btn-sm" id="j-copy-live-job">${Icons.copy}<span>Job ID</span></button>
              <button class="rtk-btn rtk-btn-sm" id="j-copy-live-link">${Icons.link}<span>Join Link</span></button>
              <button class="rtk-btn rtk-btn-sm" id="j-copy-live-discord">${Icons.copy}<span>Discord Card</span></button>
            </div>
          </div>
        ` : ""}

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Find Player in Server</span>
            <span class="rtk-badge">Token Scanner</span>
          </div>
          <div class="rtk-muted">Locate which public server any Roblox user is playing in — works even when their joins are turned off.</div>
          <div class="rtk-row">
            <input class="rtk-input rtk-flex-1" id="j-find-user" placeholder="Username or User ID (e.g. Builderman)" />
            <button class="rtk-btn rtk-btn-cta" id="j-find-btn">${Icons.search}<span>Find</span></button>
            <button class="rtk-btn rtk-btn-danger" id="j-find-stop" style="display:none;">Stop</button>
          </div>
          <div id="j-find-output"></div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Custom Server Browser & Region Inspector</span>
          </div>
          <div class="rtk-grid-2">
            <select class="rtk-select" id="j-browse-sort">
              <option value="smallest">Smallest Players</option>
              <option value="ping">Lowest Ping (ms)</option>
              <option value="fps">Highest Server FPS</option>
              <option value="largest">Most Populated</option>
            </select>
            <select class="rtk-select" id="j-browse-max">
              <option value="0">Max Players: Any</option>
              <option value="2">Max 2 Players (Solo/Duo)</option>
              <option value="5">Max 5 Players</option>
              <option value="10">Max 10 Players</option>
            </select>
          </div>
          <button class="rtk-btn" id="j-browse-btn">${Icons.refresh}<span>Fetch Filtered Servers</span></button>
          <div id="j-browse-output" class="rtk-col"></div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Private / VIP Server Link Vault (${vipLinks.length})</span>
          </div>
          <div class="rtk-row">
            <input class="rtk-input rtk-flex-1" id="j-vip-url" placeholder="Paste ?privateServerLinkCode=... or share link" value="${Utils.escapeHtml(currentUrlIsVip)}" />
            <input class="rtk-input" id="j-vip-label" placeholder="Label (e.g. Grinding)" style="width:130px;" />
            <button class="rtk-btn rtk-btn-cta" id="j-vip-save">Save</button>
          </div>
          ${vipLinks.length === 0
            ? `<div class="rtk-muted">Store private server links and share URLs here so they never get lost in chat logs.</div>`
            : vipLinks.map((v) => `
              <div class="rtk-acc-item">
                <div class="rtk-flex-1">
                  <div style="font-weight:700;" class="rtk-ellipsis">${Utils.escapeHtml(v.label)}</div>
                  <div class="rtk-muted rtk-ellipsis">${Utils.escapeHtml(v.gameName)}${v.placeId ? ` · Place ${Utils.escapeHtml(v.placeId)}` : ""}</div>
                </div>
                <button class="rtk-btn rtk-btn-sm" data-vip-copy="${Utils.escapeHtml(v.url)}">${Icons.copy}</button>
                <button class="rtk-btn rtk-btn-sm rtk-btn-danger" data-vip-del="${Utils.escapeHtml(v.id)}">✕</button>
                <button class="rtk-btn rtk-btn-sm rtk-btn-growth" data-vip-open="${Utils.escapeHtml(v.url)}">Open</button>
              </div>
            `).join("")}
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Pinned Servers (${pinned.length})</span>
          </div>
          ${pinned.length === 0
            ? `<div class="rtk-muted">Bookmark favorite public Job IDs here for instant re-entry.</div>`
            : pinned.map((p) => `
              <div class="rtk-acc-item">
                <div class="rtk-flex-1">
                  <div class="rtk-row" style="gap:6px;">
                    <strong class="rtk-ellipsis">${Utils.escapeHtml(p.label || p.gameName || `Place ${p.placeId}`)}</strong>
                    ${p.label && p.gameName ? `<span class="rtk-badge">${Utils.escapeHtml(p.gameName)}</span>` : ""}
                  </div>
                  <div class="rtk-muted rtk-ellipsis">${Utils.escapeHtml(p.jobId.slice(0, 18))}... · Place ${Utils.escapeHtml(p.placeId)}</div>
                </div>
                <button class="rtk-btn rtk-btn-sm" data-copy-job="${Utils.escapeHtml(p.jobId)}">Copy</button>
                <button class="rtk-btn rtk-btn-sm rtk-btn-danger" data-unpin-job="${Utils.escapeHtml(p.jobId)}" title="Unpin">✕</button>
                <button class="rtk-btn rtk-btn-sm rtk-btn-growth" data-rejoin-place="${Utils.escapeHtml(p.placeId)}" data-rejoin-job="${Utils.escapeHtml(p.jobId)}">Join</button>
              </div>
            `).join("")}
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Recent Players Met / Scanned (${recentPlayers.length})</span>
            ${recentPlayers.length ? `<button class="rtk-btn rtk-btn-sm" id="j-clear-recent-players">Clear</button>` : ""}
          </div>
          ${recentPlayers.length === 0
            ? `<div class="rtk-muted">Players located via the Token Scanner appear here with their server Job ID and timestamp.</div>`
            : recentPlayers.slice(0, 12).map((rp) => `
              <div class="rtk-acc-item">
                <img class="rtk-avatar" src="${Utils.escapeHtml(rp.avatarUrl || "https://www.roblox.com/favicon.ico")}" alt="" />
                <div class="rtk-flex-1">
                  <div style="font-weight:700;" class="rtk-ellipsis">@${Utils.escapeHtml(rp.name || rp.username)}</div>
                  <div class="rtk-muted rtk-ellipsis">${Utils.escapeHtml(rp.gameName || `Place ${rp.placeId}`)} · ${Utils.timeAgo(rp.metAt)}</div>
                </div>
                <button class="rtk-btn rtk-btn-sm" data-rp-lookup="${Utils.escapeHtml(rp.userId)}">Lookup</button>
                ${rp.placeId && rp.jobId ? `<button class="rtk-btn rtk-btn-sm rtk-btn-growth" data-rejoin-place="${Utils.escapeHtml(rp.placeId)}" data-rejoin-job="${Utils.escapeHtml(rp.jobId)}">Join</button>` : ""}
              </div>
            `).join("")}
        </div>

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
                <button class="rtk-btn rtk-btn-sm" title="Pin Server" data-pin-recent-place="${Utils.escapeHtml(item.placeId)}" data-pin-recent-job="${Utils.escapeHtml(item.jobId)}" data-pin-recent-name="${Utils.escapeHtml(item.gameName || "")}">${Icons.pin}</button>
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

      body.querySelector("#j-random-alt-btn")?.addEventListener("click", async () => {
        const { placeId, jobId } = getInputs();
        if (!placeId) return this.toast("Enter a Place ID first.", "error");
        const curId = AccountManager.activeUser?.id ? String(AccountManager.activeUser.id) : "";
        const alts = AccountManager.getList().filter((a) => String(a.userId) !== curId && !a.isBanned);
        const pool = alts.length > 0 ? alts : AccountManager.getList();
        if (!pool.length) return this.toast("Save at least one account in the Accounts tab first.", "error");
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        body.querySelector("#j-account").value = String(chosen.userId);
        try {
          await Launcher.join(placeId, jobId || null, String(chosen.userId));
          this.toast(`Launching as random alt @${chosen.username}...`, "success");
        } catch (err) {
          this.toast(err.message, "error");
        }
      });

      body.querySelector("#j-watchdog-opt")?.addEventListener("change", (e) => {
        Store.updateSettings({ autoRejoinWatchdog: e.target.checked });
        this.toast(e.target.checked ? "Auto-Rejoin Watchdog armed." : "Auto-Rejoin Watchdog disabled.", "info");
      });

      body.querySelector("#j-pin-input-btn").addEventListener("click", async () => {
        const { placeId, jobId } = getInputs();
        if (!jobId) return this.toast("Paste a Job ID first to pin it.", "error");
        const label = window.prompt("Optional label for this pinned server (e.g. Grinding, Trading):", "") ?? "";
        try {
          await PinnedServers.pin({ jobId, placeId, label });
          this.toast("Server pinned.", "success");
          this.renderJoinerTab(body);
        } catch (err) {
          this.toast(err.message, "error");
        }
      });

      body.querySelector("#j-hop-btn").addEventListener("click", async (e) => {
        const { placeId, accId } = getInputs();
        if (!placeId) return this.toast("Enter a Place ID first.", "error");
        e.currentTarget.disabled = true;
        try {
          const s = await Launcher.serverHop(placeId, accId);
          this.toast(`Hopping to fresh server (${s.playing}/${s.maxPlayers})...`, "success");
        } catch (err) {
          this.toast(err.message, "error");
        } finally {
          e.currentTarget.disabled = false;
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

      body.querySelector("#j-inspect-live-region")?.addEventListener("click", async (e) => {
        const pId = activeSession.placeId || activeSession.rootPlaceId || pagePlaceId;
        const outEl = body.querySelector("#j-live-region-out");
        e.currentTarget.disabled = true;
        outEl.style.display = "block";
        outEl.textContent = "Resolving server datacenter, IP & PlaceVersion...";
        try {
          const info = await ServerRegionInspector.inspectServer(pId, activeSession.gameId);
          outEl.textContent = `${info.regionLabel} · v${info.placeVersion || "?"}${info.ip ? ` · ${info.ip}` : ""}`;
        } catch (err) {
          outEl.textContent = `Could not inspect server: ${err.message}`;
        } finally {
          e.currentTarget.disabled = false;
        }
      });

      body.querySelector("#j-pin-live-btn")?.addEventListener("click", async () => {
        const pId = activeSession.placeId || activeSession.rootPlaceId || pagePlaceId;
        const label = window.prompt("Optional label for this active server:", "") ?? "";
        try {
          await PinnedServers.pin({ jobId: activeSession.gameId, placeId: pId, label, gameName: activeSession.name });
          this.toast("Active server pinned.", "success");
          this.renderJoinerTab(body);
        } catch (err) {
          this.toast(err.message, "error");
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

      body.querySelector("#j-copy-live-discord")?.addEventListener("click", async () => {
        const pId = activeSession.placeId || activeSession.rootPlaceId || pagePlaceId;
        const link = `https://www.roblox.com/games/${pId}/-?serverJobId=${activeSession.gameId}`;
        const md = `**${activeSession.name || "Roblox Server"}**\nPlace ID: \`${pId}\` · Job ID: \`${activeSession.gameId}\`\n[Click to Join Server Directly](<${link}>)`;
        await Utils.copyText(md);
        this.toast("Copied Discord invite markdown.", "success");
      });

      // VIP Link Vault handlers
      body.querySelector("#j-vip-save")?.addEventListener("click", async () => {
        const url = body.querySelector("#j-vip-url").value.trim();
        const label = body.querySelector("#j-vip-label").value.trim();
        try {
          await VipLinkVault.addLink({ url, label, placeIdFallback: pagePlaceId });
          this.toast("VIP server link saved to vault.", "success");
          this.renderJoinerTab(body);
        } catch (err) {
          this.toast(err.message, "error");
        }
      });
      body.querySelectorAll("[data-vip-copy]").forEach((b) => {
        b.addEventListener("click", async () => {
          await Utils.copyText(b.dataset.vipCopy);
          this.toast("Copied VIP server link.", "success");
        });
      });
      body.querySelectorAll("[data-vip-del]").forEach((b) => {
        b.addEventListener("click", () => {
          VipLinkVault.removeLink(b.dataset.vipDel);
          this.renderJoinerTab(body);
        });
      });
      body.querySelectorAll("[data-vip-open]").forEach((b) => {
        b.addEventListener("click", () => {
          window.location.href = b.dataset.vipOpen;
        });
      });

      // Player Server Finder
      const findBtn = body.querySelector("#j-find-btn");
      const stopBtn = body.querySelector("#j-find-stop");
      const findInput = body.querySelector("#j-find-user");
      const findOut = body.querySelector("#j-find-output");

      const runPlayerScan = async () => {
        const { placeId } = getInputs();
        const query = findInput.value.trim();
        if (!placeId) return this.toast("Enter a Place ID above first.", "error");
        if (!query) return this.toast("Enter a username or User ID to find.", "error");

        findBtn.style.display = "none";
        stopBtn.style.display = "inline-flex";
        findOut.innerHTML = `<div class="rtk-muted" style="margin-top:4px;">Resolving user & avatar headshot...</div>`;

        try {
          const res = await ServerScanner.findPlayerInServers(placeId, query, (prog) => {
            findOut.innerHTML = `<div class="rtk-muted" style="margin-top:4px;">Scanning @${Utils.escapeHtml(prog.username)} — Page ${prog.page}/15 · ${Utils.formatNumber(prog.serversChecked)} servers · ${Utils.formatNumber(prog.playersChecked)} players...</div>`;
          });

          if (res.found && res.server) {
            const srv = res.server;
            findOut.innerHTML = `
              <div class="rtk-acc-item current" style="margin-top:6px;">
                <img class="rtk-avatar" src="${Utils.escapeHtml(res.avatarUrl)}" alt="" />
                <div class="rtk-flex-1">
                  <div style="font-weight:700;">Found @${Utils.escapeHtml(res.user.name)}</div>
                  <div class="rtk-muted">${Utils.escapeHtml(srv.id.slice(0, 16))}... · ${srv.playing}/${srv.maxPlayers} players${srv.ping ? ` · ${srv.ping} ms` : ""}</div>
                </div>
                <button class="rtk-btn rtk-btn-sm" id="j-found-copy">${Icons.copy}</button>
                <button class="rtk-btn rtk-btn-sm rtk-btn-growth" id="j-found-join">${Icons.play}<span>Join</span></button>
              </div>
            `;
            findOut.querySelector("#j-found-copy")?.addEventListener("click", async () => {
              await Utils.copyText(srv.id);
              this.toast("Copied found server Job ID.", "success");
            });
            findOut.querySelector("#j-found-join")?.addEventListener("click", async () => {
              const accId = body.querySelector("#j-account").value;
              try {
                await Launcher.join(placeId, srv.id, accId);
                this.toast(`Joining @${res.user.name}'s server...`, "success");
              } catch (err) {
                this.toast(err.message, "error");
              }
            });
          } else {
            findOut.innerHTML = `<div class="rtk-muted" style="margin-top:6px;">@${Utils.escapeHtml(res.user.name)} was not found in the first ${Utils.formatNumber(res.serversChecked)} public servers (${Utils.formatNumber(res.playersChecked)} players checked). They may be offline, in a private server, or in a different subplace.</div>`;
          }
        } catch (err) {
          findOut.innerHTML = `<div class="rtk-alert" style="margin-top:6px;">${Utils.escapeHtml(err.message)}</div>`;
        } finally {
          findBtn.style.display = "inline-flex";
          stopBtn.style.display = "none";
        }
      };

      findBtn.addEventListener("click", runPlayerScan);
      findInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          runPlayerScan();
        }
      });
      stopBtn.addEventListener("click", () => ServerScanner.abort());

      // Custom Server Browser
      body.querySelector("#j-browse-btn").addEventListener("click", async (e) => {
        const { placeId } = getInputs();
        if (!placeId) return this.toast("Enter a Place ID above first.", "error");
        const sortBy = body.querySelector("#j-browse-sort").value;
        const maxPlayers = Number(body.querySelector("#j-browse-max").value) || 0;
        const out = body.querySelector("#j-browse-output");

        e.currentTarget.disabled = true;
        out.innerHTML = `<div class="rtk-muted">Fetching public servers...</div>`;
        try {
          const list = await ServerScanner.browseServers(placeId, { sortBy, maxPlayers, pages: 2 });
          if (!list.length) {
            out.innerHTML = `<div class="rtk-muted">No open public servers matched your filter.</div>`;
            return;
          }
          out.innerHTML = list.slice(0, 25).map((srv) => `
            <div class="rtk-acc-item">
              <div class="rtk-flex-1">
                <div style="font-weight:700;">${srv.playing}/${srv.maxPlayers} Players ${srv.ping ? `· ${srv.ping} ms` : ""} ${srv.fps ? `· ${Math.round(srv.fps)} FPS` : ""}</div>
                <div class="rtk-muted rtk-ellipsis" data-br-sub="${Utils.escapeHtml(srv.id)}">${Utils.escapeHtml(srv.id)}</div>
              </div>
              <button class="rtk-btn rtk-btn-sm" data-br-region="${Utils.escapeHtml(srv.id)}" title="Inspect Datacenter Region & PlaceVersion">${Icons.globe}</button>
              <button class="rtk-btn rtk-btn-sm" data-br-pin="${Utils.escapeHtml(srv.id)}" title="Pin">${Icons.pin}</button>
              <button class="rtk-btn rtk-btn-sm" data-br-copy="${Utils.escapeHtml(srv.id)}" title="Copy">${Icons.copy}</button>
              <button class="rtk-btn rtk-btn-sm rtk-btn-growth" data-br-join="${Utils.escapeHtml(srv.id)}">Join</button>
            </div>
          `).join("");

          out.querySelectorAll("[data-br-region]").forEach((b) => {
            b.addEventListener("click", async () => {
              const jobId = b.dataset.brRegion;
              const subEl = out.querySelector(`[data-br-sub="${jobId}"]`);
              b.disabled = true;
              if (subEl) subEl.textContent = "Resolving datacenter region & build version...";
              try {
                const info = await ServerRegionInspector.inspectServer(placeId, jobId);
                if (subEl) subEl.textContent = `${info.regionLabel} · v${info.placeVersion || "?"} · ${jobId.slice(0, 12)}...`;
              } catch (err) {
                if (subEl) subEl.textContent = `Region unavailable (${err.message})`;
              } finally {
                b.disabled = false;
              }
            });
          });
          out.querySelectorAll("[data-br-copy]").forEach((b) => {
            b.addEventListener("click", async () => {
              await Utils.copyText(b.dataset.brCopy);
              this.toast("Copied Job ID.", "success");
            });
          });
          out.querySelectorAll("[data-br-pin]").forEach((b) => {
            b.addEventListener("click", async () => {
              const label = window.prompt("Optional label for pinned server:", "") ?? "";
              await PinnedServers.pin({ jobId: b.dataset.brPin, placeId, label });
              this.toast("Server pinned.", "success");
            });
          });
          out.querySelectorAll("[data-br-join]").forEach((b) => {
            b.addEventListener("click", async () => {
              const accId = body.querySelector("#j-account").value;
              try {
                await Launcher.join(placeId, b.dataset.brJoin, accId);
                this.toast("Joining selected server...", "success");
              } catch (err) {
                this.toast(err.message, "error");
              }
            });
          });
        } catch (err) {
          out.innerHTML = `<div class="rtk-alert">${Utils.escapeHtml(err.message)}</div>`;
        } finally {
          e.currentTarget.disabled = false;
        }
      });

      body.querySelector("#j-clear-recent")?.addEventListener("click", () => {
        Store.set(STORAGE_KEYS.RECENT_SERVERS, []);
        this.renderJoinerTab(body);
      });

      body.querySelector("#j-clear-recent-players")?.addEventListener("click", () => {
        RecentPlayersTracker.clear();
        this.renderJoinerTab(body);
      });

      body.querySelectorAll("[data-rp-lookup]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.openExplore({ mode: "user", query: btn.dataset.rpLookup });
        });
      });

      body.querySelectorAll("[data-unpin-job]").forEach((btn) => {
        btn.addEventListener("click", () => {
          PinnedServers.unpin(btn.dataset.unpinJob);
          this.renderJoinerTab(body);
        });
      });

      body.querySelectorAll("[data-pin-recent-job]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const label = window.prompt("Optional label for pinned server:", "") ?? "";
          try {
            await PinnedServers.pin({
              jobId: btn.dataset.pinRecentJob,
              placeId: btn.dataset.pinRecentPlace,
              gameName: btn.dataset.pinRecentName,
              label,
            });
            this.toast("Pinned server.", "success");
            this.renderJoinerTab(body);
          } catch (err) {
            this.toast(err.message, "error");
          }
        });
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

    /* ---------------- TAB 3: EXPLORER (SUBPLACES, PASSES, BADGES & USER/RAP/BANNED LOOKUP) ---------------- */
    async renderExploreTab(body) {
      const ctx = DevTools.detectUrlContext();
      if (!this.explorePlaceQuery) {
        this.explorePlaceQuery = Utils.getPlaceIdFromPage() || PlaytimeTracker.getData().activeSession?.placeId || "";
      }
      if (!this.exploreUserQuery && ctx.type === "user" && ctx.id) {
        this.exploreUserQuery = String(ctx.id);
      }
      if (!this.exploreGroupQuery && ctx.type === "group" && ctx.id) {
        this.exploreGroupQuery = String(ctx.id);
      }

      body.innerHTML = `
        <div class="rtk-seg-bar">
          <button class="rtk-seg-btn ${this.exploreMode === "experience" ? "active" : ""}" data-exp-mode="experience">Experience</button>
          <button class="rtk-seg-btn ${this.exploreMode === "user" ? "active" : ""}" data-exp-mode="user">User & RAP</button>
          <button class="rtk-seg-btn ${this.exploreMode === "group" ? "active" : ""}" data-exp-mode="group">Group & Roles</button>
        </div>
        <div id="exp-content" class="rtk-col"></div>
      `;

      body.querySelectorAll("[data-exp-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.exploreMode = btn.dataset.expMode;
          this.renderExploreTab(body);
        });
      });

      const content = body.querySelector("#exp-content");
      if (this.exploreMode === "experience") {
        await this.renderExploreExperience(content);
      } else if (this.exploreMode === "group") {
        await this.renderExploreGroup(content);
      } else {
        await this.renderExploreUser(content);
      }
    },

    async renderExploreExperience(container) {
      const renderPlaylistCard = () => {
        const pinnedGames = PlaylistManager.getAll();
        return `
          <div class="rtk-card rtk-col" id="exp-playlist-card">
            <div class="rtk-card-title">
              <span>Pinned Experiences & Playlists (${pinnedGames.length})</span>
            </div>
            <div class="rtk-row">
              <input class="rtk-input rtk-flex-1" id="exp-pin-folder" placeholder="Folder (e.g. Favorites, Grinding, Trading)" value="Favorites" />
              <button class="rtk-btn" id="exp-pin-cur-btn">${Icons.pin}<span>Pin Inspected Game</span></button>
            </div>
            ${pinnedGames.length === 0
              ? `<div class="rtk-muted">Bookmark experiences into custom folders for 1-click Play or Server Hop from here and the Home page.</div>`
              : pinnedGames.map((g) => `
                <div class="rtk-acc-item">
                  ${g.iconUrl ? `<img class="rtk-game-thumb" src="${Utils.escapeHtml(g.iconUrl)}" alt="" />` : ""}
                  <div class="rtk-flex-1">
                    <div class="rtk-row" style="gap:6px;">
                      <strong class="rtk-ellipsis">${Utils.escapeHtml(g.name)}</strong>
                      <span class="rtk-badge">${Utils.escapeHtml(g.folder)}</span>
                    </div>
                    <div class="rtk-muted">Place ${Utils.escapeHtml(g.placeId)}</div>
                  </div>
                  <button class="rtk-btn rtk-btn-sm" data-pl-inspect="${Utils.escapeHtml(g.placeId)}" title="Inspect">${Icons.search}</button>
                  <button class="rtk-btn rtk-btn-sm" data-pl-hop="${Utils.escapeHtml(g.placeId)}" title="Server Hop">${Icons.shuffle}</button>
                  <button class="rtk-btn rtk-btn-sm rtk-btn-danger" data-pl-unpin="${Utils.escapeHtml(g.placeId)}" title="Unpin">✕</button>
                  <button class="rtk-btn rtk-btn-sm rtk-btn-growth" data-pl-play="${Utils.escapeHtml(g.placeId)}">${Icons.play}</button>
                </div>
              `).join("")}
          </div>
        `;
      };

      container.innerHTML = `
        <div class="rtk-card rtk-col">
          <div class="rtk-card-title"><span>Inspect Experience & Universe</span></div>
          <div class="rtk-row">
            <input class="rtk-input rtk-flex-1" id="exp-place-input" placeholder="Place ID (e.g. 920587237)" value="${Utils.escapeHtml(this.explorePlaceQuery)}" />
            <button class="rtk-btn rtk-btn-cta" id="exp-place-go">${Icons.search}<span>Inspect</span></button>
          </div>
        </div>
        <div id="exp-playlist-wrap">${renderPlaylistCard()}</div>
        <div id="exp-place-result" class="rtk-col"></div>
      `;

      const out = container.querySelector("#exp-place-result");
      const inp = container.querySelector("#exp-place-input");
      const plWrap = container.querySelector("#exp-playlist-wrap");

      const bindPlaylistHandlers = () => {
        plWrap.querySelector("#exp-pin-cur-btn")?.addEventListener("click", async () => {
          const pId = inp.value.trim() || Utils.getPlaceIdFromPage();
          if (!pId) return this.toast("Enter a Place ID above first.", "error");
          const folder = plWrap.querySelector("#exp-pin-folder")?.value.trim() || "Favorites";
          try {
            const g = await PlaylistManager.pinGame({ placeId: pId, folder });
            this.toast(`Pinned ${g.name} to ${g.folder}.`, "success");
            plWrap.innerHTML = renderPlaylistCard();
            bindPlaylistHandlers();
          } catch (err) {
            this.toast(err.message, "error");
          }
        });
        plWrap.querySelectorAll("[data-pl-inspect]").forEach((b) => {
          b.addEventListener("click", () => {
            inp.value = b.dataset.plInspect;
            loadExp(false);
          });
        });
        plWrap.querySelectorAll("[data-pl-hop]").forEach((b) => {
          b.addEventListener("click", async () => {
            try {
              await Launcher.serverHop(b.dataset.plHop, "current");
              this.toast("Server hopping...", "success");
            } catch (err) {
              this.toast(err.message, "error");
            }
          });
        });
        plWrap.querySelectorAll("[data-pl-unpin]").forEach((b) => {
          b.addEventListener("click", () => {
            PlaylistManager.unpinGame(b.dataset.plUnpin);
            plWrap.innerHTML = renderPlaylistCard();
            bindPlaylistHandlers();
          });
        });
        plWrap.querySelectorAll("[data-pl-play]").forEach((b) => {
          b.addEventListener("click", async () => {
            try {
              await Launcher.join(b.dataset.plPlay, null, "current");
              this.toast("Launching experience...", "success");
            } catch (err) {
              this.toast(err.message, "error");
            }
          });
        });
      };

      bindPlaylistHandlers();

      const loadExp = async (force = false) => {
        const pId = inp.value.trim();
        if (!pId) {
          out.innerHTML = `<div class="rtk-card"><div class="rtk-muted">Open any experience page or enter a Place ID above to inspect subplaces, hidden places, GamePasses, badges, and exact like ratios.</div></div>`;
          return;
        }
        this.explorePlaceQuery = pId;
        out.innerHTML = `<div class="rtk-card"><div class="rtk-muted">Loading Universe metadata, subplaces, passes, and badges...</div></div>`;
        try {
          const data = await ExplorerEngine.inspectExperience(pId, force);
          const m = data.meta;
          const ownedBadgesCount = data.badges.filter((b) => b.awardedDate).length;
          out.innerHTML = `
            <div class="rtk-card rtk-col">
              <div class="rtk-row" style="align-items:flex-start;">
                ${m.iconUrl ? `<img class="rtk-game-thumb" style="width:56px;height:56px;" src="${Utils.escapeHtml(m.iconUrl)}" alt="" />` : ""}
                <div class="rtk-flex-1">
                  <div style="font-weight:700;font-size:15px;">${Utils.escapeHtml(m.name || `Place ${pId}`)}</div>
                  <div class="rtk-muted">By ${Utils.escapeHtml(m.creator?.name || "Unknown")} ${m.creator?.hasVerifiedBadge ? "✓" : ""} · Max ${Utils.escapeHtml(m.maxPlayers || "?")} players</div>
                  <div class="rtk-row" style="margin-top:6px;flex-wrap:wrap;">
                    <button class="rtk-btn rtk-btn-sm" data-exp-copy="${Utils.escapeHtml(data.universeId)}">${Icons.copy}<span>Universe ${Utils.escapeHtml(data.universeId)}</span></button>
                    <button class="rtk-btn rtk-btn-sm" data-exp-copy="${Utils.escapeHtml(m.rootPlaceId || pId)}">${Icons.copy}<span>Root ${Utils.escapeHtml(m.rootPlaceId || pId)}</span></button>
                  </div>
                </div>
              </div>
              <div class="rtk-grid-2" style="margin-top:4px;">
                <div class="rtk-stat-box">
                  <span class="rtk-muted">Like Ratio</span>
                  <span class="rtk-stat-val">${data.likeRatio !== null ? `${data.likeRatio}%` : "—"} <span class="rtk-muted" style="font-weight:400;">(${Utils.formatCompact(data.upVotes)} / ${Utils.formatCompact(data.downVotes)})</span></span>
                </div>
                <div class="rtk-stat-box">
                  <span class="rtk-muted">Active Players</span>
                  <span class="rtk-stat-val">${Utils.formatNumber(m.playing ?? 0)}</span>
                </div>
                <div class="rtk-stat-box">
                  <span class="rtk-muted">Total Visits</span>
                  <span class="rtk-stat-val">${Utils.formatCompact(m.visits ?? 0)}</span>
                </div>
                <div class="rtk-stat-box">
                  <span class="rtk-muted">Created / Updated</span>
                  <span class="rtk-stat-val" style="font-size:12px;">${Utils.formatDateShort(m.created)} · ${Utils.formatDateShort(m.updated)}</span>
                </div>
              </div>
            </div>

            <div class="rtk-seg-bar">
              <button class="rtk-seg-btn ${this.exploreExpSubtab === "places" ? "active" : ""}" data-sub="places">Subplaces (${data.places.length})</button>
              <button class="rtk-seg-btn ${this.exploreExpSubtab === "passes" ? "active" : ""}" data-sub="passes">Passes (${data.passes.length})</button>
              <button class="rtk-seg-btn ${this.exploreExpSubtab === "badges" ? "active" : ""}" data-sub="badges">Badges (${ownedBadgesCount}/${data.badges.length})</button>
            </div>

            <div class="rtk-card rtk-col" id="exp-sub-panel"></div>
          `;

          const renderSub = () => {
            const subEl = out.querySelector("#exp-sub-panel");
            if (!subEl) return;
            if (this.exploreExpSubtab === "places") {
              subEl.innerHTML = data.places.length === 0
                ? `<div class="rtk-muted">No places returned by Universe API.</div>`
                : data.places.map((pl) => {
                    const isRoot = String(pl.id) === String(m.rootPlaceId);
                    return `
                      <div class="rtk-acc-item">
                        <div class="rtk-flex-1">
                          <div class="rtk-row" style="gap:6px;">
                            <strong class="rtk-ellipsis">${Utils.escapeHtml(pl.name || `Place ${pl.id}`)}</strong>
                            <span class="rtk-badge ${isRoot ? "rtk-badge-live" : ""}">${isRoot ? "ROOT" : "SUBPLACE"}</span>
                          </div>
                          <div class="rtk-muted">Place ID: ${Utils.escapeHtml(pl.id)}</div>
                        </div>
                        <button class="rtk-btn rtk-btn-sm" data-exp-copy="${Utils.escapeHtml(pl.id)}">${Icons.copy}</button>
                        <a class="rtk-btn rtk-btn-sm" href="https://www.roblox.com/games/${encodeURIComponent(pl.id)}/-" target="_blank" rel="noopener" style="text-decoration:none;">Page</a>
                        <button class="rtk-btn rtk-btn-sm rtk-btn-growth" data-exp-join="${Utils.escapeHtml(pl.id)}">${Icons.play}<span>Join</span></button>
                      </div>
                    `;
                  }).join("");
            } else if (this.exploreExpSubtab === "passes") {
              subEl.innerHTML = `
                ${data.passes.length > 0 ? `<div class="rtk-muted">Total Storefront Value: <b>R$ ${Utils.formatNumber(data.totalPassRobux)}</b>${Utils.escapeHtml(SiteQoL.formatFiat(data.totalPassRobux))}</div>` : ""}
                ${data.passes.length === 0
                  ? `<div class="rtk-muted">No public GamePasses found for this experience.</div>`
                  : data.passes.map((gp) => `
                    <div class="rtk-acc-item">
                      <div class="rtk-flex-1">
                        <div style="font-weight:700;" class="rtk-ellipsis">${Utils.escapeHtml(gp.name)}</div>
                        <div class="rtk-muted">${gp.price != null ? `R$ ${Utils.formatNumber(gp.price)}${Utils.escapeHtml(SiteQoL.formatFiat(gp.price))}` : "Off-sale"} · ID ${Utils.escapeHtml(gp.id)}</div>
                      </div>
                      <button class="rtk-btn rtk-btn-sm" data-exp-copy="${Utils.escapeHtml(gp.id)}">${Icons.copy}</button>
                      <a class="rtk-btn rtk-btn-sm" href="https://www.roblox.com/game-pass/${encodeURIComponent(gp.id)}/-" target="_blank" rel="noopener" style="text-decoration:none;">Open</a>
                    </div>
                  `).join("")}
              `;
            } else {
              const filteredBadges = this.exploreUnownedBadgesOnly
                ? data.badges.filter((bg) => !bg.awardedDate)
                : data.badges;
              subEl.innerHTML = `
                <div class="rtk-row" style="justify-content:space-between;">
                  <span class="rtk-muted">Unlocked <b>${ownedBadgesCount}</b> of <b>${data.badges.length}</b> badges</span>
                  <button class="rtk-btn rtk-btn-sm" id="exp-badge-filter-btn">${this.exploreUnownedBadgesOnly ? "Showing: Unowned Only" : "Filter: Show Unowned Only"}</button>
                </div>
                ${filteredBadges.length === 0
                  ? `<div class="rtk-muted">No badges match the current filter.</div>`
                  : filteredBadges.map((bg) => {
                      const rarity = ((bg.statistics?.winRatePercentage || 0) * 100).toFixed(1);
                      return `
                        <div class="rtk-acc-item ${bg.awardedDate ? "current" : ""}">
                          <div class="rtk-flex-1">
                            <div class="rtk-row" style="gap:6px;">
                              <strong class="rtk-ellipsis">${Utils.escapeHtml(bg.name)}</strong>
                              ${bg.awardedDate ? `<span class="rtk-badge rtk-badge-live">✓ ${Utils.formatDateShort(bg.awardedDate)}</span>` : `<span class="rtk-badge">Locked</span>`}
                            </div>
                            <div class="rtk-muted">${rarity}% rarity · ${Utils.formatCompact(bg.statistics?.awardedCount || 0)} won · ID ${Utils.escapeHtml(bg.id)}</div>
                          </div>
                          <button class="rtk-btn rtk-btn-sm" data-exp-copy="${Utils.escapeHtml(bg.id)}">${Icons.copy}</button>
                        </div>
                      `;
                    }).join("")}
              `;
              subEl.querySelector("#exp-badge-filter-btn")?.addEventListener("click", () => {
                this.exploreUnownedBadgesOnly = !this.exploreUnownedBadgesOnly;
                renderSub();
              });
            }

            subEl.querySelectorAll("[data-exp-copy]").forEach((b) => {
              b.addEventListener("click", async () => {
                await Utils.copyText(b.dataset.expCopy);
                this.toast(`Copied ID: ${b.dataset.expCopy}`, "success");
              });
            });
            subEl.querySelectorAll("[data-exp-join]").forEach((b) => {
              b.addEventListener("click", async () => {
                try {
                  await Launcher.join(b.dataset.expJoin, null, "current");
                  this.toast("Launching place...", "success");
                } catch (err) {
                  this.toast(err.message, "error");
                }
              });
            });
          };

          renderSub();

          out.querySelectorAll("[data-exp-copy]").forEach((b) => {
            b.addEventListener("click", async () => {
              await Utils.copyText(b.dataset.expCopy);
              this.toast(`Copied: ${b.dataset.expCopy}`, "success");
            });
          });
          out.querySelectorAll("[data-sub]").forEach((b) => {
            b.addEventListener("click", () => {
              this.exploreExpSubtab = b.dataset.sub;
              out.querySelectorAll("[data-sub]").forEach((x) => x.classList.toggle("active", x.dataset.sub === this.exploreExpSubtab));
              renderSub();
            });
          });
        } catch (err) {
          out.innerHTML = `<div class="rtk-alert">${Utils.escapeHtml(err.message)}</div>`;
        }
      };

      container.querySelector("#exp-place-go").addEventListener("click", () => loadExp(true));
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          loadExp(true);
        }
      });

      loadExp(false);
    },

    async renderExploreUser(container) {
      container.innerHTML = `
        <div class="rtk-card rtk-col">
          <div class="rtk-card-title"><span>User, Rolimon's Value, RAP & Outfits Lookup</span></div>
          <div class="rtk-row">
            <input class="rtk-input rtk-flex-1" id="exp-user-input" placeholder="Username or User ID (works on banned accounts)" value="${Utils.escapeHtml(this.exploreUserQuery)}" />
            <button class="rtk-btn rtk-btn-cta" id="exp-user-go">${Icons.search}<span>Lookup</span></button>
          </div>
        </div>
        <div id="exp-user-result" class="rtk-col"></div>
      `;

      const out = container.querySelector("#exp-user-result");
      const inp = container.querySelector("#exp-user-input");

      const loadUser = async (force = false) => {
        const q = inp.value.trim();
        if (!q) {
          out.innerHTML = `<div class="rtk-card"><div class="rtk-muted">Search any Roblox username or User ID to view join date, past usernames, Collectible RAP, Rolimon's Value, worn asset cost, saved outfits, and terminated/banned account profiles.</div></div>`;
          return;
        }
        this.exploreUserQuery = q;
        out.innerHTML = `<div class="rtk-card"><div class="rtk-muted">Looking up user profile, Rolimon's values, RAP, history, and outfits...</div></div>`;
        try {
          const u = await ExplorerEngine.inspectUser(q, force);
          const p = u.profile;
          const presType = u.presence?.userPresenceType || 0;
          const presLabel = presType === 2 ? `Playing ${u.presence.lastLocation || "In-Game"}` : presType === 3 ? "In Studio" : presType === 1 ? "Online" : "Offline";
          const years = (u.accountAgeDays / 365.25).toFixed(1);
          const totalRolimonsVal = u.collectibles.totalValue || u.collectibles.totalRap || 0;

          out.innerHTML = `
            <div class="rtk-card rtk-col">
              <div class="rtk-row" style="align-items:flex-start;">
                <img class="rtk-avatar" style="width:54px;height:54px;" src="${Utils.escapeHtml(u.avatarUrl || "https://www.roblox.com/favicon.ico")}" alt="" />
                <div class="rtk-flex-1">
                  <div class="rtk-row" style="gap:6px;flex-wrap:wrap;">
                    <strong style="font-size:15px;">${Utils.escapeHtml(p.displayName || p.name)}</strong>
                    ${p.hasVerifiedBadge ? `<span class="rtk-badge rtk-badge-live">Verified</span>` : ""}
                    ${p.isBanned ? `<span class="rtk-badge rtk-badge-danger">BANNED / TERMINATED</span>` : `<span class="rtk-badge ${presType === 2 ? "rtk-badge-live" : ""}">${Utils.escapeHtml(presLabel)}</span>`}
                  </div>
                  <div class="rtk-muted">@${Utils.escapeHtml(p.name)} · ID ${Utils.escapeHtml(p.id)}</div>
                  <div class="rtk-row" style="margin-top:6px;flex-wrap:wrap;">
                    <button class="rtk-btn rtk-btn-sm" id="exp-u-copy-id">${Icons.copy}<span>Copy ID</span></button>
                    ${!p.isBanned ? `<a class="rtk-btn rtk-btn-sm" href="https://www.roblox.com/users/${encodeURIComponent(p.id)}/profile" target="_blank" rel="noopener" style="text-decoration:none;">Profile</a>` : ""}
                    ${u.fullBodyThumb ? `<a class="rtk-btn rtk-btn-sm" href="${Utils.escapeHtml(u.fullBodyThumb)}" target="_blank" rel="noopener" style="text-decoration:none;">420×420 PNG</a>` : ""}
                    ${u.presence?.placeId && u.presence?.gameId ? `<button class="rtk-btn rtk-btn-sm rtk-btn-growth" id="exp-u-join">${Icons.play}<span>Join Server</span></button>` : ""}
                  </div>
                </div>
              </div>

              ${p.description ? `<div class="rtk-code" style="max-height:90px;white-space:pre-wrap;font-family:inherit;">${Utils.escapeHtml(p.description)}</div>` : ""}

              <div class="rtk-grid-2">
                <div class="rtk-stat-box">
                  <span class="rtk-muted">Created</span>
                  <span class="rtk-stat-val" style="font-size:13px;">${Utils.formatDateShort(p.created)} <span class="rtk-muted" style="font-weight:400;">(${years}y)</span></span>
                </div>
                <div class="rtk-stat-box">
                  <span class="rtk-muted">RAP / Rolimon's Value</span>
                  <span class="rtk-stat-val" style="font-size:12.5px;">${u.collectibles.privateInventory ? "Private" : `R$ ${Utils.formatCompact(u.collectibles.totalRap)} / Val R$ ${Utils.formatCompact(totalRolimonsVal)}`}</span>
                </div>
                <div class="rtk-stat-box">
                  <span class="rtk-muted">Social</span>
                  <span class="rtk-stat-val" style="font-size:13px;">${Utils.formatCompact(u.social.friends ?? 0)} Fr · ${Utils.formatCompact(u.social.followers ?? 0)} Fol</span>
                </div>
                <div class="rtk-stat-box">
                  <span class="rtk-muted">Wearing / Outfits</span>
                  <span class="rtk-stat-val" style="font-size:13px;">${u.wearingIds.length} Worn · ${(u.outfits || []).length} Outfits</span>
                </div>
              </div>
            </div>

            ${u.pastNames.length > 0 ? `
              <div class="rtk-card rtk-col">
                <div class="rtk-card-title"><span>Past Usernames (${u.pastNames.length})</span></div>
                <div class="rtk-row" style="flex-wrap:wrap;gap:6px;">
                  ${u.pastNames.slice(0, 25).map((nm) => `<span class="rtk-badge">${Utils.escapeHtml(nm)}</span>`).join("")}
                </div>
              </div>
            ` : ""}

            ${!u.collectibles.privateInventory && u.collectibles.items.length > 0 ? `
              <div class="rtk-card rtk-col">
                <div class="rtk-card-title">
                  <span>Limited Collectibles (${u.collectibles.items.length})</span>
                  <span class="rtk-badge">Rolimon's Enriched</span>
                </div>
                ${u.collectibles.items.slice(0, 20).map((it) => `
                  <div class="rtk-acc-item">
                    <div class="rtk-flex-1">
                      <div class="rtk-row" style="gap:6px;flex-wrap:wrap;">
                        <strong class="rtk-ellipsis">${Utils.escapeHtml(it.name)}</strong>
                        ${it.rolimons?.acronym ? `<span class="rtk-badge">${Utils.escapeHtml(it.rolimons.acronym)}</span>` : ""}
                        ${it.rolimons?.projected ? `<span class="rtk-badge rtk-badge-warn">PROJ</span>` : ""}
                        ${it.rolimons?.rare ? `<span class="rtk-badge rtk-badge-live">RARE</span>` : ""}
                      </div>
                      <div class="rtk-muted">RAP: R$ ${Utils.formatNumber(it.recentAveragePrice || 0)}${it.rolimons ? ` · Value: R$ ${Utils.formatNumber(it.rolimons.value)} · Demand: ${Utils.escapeHtml(it.rolimons.demandLabel)}` : ""}${it.serialNumber ? ` · #${it.serialNumber}` : ""}</div>
                    </div>
                    <a class="rtk-btn rtk-btn-sm" href="https://www.roblox.com/catalog/${encodeURIComponent(it.assetId)}/-" target="_blank" rel="noopener" style="text-decoration:none;">Item</a>
                  </div>
                `).join("")}
              </div>
            ` : ""}

            ${u.wearingIds.length > 0 ? `
              <div class="rtk-card rtk-col">
                <div class="rtk-card-title">
                  <span>Currently Wearing (${u.wearingIds.length})</span>
                  <div class="rtk-row">
                    <button class="rtk-btn rtk-btn-sm" id="exp-u-calc-cost">${Icons.dollar}<span>Outfit Cost</span></button>
                    <button class="rtk-btn rtk-btn-sm rtk-btn-cta" id="exp-u-wear-outfit" title="Apply these worn assets to your active account">Wear Outfit</button>
                  </div>
                </div>
                <div id="exp-u-cost-out" class="rtk-muted" style="display:none;"></div>
                ${u.wearingIds.map((aid) => `
                  <div class="rtk-acc-item">
                    <div class="rtk-flex-1">
                      <strong>Asset ${Utils.escapeHtml(aid)}</strong>
                    </div>
                    <button class="rtk-btn rtk-btn-sm" data-wear-copy="${Utils.escapeHtml(aid)}">${Icons.copy}</button>
                    <button class="rtk-btn rtk-btn-sm" data-wear-dev="${Utils.escapeHtml(aid)}">Extract</button>
                    <a class="rtk-btn rtk-btn-sm" href="https://www.roblox.com/catalog/${encodeURIComponent(aid)}/-" target="_blank" rel="noopener" style="text-decoration:none;">Catalog</a>
                  </div>
                `).join("")}
              </div>
            ` : ""}

            ${(u.outfits || []).length > 0 ? `
              <div class="rtk-card rtk-col">
                <div class="rtk-card-title"><span>Saved User Outfits (${u.outfits.length})</span></div>
                ${u.outfits.slice(0, 15).map((of) => `
                  <div class="rtk-acc-item">
                    <div class="rtk-flex-1">
                      <strong>${Utils.escapeHtml(of.name || `Outfit ${of.id}`)}</strong>
                      <div class="rtk-muted">Outfit ID: ${Utils.escapeHtml(of.id)}</div>
                    </div>
                    <button class="rtk-btn rtk-btn-sm" data-outfit-wear="${Utils.escapeHtml(of.id)}">Wear</button>
                  </div>
                `).join("")}
              </div>
            ` : ""}

            ${(u.createdGames || []).length > 0 ? `
              <div class="rtk-card rtk-col">
                <div class="rtk-card-title"><span>Created Experiences (${u.createdGames.length})</span></div>
                ${u.createdGames.slice(0, 10).map((cg) => {
                  const rPlace = cg.rootPlace?.id || "";
                  return `
                    <div class="rtk-acc-item">
                      <div class="rtk-flex-1">
                        <strong class="rtk-ellipsis">${Utils.escapeHtml(cg.name || `Universe ${cg.id}`)}</strong>
                        <div class="rtk-muted">Visits: ${Utils.formatCompact(cg.placeVisits || 0)}${rPlace ? ` · Place ${Utils.escapeHtml(rPlace)}` : ""}</div>
                      </div>
                      ${rPlace ? `<button class="rtk-btn rtk-btn-sm" data-cg-inspect="${Utils.escapeHtml(rPlace)}">Inspect</button>` : ""}
                      ${rPlace ? `<button class="rtk-btn rtk-btn-sm rtk-btn-growth" data-cg-play="${Utils.escapeHtml(rPlace)}">Join</button>` : ""}
                    </div>
                  `;
                }).join("")}
              </div>
            ` : ""}

            ${(u.groupsRoles || []).length > 0 ? `
              <div class="rtk-card rtk-col">
                <div class="rtk-card-title"><span>User Groups & Ranks (${u.groupsRoles.length})</span></div>
                ${u.groupsRoles.slice(0, 15).map((gr) => `
                  <div class="rtk-acc-item">
                    <div class="rtk-flex-1">
                      <div class="rtk-row" style="gap:6px;">
                        <strong class="rtk-ellipsis">${Utils.escapeHtml(gr.group?.name || "Group")}</strong>
                        <span class="rtk-badge">${Utils.escapeHtml(gr.role?.name || "Member")} (${Utils.escapeHtml(gr.role?.rank ?? "?")})</span>
                      </div>
                      <div class="rtk-muted">${Utils.formatCompact(gr.group?.memberCount || 0)} members · Group ID ${Utils.escapeHtml(gr.group?.id)}</div>
                    </div>
                    <button class="rtk-btn rtk-btn-sm" data-grp-inspect="${Utils.escapeHtml(gr.group?.id)}">Inspect</button>
                  </div>
                `).join("")}
              </div>
            ` : ""}
          `;

          out.querySelector("#exp-u-copy-id")?.addEventListener("click", async () => {
            await Utils.copyText(p.id);
            this.toast(`Copied User ID: ${p.id}`, "success");
          });
          out.querySelector("#exp-u-join")?.addEventListener("click", async () => {
            try {
              await Launcher.join(u.presence.placeId, u.presence.gameId, "current");
              this.toast(`Joining @${p.name}...`, "success");
            } catch (err) {
              this.toast(err.message, "error");
            }
          });
          out.querySelector("#exp-u-calc-cost")?.addEventListener("click", async (e) => {
            const costOut = out.querySelector("#exp-u-cost-out");
            e.currentTarget.disabled = true;
            costOut.style.display = "block";
            costOut.textContent = "Calculating catalog prices of worn items...";
            try {
              const res = await AvatarQuickEngine.calculateOutfitCost(u.wearingIds);
              costOut.innerHTML = `Total Worn Outfit Cost: <b>R$ ${Utils.formatNumber(res.totalRobux)}</b>${Utils.escapeHtml(SiteQoL.formatFiat(res.totalRobux))} across ${res.items.length} catalog items.`;
            } catch (err) {
              costOut.textContent = `Could not calculate cost: ${err.message}`;
            } finally {
              e.currentTarget.disabled = false;
            }
          });
          out.querySelector("#exp-u-wear-outfit")?.addEventListener("click", async (e) => {
            e.currentTarget.disabled = true;
            try {
              await RobloxAPI.setWearingAssets(u.wearingIds);
              this.toast(`Applied @${p.name}'s worn assets (owned items equipped).`, "success");
            } catch (err) {
              this.toast(`Could not equip outfit: ${err.message}`, "error");
            } finally {
              e.currentTarget.disabled = false;
            }
          });
          out.querySelectorAll("[data-outfit-wear]").forEach((b) => {
            b.addEventListener("click", async () => {
              b.disabled = true;
              try {
                const det = await RobloxAPI.getOutfitDetails(b.dataset.outfitWear);
                const assetIds = (det?.assets || []).map((a) => a.id).filter(Boolean);
                if (!assetIds.length) throw new Error("No assets found in outfit.");
                await RobloxAPI.setWearingAssets(assetIds);
                this.toast(`Equipped outfit "${det.name || b.dataset.outfitWear}".`, "success");
              } catch (err) {
                this.toast(err.message, "error");
              } finally {
                b.disabled = false;
              }
            });
          });
          out.querySelectorAll("[data-wear-copy]").forEach((b) => {
            b.addEventListener("click", async () => {
              await Utils.copyText(b.dataset.wearCopy);
              this.toast(`Copied Asset ID: ${b.dataset.wearCopy}`, "success");
            });
          });
          out.querySelectorAll("[data-wear-dev]").forEach((b) => {
            b.addEventListener("click", () => this.openDevAsset(b.dataset.wearDev));
          });
          out.querySelectorAll("[data-cg-inspect]").forEach((b) => {
            b.addEventListener("click", () => this.openExplore({ mode: "experience", query: b.dataset.cgInspect }));
          });
          out.querySelectorAll("[data-cg-play]").forEach((b) => {
            b.addEventListener("click", async () => {
              try {
                await Launcher.join(b.dataset.cgPlay, null, "current");
                this.toast("Launching experience...", "success");
              } catch (err) {
                this.toast(err.message, "error");
              }
            });
          });
          out.querySelectorAll("[data-grp-inspect]").forEach((b) => {
            b.addEventListener("click", () => this.openExplore({ mode: "group", query: b.dataset.grpInspect }));
          });
        } catch (err) {
          out.innerHTML = `<div class="rtk-alert">${Utils.escapeHtml(err.message)}</div>`;
        }
      };

      container.querySelector("#exp-user-go").addEventListener("click", () => loadUser(true));
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          loadUser(true);
        }
      });

      loadUser(false);
    },

    async renderExploreGroup(container) {
      container.innerHTML = `
        <div class="rtk-card rtk-col">
          <div class="rtk-card-title"><span>Group, Roles, Shout & Group Games Inspector</span></div>
          <div class="rtk-row">
            <input class="rtk-input rtk-flex-1" id="exp-group-input" placeholder="Group ID (e.g. 7, 1200769)" value="${Utils.escapeHtml(this.exploreGroupQuery)}" />
            <button class="rtk-btn rtk-btn-cta" id="exp-group-go">${Icons.search}<span>Inspect</span></button>
          </div>
        </div>
        <div id="exp-group-result" class="rtk-col"></div>
      `;

      const out = container.querySelector("#exp-group-result");
      const inp = container.querySelector("#exp-group-input");

      const loadGroup = async (force = false) => {
        const q = inp.value.trim();
        if (!q) {
          out.innerHTML = `<div class="rtk-card"><div class="rtk-muted">Enter any Roblox Group ID above (or click a group from User Lookup) to inspect group roles, member counts per rank, shout, and group-owned experiences.</div></div>`;
          return;
        }
        this.exploreGroupQuery = q;
        out.innerHTML = `<div class="rtk-card"><div class="rtk-muted">Loading group details, rank hierarchy, and group experiences...</div></div>`;
        try {
          const g = await ExplorerEngine.inspectGroup(q, force);
          const d = g.details;
          out.innerHTML = `
            <div class="rtk-card rtk-col">
              <div class="rtk-row" style="justify-content:space-between;align-items:flex-start;">
                <div class="rtk-flex-1">
                  <div class="rtk-row" style="gap:6px;flex-wrap:wrap;">
                    <strong style="font-size:15px;">${Utils.escapeHtml(d.name)}</strong>
                    ${d.hasVerifiedBadge ? `<span class="rtk-badge rtk-badge-live">Verified</span>` : ""}
                    <span class="rtk-badge">${d.publicEntryAllowed ? "Public Join" : "Manual Approval"}</span>
                  </div>
                  <div class="rtk-muted">Group ID ${Utils.escapeHtml(d.id)} · Owner: ${d.owner ? `@${Utils.escapeHtml(d.owner.username || d.owner.displayName)}` : "None / No Owner"}</div>
                </div>
                <a class="rtk-btn rtk-btn-sm" href="https://www.roblox.com/communities/${encodeURIComponent(d.id)}/-" target="_blank" rel="noopener" style="text-decoration:none;">Open</a>
              </div>
              <div class="rtk-grid-2">
                <div class="rtk-stat-box">
                  <span class="rtk-muted">Total Members</span>
                  <span class="rtk-stat-val">${Utils.formatNumber(d.memberCount ?? 0)}</span>
                </div>
                <div class="rtk-stat-box">
                  <span class="rtk-muted">Roles / Experiences</span>
                  <span class="rtk-stat-val">${g.roles.length} Roles · ${g.games.length} Games</span>
                </div>
              </div>
              ${d.shout && d.shout.body ? `
                <div class="rtk-col">
                  <span class="rtk-label">Current Group Shout (@${Utils.escapeHtml(d.shout.poster?.username || "Poster")}):</span>
                  <div class="rtk-code" style="white-space:pre-wrap;font-family:inherit;">${Utils.escapeHtml(d.shout.body)}</div>
                </div>
              ` : ""}
            </div>

            ${g.games.length > 0 ? `
              <div class="rtk-card rtk-col">
                <div class="rtk-card-title"><span>Group Experiences (${g.games.length})</span></div>
                ${g.games.map((gm) => {
                  const rPlace = gm.rootPlace?.id || "";
                  return `
                    <div class="rtk-acc-item">
                      <div class="rtk-flex-1">
                        <strong class="rtk-ellipsis">${Utils.escapeHtml(gm.name)}</strong>
                        <div class="rtk-muted">Visits: ${Utils.formatCompact(gm.placeVisits || 0)}${rPlace ? ` · Place ${Utils.escapeHtml(rPlace)}` : ""}</div>
                      </div>
                      ${rPlace ? `<button class="rtk-btn rtk-btn-sm" data-gg-inspect="${Utils.escapeHtml(rPlace)}">Inspect</button>` : ""}
                      ${rPlace ? `<button class="rtk-btn rtk-btn-sm rtk-btn-growth" data-gg-play="${Utils.escapeHtml(rPlace)}">Join</button>` : ""}
                    </div>
                  `;
                }).join("")}
              </div>
            ` : ""}

            <div class="rtk-card rtk-col">
              <div class="rtk-card-title"><span>Roles & Rank Hierarchy (${g.roles.length})</span></div>
              ${g.roles.map((r) => `
                <div class="rtk-acc-item">
                  <div class="rtk-flex-1">
                    <div class="rtk-row" style="gap:6px;">
                      <strong>${Utils.escapeHtml(r.name)}</strong>
                      <span class="rtk-badge">Rank ${Utils.escapeHtml(r.rank)}</span>
                    </div>
                    <div class="rtk-muted">${r.memberCount != null ? `${Utils.formatNumber(r.memberCount)} members` : ""} · Role ID ${Utils.escapeHtml(r.id)}</div>
                  </div>
                </div>
              `).join("")}
            </div>
          `;

          out.querySelectorAll("[data-gg-inspect]").forEach((b) => {
            b.addEventListener("click", () => this.openExplore({ mode: "experience", query: b.dataset.ggInspect }));
          });
          out.querySelectorAll("[data-gg-play]").forEach((b) => {
            b.addEventListener("click", async () => {
              try {
                await Launcher.join(b.dataset.ggPlay, null, "current");
                this.toast("Launching group experience...", "success");
              } catch (err) {
                this.toast(err.message, "error");
              }
            });
          });
        } catch (err) {
          out.innerHTML = `<div class="rtk-alert">${Utils.escapeHtml(err.message)}</div>`;
        }
      };

      container.querySelector("#exp-group-go").addEventListener("click", () => loadGroup(true));
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          loadGroup(true);
        }
      });

      loadGroup(false);
    },

    /* ---------------- TAB 2: ACCOUNT VAULT, SWITCHER & FRIENDS UNFRIEND TRACKER ---------------- */
    renderAccountsTab(body) {
      const settings = Store.getSettings();
      const cur = AccountManager.activeUser;
      const diag = AccountManager.cookieStatus;
      const q = this.accSearch.trim().toLowerCase();
      const friendSnap = cur ? FriendsTracker.getAccountSnapshot(cur.id) : null;
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
          <div class="rtk-card-title">
            <span>Multi-Account Portfolio & Ban Scanner</span>
            <button class="rtk-btn rtk-btn-sm rtk-btn-cta" id="acc-scan-portfolio">${Icons.refresh}<span>Scan All Accounts</span></button>
          </div>
          <div id="acc-portfolio-box">
            ${this.portfolioSummary ? `
              <div class="rtk-grid-2">
                <div class="rtk-stat-box">
                  <span class="rtk-muted">Combined Rolimon's Value</span>
                  <span class="rtk-stat-val">R$ ${Utils.formatNumber(this.portfolioSummary.totalRolimonsValue)}</span>
                  <span class="rtk-muted">Total RAP: R$ ${Utils.formatNumber(this.portfolioSummary.totalRap)}</span>
                </div>
                <div class="rtk-stat-box">
                  <span class="rtk-muted">Account Health (${this.portfolioSummary.accountsCount})</span>
                  <span class="rtk-stat-val" style="font-size:13px;">${this.portfolioSummary.bannedCount ? `${this.portfolioSummary.bannedCount} Banned` : "All Active ✓"}</span>
                  <span class="rtk-muted">Robux: R$ ${Utils.formatNumber(this.portfolioSummary.totalRobux)} (+${Utils.formatNumber(this.portfolioSummary.totalPending)} pend)</span>
                </div>
              </div>
            ` : `<div class="rtk-muted">Click <b>Scan All Accounts</b> to check every saved account's Collectible RAP, Rolimon's Value, termination/ban status, and live presence.</div>`}
          </div>
        </div>

        ${cur ? `
          <div class="rtk-card rtk-col">
            <div class="rtk-card-title">
              <span>Friends Activity & Unfriend Detector</span>
              <button class="rtk-btn rtk-btn-sm rtk-btn-cta" id="acc-sync-friends">${Icons.refresh}<span>Sync Friends</span></button>
            </div>
            <div id="acc-friends-live" class="rtk-col">
              ${friendSnap
                ? `<div class="rtk-muted">Last snapshot: ${Object.keys(friendSnap.friendsMap || {}).length} friends (${Utils.timeAgo(friendSnap.updatedAt)}). Click <b>Sync Friends</b> to check who is in-game or who unfriended you.</div>`
                : `<div class="rtk-muted">Take a snapshot of your friends list to detect unfriends and see live in-game friend servers.</div>`}
            </div>
            ${friendSnap && (friendSnap.history || []).length > 0 ? `
              <div class="rtk-col" style="margin-top:4px;">
                <div class="rtk-label">Recent Friend Changes (${friendSnap.history.length})</div>
                ${friendSnap.history.slice(0, 12).map((ev) => `
                  <div class="rtk-acc-item">
                    <div class="rtk-flex-1">
                      <div class="rtk-row" style="gap:6px;">
                        <strong>@${Utils.escapeHtml(ev.name)}</strong>
                        <span class="rtk-badge ${ev.type === "unfriended" ? "rtk-badge-danger" : "rtk-badge-live"}">${ev.type === "unfriended" ? "Removed / Unfriended" : "Added"}</span>
                      </div>
                      <div class="rtk-muted">${Utils.escapeHtml(ev.displayName || ev.name)} · ${Utils.timeAgo(ev.timestamp)}</div>
                    </div>
                    <button class="rtk-btn rtk-btn-sm" data-fr-lookup="${Utils.escapeHtml(ev.id)}">Profile</button>
                  </div>
                `).join("")}
              </div>
            ` : ""}
          </div>
        ` : ""}

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
                        <div class="rtk-row" style="gap:6px;flex-wrap:wrap;">
                          <strong class="rtk-ellipsis">${Utils.escapeHtml(acc.displayName || acc.username)}</strong>
                          ${acc.note ? `<span class="rtk-badge">${Utils.escapeHtml(acc.note)}</span>` : ""}
                          ${acc.isBanned ? `<span class="rtk-badge rtk-badge-danger">BANNED</span>` : ""}
                          ${acc.rolimonsValue ? `<span class="rtk-badge rtk-badge-live">Val R$ ${Utils.formatCompact(acc.rolimonsValue)}</span>` : acc.rap ? `<span class="rtk-badge">RAP R$ ${Utils.formatCompact(acc.rap)}</span>` : ""}
                        </div>
                        <div class="rtk-muted rtk-ellipsis">@${Utils.escapeHtml(acc.username)}${acc.robux != null ? ` · R$ ${Utils.formatNumber(acc.robux)}` : ""}</div>
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

      body.querySelector("#acc-scan-portfolio")?.addEventListener("click", async (e) => {
        const box = body.querySelector("#acc-portfolio-box");
        e.currentTarget.disabled = true;
        box.innerHTML = `<div class="rtk-muted">Scanning all saved accounts for Collectible RAP, Rolimon's Value, and Ban status...</div>`;
        try {
          this.portfolioSummary = await AccountManager.scanAllAccountsPortfolio();
          this.toast("Scanned all saved accounts.", "success");
          this.renderAccountsTab(body);
        } catch (err) {
          box.innerHTML = `<div class="rtk-alert">${Utils.escapeHtml(err.message)}</div>`;
          e.currentTarget.disabled = false;
        }
      });

      body.querySelector("#acc-sync-friends")?.addEventListener("click", async (e) => {
        const liveEl = body.querySelector("#acc-friends-live");
        e.currentTarget.disabled = true;
        liveEl.innerHTML = `<div class="rtk-muted">Syncing friends list & live game presences...</div>`;
        try {
          const res = await FriendsTracker.syncActiveAccountFriends();
          const inGame = res.friends.filter((f) => f.presence?.userPresenceType === 2);
          liveEl.innerHTML = `
            <div class="rtk-muted">Synced <b>${res.totalCount}</b> friends · <b>${inGame.length}</b> currently in-game.</div>
            ${inGame.slice(0, 12).map((f) => `
              <div class="rtk-acc-item">
                <div class="rtk-flex-1">
                  <strong>@${Utils.escapeHtml(f.name)}</strong>
                  <div class="rtk-muted">${Utils.escapeHtml(f.presence.lastLocation || "Playing in Experience")}</div>
                </div>
                ${f.presence.placeId && f.presence.gameId
                  ? `<button class="rtk-btn rtk-btn-sm rtk-btn-growth" data-fr-join-place="${Utils.escapeHtml(f.presence.placeId)}" data-fr-join-job="${Utils.escapeHtml(f.presence.gameId)}">Join</button>`
                  : `<span class="rtk-badge">Private Joins</span>`}
              </div>
            `).join("")}
          `;
          liveEl.querySelectorAll("[data-fr-join-job]").forEach((b) => {
            b.addEventListener("click", async () => {
              try {
                await Launcher.join(b.dataset.frJoinPlace, b.dataset.frJoinJob, "current");
                this.toast("Joining friend's server...", "success");
              } catch (err) {
                this.toast(err.message, "error");
              }
            });
          });
        } catch (err) {
          liveEl.innerHTML = `<div class="rtk-alert">${Utils.escapeHtml(err.message)}</div>`;
        } finally {
          e.currentTarget.disabled = false;
        }
      });

      body.querySelectorAll("[data-fr-lookup]").forEach((b) => {
        b.addEventListener("click", () => this.openExplore({ mode: "user", query: b.dataset.frLookup }));
      });

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

    /* ---------------- TAB 4: ECONOMY, PENDING ROBUX & ROLIMON'S TRADE EVALUATOR ---------------- */
    async renderEconomyTab(body) {
      const cur = AccountManager.activeUser;

      const renderCustomCalcHtml = () => {
        const giveSumRap = this.customTradeGive.reduce((s, i) => s + i.rap, 0);
        const giveSumVal = this.customTradeGive.reduce((s, i) => s + i.value, 0);
        const recSumRap = this.customTradeReceive.reduce((s, i) => s + i.rap, 0);
        const recSumVal = this.customTradeReceive.reduce((s, i) => s + i.value, 0);
        const diffVal = recSumVal - giveSumVal;
        const diffSign = diffVal > 0 ? "+" : "";

        return `
          <div class="rtk-grid-2">
            <div class="rtk-stat-box">
              <span class="rtk-muted">Your Offer (${this.customTradeGive.length})</span>
              <span class="rtk-stat-val" style="font-size:13px;">Val R$ ${Utils.formatNumber(giveSumVal)}</span>
              <span class="rtk-muted">RAP: R$ ${Utils.formatNumber(giveSumRap)}</span>
            </div>
            <div class="rtk-stat-box">
              <span class="rtk-muted">Their Offer (${this.customTradeReceive.length})</span>
              <span class="rtk-stat-val" style="font-size:13px;">Val R$ ${Utils.formatNumber(recSumVal)}</span>
              <span class="rtk-muted">RAP: R$ ${Utils.formatNumber(recSumRap)} · Net: <b>${diffSign}${Utils.formatNumber(diffVal)}</b></span>
            </div>
          </div>
          ${(this.customTradeGive.length > 0 || this.customTradeReceive.length > 0) ? `
            <div class="rtk-row" style="flex-wrap:wrap;gap:6px;">
              ${this.customTradeGive.map((it, idx) => `<span class="rtk-badge" data-rm-give="${idx}" style="cursor:pointer;" title="Click to remove">Give: ${Utils.escapeHtml(it.acronym || it.name)} (${Utils.formatCompact(it.value)}) ✕</span>`).join("")}
              ${this.customTradeReceive.map((it, idx) => `<span class="rtk-badge rtk-badge-live" data-rm-rec="${idx}" style="cursor:pointer;" title="Click to remove">Get: ${Utils.escapeHtml(it.acronym || it.name)} (${Utils.formatCompact(it.value)}) ✕</span>`).join("")}
            </div>
          ` : ""}
        `;
      };

      body.innerHTML = `
        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Revenue, Pending Robux & Spend Summary</span>
            <select class="rtk-select" id="eco-tf" style="width:110px;height:28px;font-size:12px;">
              <option value="Day" ${this.economyTimeFrame === "Day" ? "selected" : ""}>Past Day</option>
              <option value="Week" ${this.economyTimeFrame === "Week" ? "selected" : ""}>Past Week</option>
              <option value="Month" ${this.economyTimeFrame === "Month" ? "selected" : ""}>Past Month</option>
              <option value="Year" ${this.economyTimeFrame === "Year" ? "selected" : ""}>Past Year</option>
            </select>
          </div>
          <div id="eco-summary-box">
            ${cur ? `<div class="rtk-muted">Loading Robux balance, pending sales, and transaction totals...</div>` : `<div class="rtk-muted">Sign in to view your account's Pending Robux and transaction summary.</div>`}
          </div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Active Trade Evaluator (Rolimon's Values)</span>
            <div class="rtk-row">
              <select class="rtk-select" id="eco-trade-type" style="width:110px;height:28px;font-size:12px;">
                <option value="Inbound" ${this.tradeListType === "Inbound" ? "selected" : ""}>Inbound</option>
                <option value="Outbound" ${this.tradeListType === "Outbound" ? "selected" : ""}>Outbound</option>
              </select>
              <button class="rtk-btn rtk-btn-sm rtk-btn-cta" id="eco-load-trades">${Icons.refresh}<span>Evaluate</span></button>
            </div>
          </div>
          <div id="eco-trades-list" class="rtk-col">
            <div class="rtk-muted">Click <b>Evaluate</b> to inspect your Inbound or Outbound trades with live Rolimon's Value, RAP, Demand, and Projected warnings.</div>
          </div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Custom Limiteds Trade Calculator</span>
            <button class="rtk-btn rtk-btn-sm" id="eco-calc-clear">Reset</button>
          </div>
          <div id="eco-calc-summary" class="rtk-col">${renderCustomCalcHtml()}</div>
          <div class="rtk-row">
            <input class="rtk-input rtk-flex-1" id="eco-item-search" placeholder="Search Limited by name, acronym (e.g. SSHF, Valk) or Asset ID..." />
          </div>
          <div id="eco-item-results" class="rtk-col"></div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Marketplace 30% Fee & DevEx Calculator</span>
          </div>
          <div class="rtk-grid-2">
            <div class="rtk-col">
              <label class="rtk-label">Buyer Pays (Listing Price R$)</label>
              <input type="number" class="rtk-input" id="eco-tax-gross" placeholder="1000" value="1000" min="0" />
            </div>
            <div class="rtk-col">
              <label class="rtk-label">Creator Receives (After 30% Fee)</label>
              <input type="number" class="rtk-input" id="eco-tax-net" placeholder="700" value="700" min="0" />
            </div>
          </div>
          <div class="rtk-muted" id="eco-tax-summary">DevEx Cashout Value of 700 R$: <b>$2.45 USD</b> · Retail Purchase Cost of 1,000 R$: <b>$12.50 USD</b></div>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Rolimon's High-Demand & Deal Finder</span>
            <div class="rtk-row">
              <select class="rtk-select" id="eco-deal-mode" style="width:150px;height:28px;font-size:12px;">
                <option value="high_demand" ${this.rolimonsDealMode === "high_demand" ? "selected" : ""}>Amazing / High Demand</option>
                <option value="undervalued" ${this.rolimonsDealMode === "undervalued" ? "selected" : ""}>Value &gt; RAP Spread</option>
                <option value="projected" ${this.rolimonsDealMode === "projected" ? "selected" : ""}>Projected Warning List</option>
                <option value="rare" ${this.rolimonsDealMode === "rare" ? "selected" : ""}>Rare Limiteds</option>
              </select>
              <button class="rtk-btn rtk-btn-sm rtk-btn-cta" id="eco-load-deals">${Icons.search}<span>Load</span></button>
            </div>
          </div>
          <div id="eco-deals-list" class="rtk-col">
            <div class="rtk-muted">Browse top High-Demand Limiteds, items with Value above RAP, Rare items, or currently Projected items to avoid in trades.</div>
          </div>
        </div>

        ${cur ? `
          <div class="rtk-card rtk-col">
            <div class="rtk-card-title">
              <span>Recent Transactions Log</span>
              <div class="rtk-row">
                <select class="rtk-select" id="eco-tx-type" style="width:125px;height:28px;font-size:12px;">
                  <option value="Sale" ${this.recentTxType === "Sale" ? "selected" : ""}>Sales of Goods</option>
                  <option value="Purchase" ${this.recentTxType === "Purchase" ? "selected" : ""}>Purchases</option>
                  <option value="GroupPayout" ${this.recentTxType === "GroupPayout" ? "selected" : ""}>Group Payouts</option>
                </select>
                <button class="rtk-btn rtk-btn-sm rtk-btn-cta" id="eco-load-tx">${Icons.refresh}<span>Fetch</span></button>
              </div>
            </div>
            <div id="eco-tx-list" class="rtk-col">
              <div class="rtk-muted">Click <b>Fetch</b> to inspect your recent Sales (including Pending Robux items), Purchases, or Group Payouts.</div>
            </div>
          </div>
        ` : ""}
      `;

      const loadSummary = async () => {
        if (!cur) return;
        const box = body.querySelector("#eco-summary-box");
        try {
          const sum = await RobloxAPI.getEconomySummary(cur.id, this.economyTimeFrame);
          const t = sum.totals || {};
          const pending = Math.abs(Number(t.pendingRobuxTotal || 0));
          const sales = Math.abs(Number(t.salesTotal || 0)) + Math.abs(Number(t.groupPayoutsTotal || 0)) + Math.abs(Number(t.currencyPurchasesTotal || 0));
          const spent = Math.abs(Number(t.purchasesTotal || 0));

          box.innerHTML = `
            <div class="rtk-grid-2">
              <div class="rtk-stat-box">
                <span class="rtk-muted">Current Balance</span>
                <span class="rtk-stat-val">R$ ${Utils.formatNumber(sum.balance ?? 0)}</span>
                <span class="rtk-muted">DevEx: $${(((sum.balance || 0) * 0.0035)).toFixed(2)} USD</span>
              </div>
              <div class="rtk-stat-box">
                <span class="rtk-muted">Pending Robux</span>
                <span class="rtk-stat-val">R$ ${Utils.formatNumber(pending)}</span>
                <span class="rtk-muted">DevEx: $${(pending * 0.0035).toFixed(2)} USD</span>
              </div>
              <div class="rtk-stat-box">
                <span class="rtk-muted">Gross Revenue (${Utils.escapeHtml(this.economyTimeFrame)})</span>
                <span class="rtk-stat-val" style="font-size:13.5px;">+R$ ${Utils.formatNumber(sales)}</span>
              </div>
              <div class="rtk-stat-box">
                <span class="rtk-muted">Robux Spent (${Utils.escapeHtml(this.economyTimeFrame)})</span>
                <span class="rtk-stat-val" style="font-size:13.5px;">-R$ ${Utils.formatNumber(spent)}</span>
              </div>
            </div>
          `;
        } catch (err) {
          box.innerHTML = `<div class="rtk-muted">Economy summary unavailable (${Utils.escapeHtml(err.message)}).</div>`;
        }
      };

      loadSummary();

      body.querySelector("#eco-tf")?.addEventListener("change", (e) => {
        this.economyTimeFrame = e.target.value;
        loadSummary();
      });

      // Trade Evaluator
      body.querySelector("#eco-trade-type")?.addEventListener("change", (e) => {
        this.tradeListType = e.target.value;
      });
      body.querySelector("#eco-load-trades")?.addEventListener("click", async (e) => {
        const listEl = body.querySelector("#eco-trades-list");
        e.currentTarget.disabled = true;
        listEl.innerHTML = `<div class="rtk-muted">Fetching ${Utils.escapeHtml(this.tradeListType)} trades & Rolimon's item values...</div>`;
        try {
          await RolimonsEngine.ensureLoaded();
          const trades = await RobloxAPI.getTradesList(this.tradeListType, 10);
          if (!trades.length) {
            listEl.innerHTML = `<div class="rtk-muted">No active ${Utils.escapeHtml(this.tradeListType.toLowerCase())} trades found.</div>`;
            return;
          }
          const detailed = await Promise.all(trades.slice(0, 6).map((tr) => RobloxAPI.getTradeDetails(tr.id).catch(() => null)));
          const validTrades = detailed.filter(Boolean);

          listEl.innerHTML = validTrades.map((tr) => {
            const offers = tr.offers || [];
            const myOffer = offers.find((o) => cur && String(o.user?.id) === String(cur.id)) || offers[0];
            const theirOffer = offers.find((o) => !cur || String(o.user?.id) !== String(cur.id)) || offers[1];
            const giveEval = RolimonsEngine.evaluateTradeOfferSide(myOffer);
            const recEval = RolimonsEngine.evaluateTradeOfferSide(theirOffer);
            const netVal = recEval.totalValue - giveEval.totalValue;
            const netSign = netVal > 0 ? "+" : "";

            return `
              <div class="rtk-acc-item" style="flex-direction:column;align-items:stretch;">
                <div class="rtk-row" style="justify-content:space-between;">
                  <div>
                    <strong>Trade with @${Utils.escapeHtml(theirOffer?.user?.name || "User")}</strong>
                    <span class="rtk-badge ${netVal >= 0 ? "rtk-badge-live" : "rtk-badge-danger"}">${netSign}${Utils.formatNumber(netVal)} Val</span>
                    ${recEval.hasProjected ? `<span class="rtk-badge rtk-badge-warn">⚠ THEIR OFFER HAS PROJECTED</span>` : ""}
                  </div>
                  ${this.tradeListType === "Inbound" ? `<button class="rtk-btn rtk-btn-sm rtk-btn-danger" data-decline-trade="${Utils.escapeHtml(tr.id)}">Decline</button>` : ""}
                </div>
                <div class="rtk-grid-2" style="margin-top:4px;">
                  <div class="rtk-muted"><b>You Give:</b> Val R$ ${Utils.formatNumber(giveEval.totalValue)} (RAP R$ ${Utils.formatNumber(giveEval.totalRap)})</div>
                  <div class="rtk-muted"><b>You Get:</b> Val R$ ${Utils.formatNumber(recEval.totalValue)} (RAP R$ ${Utils.formatNumber(recEval.totalRap)})</div>
                </div>
              </div>
            `;
          }).join("");

          listEl.querySelectorAll("[data-decline-trade]").forEach((b) => {
            b.addEventListener("click", async () => {
              b.disabled = true;
              try {
                await RobloxAPI.declineTrade(b.dataset.declineTrade);
                this.toast("Trade declined.", "info");
                b.closest(".rtk-acc-item")?.remove();
              } catch (err) {
                b.disabled = false;
                this.toast(err.message, "error");
              }
            });
          });
        } catch (err) {
          listEl.innerHTML = `<div class="rtk-alert">${Utils.escapeHtml(err.message)}</div>`;
        } finally {
          e.currentTarget.disabled = false;
        }
      });

      // Custom Trade Calculator
      const refreshCalcSummary = () => {
        const sumEl = body.querySelector("#eco-calc-summary");
        if (!sumEl) return;
        sumEl.innerHTML = renderCustomCalcHtml();
        sumEl.querySelectorAll("[data-rm-give]").forEach((el) => {
          el.addEventListener("click", () => {
            this.customTradeGive.splice(Number(el.dataset.rmGive), 1);
            refreshCalcSummary();
          });
        });
        sumEl.querySelectorAll("[data-rm-rec]").forEach((el) => {
          el.addEventListener("click", () => {
            this.customTradeReceive.splice(Number(el.dataset.rmRec), 1);
            refreshCalcSummary();
          });
        });
      };

      refreshCalcSummary();

      body.querySelector("#eco-calc-clear")?.addEventListener("click", () => {
        this.customTradeGive = [];
        this.customTradeReceive = [];
        refreshCalcSummary();
      });

      const searchInp = body.querySelector("#eco-item-search");
      const searchRes = body.querySelector("#eco-item-results");
      searchInp?.addEventListener("input", async () => {
        const q = searchInp.value.trim();
        if (q.length < 2) {
          searchRes.innerHTML = "";
          return;
        }
        const matches = await RolimonsEngine.searchItems(q, 8);
        searchRes.innerHTML = matches.map((m) => `
          <div class="rtk-acc-item">
            <div class="rtk-flex-1">
              <div class="rtk-row" style="gap:6px;">
                <strong class="rtk-ellipsis">${Utils.escapeHtml(m.name)}</strong>
                ${m.acronym ? `<span class="rtk-badge">${Utils.escapeHtml(m.acronym)}</span>` : ""}
                ${m.projected ? `<span class="rtk-badge rtk-badge-warn">PROJ</span>` : ""}
              </div>
              <div class="rtk-muted">Val: R$ ${Utils.formatNumber(m.value)} · RAP: R$ ${Utils.formatNumber(m.rap)} · Demand: ${Utils.escapeHtml(m.demandLabel)}</div>
            </div>
            <button class="rtk-btn rtk-btn-sm" data-add-give="${Utils.escapeHtml(m.assetId)}">+ Give</button>
            <button class="rtk-btn rtk-btn-sm rtk-btn-cta" data-add-rec="${Utils.escapeHtml(m.assetId)}">+ Get</button>
          </div>
        `).join("");

        searchRes.querySelectorAll("[data-add-give]").forEach((b) => {
          b.addEventListener("click", () => {
            const item = matches.find((x) => String(x.assetId) === b.dataset.addGive);
            if (item) {
              this.customTradeGive.push(item);
              refreshCalcSummary();
            }
          });
        });
        searchRes.querySelectorAll("[data-add-rec]").forEach((b) => {
          b.addEventListener("click", () => {
            const item = matches.find((x) => String(x.assetId) === b.dataset.addRec);
            if (item) {
              this.customTradeReceive.push(item);
              refreshCalcSummary();
            }
          });
        });
      });

      // Marketplace 30% Fee Calculator
      const grossInput = body.querySelector("#eco-tax-gross");
      const netInput = body.querySelector("#eco-tax-net");
      const taxSummary = body.querySelector("#eco-tax-summary");
      const updateTaxNote = (gross, net) => {
        const devExUsd = (net * 0.0035).toFixed(2);
        const buyUsd = (gross * 0.0125).toFixed(2);
        taxSummary.innerHTML = `DevEx Cashout Value of ${Utils.formatNumber(net)} R$: <b>$${devExUsd} USD</b> · Retail Purchase Cost of ${Utils.formatNumber(gross)} R$: <b>$${buyUsd} USD</b>`;
      };
      grossInput?.addEventListener("input", () => {
        const gross = Math.max(0, Math.floor(Number(grossInput.value) || 0));
        const net = Math.floor(gross * 0.7);
        netInput.value = String(net);
        updateTaxNote(gross, net);
      });
      netInput?.addEventListener("input", () => {
        const net = Math.max(0, Math.floor(Number(netInput.value) || 0));
        const gross = Math.ceil(net / 0.7);
        grossInput.value = String(gross);
        updateTaxNote(gross, net);
      });

      // Rolimon's Deal & High-Demand Finder
      body.querySelector("#eco-deal-mode")?.addEventListener("change", (e) => {
        this.rolimonsDealMode = e.target.value;
      });
      body.querySelector("#eco-load-deals")?.addEventListener("click", async (e) => {
        const listEl = body.querySelector("#eco-deals-list");
        e.currentTarget.disabled = true;
        listEl.innerHTML = `<div class="rtk-muted">Loading Rolimon's market catalog...</div>`;
        try {
          const deals = await RolimonsEngine.getTopDeals(this.rolimonsDealMode, 20);
          listEl.innerHTML = deals.map((d) => `
            <div class="rtk-acc-item">
              <div class="rtk-flex-1">
                <div class="rtk-row" style="gap:6px;flex-wrap:wrap;">
                  <strong class="rtk-ellipsis">${Utils.escapeHtml(d.name)}</strong>
                  ${d.acronym ? `<span class="rtk-badge">${Utils.escapeHtml(d.acronym)}</span>` : ""}
                  ${d.projected ? `<span class="rtk-badge rtk-badge-warn">PROJ</span>` : ""}
                  ${d.rare ? `<span class="rtk-badge rtk-badge-live">RARE</span>` : ""}
                </div>
                <div class="rtk-muted">Val: R$ ${Utils.formatNumber(d.value)} · RAP: R$ ${Utils.formatNumber(d.rap)} · Demand: ${Utils.escapeHtml(d.demandLabel)}</div>
              </div>
              <a class="rtk-btn rtk-btn-sm" href="https://www.roblox.com/catalog/${encodeURIComponent(d.assetId)}/-" target="_blank" rel="noopener" style="text-decoration:none;">Catalog</a>
            </div>
          `).join("");
        } catch (err) {
          listEl.innerHTML = `<div class="rtk-alert">${Utils.escapeHtml(err.message)}</div>`;
        } finally {
          e.currentTarget.disabled = false;
        }
      });

      // Recent Transactions Log
      body.querySelector("#eco-tx-type")?.addEventListener("change", (e) => {
        this.recentTxType = e.target.value;
      });
      body.querySelector("#eco-load-tx")?.addEventListener("click", async (e) => {
        if (!cur) return;
        const listEl = body.querySelector("#eco-tx-list");
        e.currentTarget.disabled = true;
        listEl.innerHTML = `<div class="rtk-muted">Fetching recent ${Utils.escapeHtml(this.recentTxType)} transactions...</div>`;
        try {
          const txs = await RobloxAPI.getRecentTransactions(cur.id, this.recentTxType, 25);
          if (!txs.length) {
            listEl.innerHTML = `<div class="rtk-muted">No recent ${Utils.escapeHtml(this.recentTxType)} transactions found.</div>`;
            return;
          }
          listEl.innerHTML = txs.slice(0, 20).map((tx) => {
            const amt = Number(tx.currency?.amount || 0);
            const itemName = tx.details?.name || tx.transactionType || "Transaction";
            const agentName = tx.agent?.name || "Roblox";
            return `
              <div class="rtk-acc-item">
                <div class="rtk-flex-1">
                  <div class="rtk-row" style="gap:6px;flex-wrap:wrap;">
                    <strong class="rtk-ellipsis">${Utils.escapeHtml(itemName)}</strong>
                    ${tx.isPending ? `<span class="rtk-badge rtk-badge-warn">PENDING</span>` : ""}
                  </div>
                  <div class="rtk-muted">@${Utils.escapeHtml(agentName)} · ${Utils.formatDateShort(tx.created)}</div>
                </div>
                <span class="rtk-badge ${amt >= 0 ? "rtk-badge-live" : ""}">${amt >= 0 ? "+" : ""}R$ ${Utils.formatNumber(amt)}</span>
              </div>
            `;
          }).join("");
        } catch (err) {
          listEl.innerHTML = `<div class="rtk-alert">${Utils.escapeHtml(err.message)}</div>`;
        } finally {
          e.currentTarget.disabled = false;
        }
      });
    },

    /* ---------------- TAB 5: QUICK SETTINGS, AVATAR CONTROLS & CONTENT BLOCKER ---------------- */
    async renderSettingsTab(body) {
      const localSettings = Store.getSettings();
      const blockRules = ContentBlocker.getRules();

      const qolCardHtml = `
        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Website QoL & Robux Converter</span>
          </div>
          <div class="rtk-col" style="margin-bottom:4px;">
            <label class="rtk-label">Robux Fiat Price Overlay</label>
            <select class="rtk-select" id="qol-currency-mode">
              ${Object.entries(CURRENCY_MODES)
                .map(([k, m]) => `<option value="${Utils.escapeHtml(k)}" ${localSettings.currencyMode === k ? "selected" : ""}>${Utils.escapeHtml(m.label)}</option>`)
                .join("")}
            </select>
          </div>
          <label class="rtk-switch-row">
            <div>
              <div class="rtk-label">Block Website Banner Ads</div>
              <div class="rtk-muted">Hide skyscraper, leaderboard, and sponsorship ad frames</div>
            </div>
            ${renderToggleSwitch("qol-ads", localSettings.qolBlockAds)}
          </label>
          <label class="rtk-switch-row">
            <div>
              <div class="rtk-label">Hide Desktop App Upsell Banners</div>
              <div class="rtk-muted">Suppress Roblox desktop app nag bars</div>
            </div>
            ${renderToggleSwitch("qol-banners", localSettings.qolHideAppBanners)}
          </label>
          <label class="rtk-switch-row">
            <div>
              <div class="rtk-label">Wide Website Layout</div>
              <div class="rtk-muted">Expand main content container up to 1480px on large displays</div>
            </div>
            ${renderToggleSwitch("qol-wide", localSettings.qolWideLayout)}
          </label>
          <label class="rtk-switch-row">
            <div>
              <div class="rtk-label">Home Page Pinned Experiences Shelf</div>
              <div class="rtk-muted">Inject your bookmarked games shelf at the top of /home</div>
            </div>
            ${renderToggleSwitch("qol-homeshelf", localSettings.qolHomePinnedShelf)}
          </label>
          <label class="rtk-switch-row">
            <div>
              <div class="rtk-label">In-Page Experience Insights Bar</div>
              <div class="rtk-muted">Show exact Like Ratio %, Universe ID & Subplaces button on game pages</div>
            </div>
            ${renderToggleSwitch("qol-gamebar", localSettings.qolGameInsightsBar)}
          </label>
          <label class="rtk-switch-row">
            <div>
              <div class="rtk-label">In-Page Profile Insights Bar</div>
              <div class="rtk-muted">Show Creation Date, Collectible RAP & Past Usernames on user profiles</div>
            </div>
            ${renderToggleSwitch("qol-profbar", localSettings.qolProfileStatsBar)}
          </label>
          <label class="rtk-switch-row">
            <div>
              <div class="rtk-label">In-Page Catalog / Asset Tools Bar</div>
              <div class="rtk-muted">Show Copy ID, Extract Image ID, Audio Player & Raw Download on item pages</div>
            </div>
            ${renderToggleSwitch("qol-assetbar", localSettings.qolAssetQuickBar)}
          </label>
          <label class="rtk-switch-row">
            <div>
              <div class="rtk-label">Enable Experience & Keyword Blocker</div>
              <div class="rtk-muted">Hide blocked games and clickbait keywords on Home & Discover</div>
            </div>
            ${renderToggleSwitch("qol-blocker", localSettings.qolContentBlocker)}
          </label>
        </div>

        <div class="rtk-card rtk-col">
          <div class="rtk-card-title">
            <span>Experience & Keyword Blocker (${blockRules.length})</span>
            ${Icons.shield}
          </div>
          <div class="rtk-row">
            <select class="rtk-select" id="blk-type" style="width:120px;">
              <option value="keyword">Keyword</option>
              <option value="placeId">Place ID</option>
            </select>
            <input class="rtk-input rtk-flex-1" id="blk-val" placeholder="e.g. Skibidi, [UPD], or Place ID" />
            <button class="rtk-btn rtk-btn-cta" id="blk-add-btn">Block</button>
          </div>
          ${blockRules.length === 0
            ? `<div class="rtk-muted">Add title keywords or Place IDs above to hide unwanted game tiles across Roblox.</div>`
            : `<div class="rtk-row" style="flex-wrap:wrap;gap:6px;">
                ${blockRules.map((r) => `
                  <span class="rtk-badge" data-blk-del="${Utils.escapeHtml(r.id)}" style="cursor:pointer;" title="Click to unblock">
                    ${r.type === "placeId" ? "Place" : "Word"}: ${Utils.escapeHtml(r.value)} ✕
                  </span>
                `).join("")}
              </div>`}
        </div>
      `;

      const bindQolListeners = () => {
        body.querySelector("#qol-currency-mode")?.addEventListener("change", (e) => {
          Store.updateSettings({ currencyMode: e.target.value });
          SiteQoL.applySettings();
          this.toast("Updated Robux currency display.", "info");
        });
        const map = [
          ["#qol-ads", "qolBlockAds"],
          ["#qol-banners", "qolHideAppBanners"],
          ["#qol-wide", "qolWideLayout"],
          ["#qol-homeshelf", "qolHomePinnedShelf"],
          ["#qol-gamebar", "qolGameInsightsBar"],
          ["#qol-profbar", "qolProfileStatsBar"],
          ["#qol-assetbar", "qolAssetQuickBar"],
          ["#qol-blocker", "qolContentBlocker"],
        ];
        map.forEach(([sel, key]) => {
          body.querySelector(sel)?.addEventListener("change", (e) => {
            Store.updateSettings({ [key]: e.target.checked });
            SiteQoL.applySettings();
            if (!e.target.checked) {
              if (key === "qolHomePinnedShelf") document.getElementById("rtk-home-pinned-shelf")?.remove();
              if (key === "qolGameInsightsBar") document.getElementById("rtk-game-insights-bar")?.remove();
              if (key === "qolProfileStatsBar") document.getElementById("rtk-profile-insights-bar")?.remove();
              if (key === "qolAssetQuickBar") document.getElementById("rtk-asset-quick-bar")?.remove();
            } else {
              GamePageUI.tickDomEnhancements();
            }
          });
        });

        body.querySelector("#blk-add-btn")?.addEventListener("click", () => {
          const type = body.querySelector("#blk-type").value;
          const val = body.querySelector("#blk-val").value.trim();
          if (!val) return;
          try {
            ContentBlocker.addRule({ type, value: val });
            this.toast(`Blocked ${type}: ${val}`, "info");
            this.renderSettingsTab(body);
          } catch (err) {
            this.toast(err.message, "error");
          }
        });

        body.querySelectorAll("[data-blk-del]").forEach((el) => {
          el.addEventListener("click", () => {
            ContentBlocker.removeRule(el.dataset.blkDel);
            this.renderSettingsTab(body);
          });
        });
      };

      if (!AccountManager.activeUser) {
        body.innerHTML = `
          ${qolCardHtml}
          <div class="rtk-card"><div class="rtk-muted">Sign in to adjust Roblox account privacy, avatar rig, and chat settings.</div></div>
        `;
        bindQolListeners();
        return;
      }

      if (!QuickSettings.loaded) {
        body.innerHTML = `
          ${qolCardHtml}
          <div class="rtk-card"><div class="rtk-muted">Loading account settings...</div></div>
        `;
        bindQolListeners();
        try {
          await QuickSettings.load();
        } catch (err) {
          body.innerHTML = `
            ${qolCardHtml}
            <div class="rtk-alert">Failed to load settings: ${Utils.escapeHtml(err.message)}</div>
          `;
          bindQolListeners();
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
            <span>Avatar Quick-Controls (R6 / R15 & Scales)</span>
          </div>
          <div class="rtk-grid-2">
            <button class="rtk-btn" id="av-rig-r6">Switch Avatar to R6</button>
            <button class="rtk-btn" id="av-rig-r15">Switch Avatar to R15</button>
          </div>
          <div class="rtk-grid-3" style="margin-top:4px;">
            <button class="rtk-btn rtk-btn-sm" data-av-scale="classic">Classic (100%)</button>
            <button class="rtk-btn rtk-btn-sm" data-av-scale="tall">Tall / Slender</button>
            <button class="rtk-btn rtk-btn-sm" data-av-scale="compact">Compact / Small</button>
          </div>
        </div>

        ${qolCardHtml}

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

      bindQolListeners();

      body.querySelector("#av-rig-r6")?.addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        try {
          await RobloxAPI.setAvatarRigType("R6");
          this.toast("Avatar switched to R6.", "success");
        } catch (err) {
          this.toast(err.message, "error");
        } finally {
          e.currentTarget.disabled = false;
        }
      });

      body.querySelector("#av-rig-r15")?.addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        try {
          await RobloxAPI.setAvatarRigType("R15");
          this.toast("Avatar switched to R15.", "success");
        } catch (err) {
          this.toast(err.message, "error");
        } finally {
          e.currentTarget.disabled = false;
        }
      });

      body.querySelectorAll("[data-av-scale]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          const mode = btn.dataset.avScale;
          const presets = {
            classic: { height: 1.0, width: 1.0, head: 1.0, proportion: 0.0, bodyType: 0.0 },
            tall: { height: 1.05, width: 0.85, head: 0.95, proportion: 0.5, bodyType: 0.3 },
            compact: { height: 0.9, width: 0.7, head: 0.95, proportion: 0.0, bodyType: 0.0 },
          };
          try {
            await RobloxAPI.setAvatarScales(presets[mode] || presets.classic);
            this.toast(`Applied ${mode} avatar proportions.`, "success");
          } catch (err) {
            this.toast(err.message, "error");
          } finally {
            btn.disabled = false;
          }
        });
      });

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

    /* ---------------- TAB 6: PLAYTIME TRACKER & 28-DAY HEATMAP ---------------- */
    renderPlaytimeTab(body) {
      const settings = Store.getSettings();
      const { list, activeSession } = PlaytimeTracker.getSortedGames({
        accountId: this.playtimeFilterAcc,
        sortBy: this.playtimeSort,
        search: this.playtimeSearch,
      });
      const heatmapDays = PlaytimeTracker.getHeatmap28Days();
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
            <span>28-Day Activity Heatmap</span>
            <span class="rtk-muted">Last 4 Weeks</span>
          </div>
          <div class="rtk-heatmap">
            ${heatmapDays.map((d) => `
              <div class="rtk-heat-cell ${d.level ? `rtk-heat-${d.level}` : ""}" title="${Utils.escapeHtml(d.dayKey)}: ${Utils.formatDuration(d.seconds)}">
                <span>${Utils.escapeHtml(d.dayNum || d.label.split("-")[1])}</span>
              </div>
            `).join("")}
          </div>
        </div>

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

    /* ---------------- TAB 7: DEVELOPER, AUDIO PREVIEW & SCRIPT EXTRACTOR ---------------- */
    async renderDevToolsTab(body) {
      const ctx = DevTools.detectUrlContext();
      const autoAsset = this.pendingDevAssetId;
      this.pendingDevAssetId = "";
      const prefillAsset = autoAsset || (ctx.type === "asset" ? ctx.id : "");
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
          <div class="rtk-card-title"><span>Asset, Audio, Version & Luau Script Extractor</span></div>
          <div class="rtk-muted">Resolve underlying <code>ImageLabel</code> / Template IDs, preview Audio, download historical versions, or extract embedded Luau scripts from Models (<code>.rbxm</code>).</div>
          <div class="rtk-row">
            <input class="rtk-input rtk-flex-1" id="dt-asset-id" placeholder="Asset ID (Decal, Clothing, Audio, Model)" value="${Utils.escapeHtml(prefillAsset)}" />
            <input class="rtk-input" id="dt-asset-ver" type="number" min="0" placeholder="Ver (Latest)" style="width:96px;" title="Optional historical version number (1, 2, ...)" />
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
          <div class="rtk-card-title">
            <span>Roblox Live Build & FastFlag (FFlag) Builder</span>
            <button class="rtk-btn rtk-btn-sm" id="dt-check-ver-btn">${Icons.refresh}<span>Live Builds</span></button>
          </div>
          <div id="dt-ver-out" class="rtk-muted">Generate <code>ClientAppSettings.json</code> for Bloxstrap / Roblox Player or check live WindowsPlayer &amp; Studio deployment versions.</div>
          <div class="rtk-col" style="margin-top:4px;">
            ${FFlagGenerator.PRESETS.map((p) => `
              <label class="rtk-switch-row">
                <div>
                  <div class="rtk-label">${Utils.escapeHtml(p.label)}</div>
                  <div class="rtk-muted">${Utils.escapeHtml(p.desc)}</div>
                </div>
                ${renderToggleSwitch(`fflag-${p.id}`, p.id === "fps_240" || p.id === "telemetry_off")}
              </label>
            `).join("")}
          </div>
          <div class="rtk-grid-2" style="margin-top:4px;">
            <button class="rtk-btn rtk-btn-sm" id="dt-fflag-copy">${Icons.copy}<span>Copy JSON</span></button>
            <button class="rtk-btn rtk-btn-sm rtk-btn-cta" id="dt-fflag-dl">${Icons.download}<span>ClientAppSettings.json</span></button>
          </div>
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

      const inspectAssetBtn = body.querySelector("#dt-inspect-asset-btn");
      inspectAssetBtn.addEventListener("click", async () => {
        const idVal = body.querySelector("#dt-asset-id").value.trim();
        const verVal = Number(body.querySelector("#dt-asset-ver").value) || 0;
        const out = body.querySelector("#dt-asset-result");
        inspectAssetBtn.disabled = true;
        out.innerHTML = `<div class="rtk-muted">Fetching asset stream...</div>`;
        try {
          const data = await DevTools.inspectAssetAndExtractIds(idVal, verVal);
          const audioBlobUrl = data.isAudio
            ? URL.createObjectURL(new Blob([data.buffer], { type: data.format.mime }))
            : "";

          out.innerHTML = `
            <div class="rtk-col" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--rbx-border);">
              <div class="rtk-kv-row"><span class="rtk-muted">Name</span><b>${Utils.escapeHtml(data.name)}${data.versionNumber ? ` (v${data.versionNumber})` : ""}</b></div>
              <div class="rtk-kv-row"><span class="rtk-muted">Format</span><span>${Utils.escapeHtml(data.format.kind)} (${(data.byteSize / 1024).toFixed(1)} KB)</span></div>
              ${audioBlobUrl ? `
                <div class="rtk-col" style="margin:4px 0;">
                  <span class="rtk-muted">Inline Audio Preview:</span>
                  <audio controls src="${Utils.escapeHtml(audioBlobUrl)}" style="width:100%;height:34px;"></audio>
                </div>
              ` : ""}
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
              ${(data.extractedScripts || []).length > 0 ? `
                <div class="rtk-muted" style="margin-top:6px;">Embedded Luau Scripts (${data.extractedScripts.length}):</div>
                ${data.extractedScripts.map((sc, sIdx) => `
                  <div class="rtk-col">
                    <div class="rtk-row" style="justify-content:space-between;">
                      <strong>Script #${sIdx + 1}</strong>
                      <button class="rtk-btn rtk-btn-sm" data-copy-script="${sIdx}">${Icons.copy}<span>Copy Source</span></button>
                    </div>
                    <div class="rtk-code">${Utils.escapeHtml(sc)}</div>
                  </div>
                `).join("")}
              ` : ""}
            </div>
          `;

          out.querySelector("#dt-dl-raw")?.addEventListener("click", () => {
            const safeName = data.name.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40);
            const verTag = data.versionNumber ? `_v${data.versionNumber}` : "";
            DevTools.triggerBlobDownload(data.buffer, `${safeName}_${data.assetId}${verTag}.${data.format.ext}`, data.format.mime);
          });
          out.querySelectorAll("[data-dt-uri]").forEach((b) => {
            b.addEventListener("click", async () => {
              await Utils.copyText(b.dataset.dtUri);
              this.toast(`Copied: ${b.dataset.dtUri}`, "success");
            });
          });
          out.querySelectorAll("[data-copy-script]").forEach((b) => {
            b.addEventListener("click", async () => {
              const sc = data.extractedScripts[Number(b.dataset.copyScript)];
              if (sc) {
                await Utils.copyText(sc);
                this.toast("Copied extracted Luau script.", "success");
              }
            });
          });
        } catch (err) {
          out.innerHTML = `<div class="rtk-alert">${Utils.escapeHtml(err.message)}</div>`;
        } finally {
          inspectAssetBtn.disabled = false;
        }
      });

      if (autoAsset) {
        inspectAssetBtn.click();
      }

      body.querySelectorAll("[data-snip-idx]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const snip = snippets[Number(btn.dataset.snipIdx)];
          if (snip) {
            await Utils.copyText(snip.code);
            this.toast("Copied Luau snippet.", "success");
          }
        });
      });

      const getSelectedFFlagJson = () => {
        const ids = FFlagGenerator.PRESETS
          .filter((p) => body.querySelector(`#fflag-${p.id}`)?.checked)
          .map((p) => p.id);
        return FFlagGenerator.buildJson(ids);
      };

      body.querySelector("#dt-fflag-copy")?.addEventListener("click", async () => {
        await Utils.copyText(getSelectedFFlagJson());
        this.toast("Copied ClientAppSettings.json FastFlags.", "success");
      });

      body.querySelector("#dt-fflag-dl")?.addEventListener("click", () => {
        const json = getSelectedFFlagJson();
        DevTools.triggerBlobDownload(new TextEncoder().encode(json), "ClientAppSettings.json", "application/json");
        this.toast("Downloaded ClientAppSettings.json.", "success");
      });

      body.querySelector("#dt-check-ver-btn")?.addEventListener("click", async (e) => {
        const outEl = body.querySelector("#dt-ver-out");
        e.currentTarget.disabled = true;
        outEl.textContent = "Querying clientsettings.roblox.com for LIVE WindowsPlayer & Studio builds...";
        try {
          const v = await RobloxAPI.getClientVersionInfo();
          outEl.innerHTML = `
            <div class="rtk-kv-row"><span class="rtk-muted">WindowsPlayer</span><code>${Utils.escapeHtml(v.player?.clientVersionUpload || "Unavailable")} (${Utils.escapeHtml(v.player?.version || "?")})</code></div>
            <div class="rtk-kv-row"><span class="rtk-muted">WindowsStudio64</span><code>${Utils.escapeHtml(v.studio?.clientVersionUpload || "Unavailable")} (${Utils.escapeHtml(v.studio?.version || "?")})</code></div>
          `;
        } catch (err) {
          outEl.textContent = `Could not fetch build info: ${err.message}`;
        } finally {
          e.currentTarget.disabled = false;
        }
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

      .rtk-inline-bar {
        background-color: #232527;
        border-radius: 8px;
        padding: 10px 14px;
        margin: 10px 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        font-family: "Builder Sans", "HCo Gotham SSm", "Helvetica Neue", Helvetica, Arial, sans-serif;
        color: #FFFFFF;
        font-size: 13px;
      }
      .light-theme .rtk-inline-bar,
      body.light-theme .rtk-inline-bar {
        background-color: #FFFFFF;
        color: #191B1D;
        border: 1px solid rgba(0, 0, 0, 0.08);
      }
      .rtk-inline-stats {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 14px;
      }
      .rtk-inline-stat-label {
        color: #BDBEBE;
        font-size: 12px;
        margin-right: 4px;
      }
      .light-theme .rtk-inline-stat-label,
      body.light-theme .rtk-inline-stat-label {
        color: #606162;
      }
    `;
    document.head.appendChild(st);
  }

  const GamePageUI = {
    populatedGameBarPlace: null,
    populatedProfileId: null,

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
          <button type="button" class="rtk-srv-chip" id="rtk-srv-hop">${Icons.shuffle}<span>Server Hop</span></button>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-smallest">Smallest Server</button>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-ping">Lowest Ping</button>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-find-toggle">${Icons.search}<span>Find Player</span></button>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-pin">${Icons.pin}<span>Pin Job ID</span></button>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-copy-live">${Icons.copy}<span>Copy Active Job ID</span></button>
          <button type="button" class="rtk-srv-chip" id="rtk-srv-manage-acc">${Icons.users}<span>Accounts</span></button>
        </div>
        <div id="rtk-srv-finder-panel" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);">
          <div class="rtk-srv-row">
            <input type="text" id="rtk-srv-finder-input" class="rtk-srv-input" placeholder="Enter Roblox username or User ID to locate in public servers..." autocomplete="off" />
            <button type="button" id="rtk-srv-finder-go" class="rtk-srv-join-btn" style="background:#FFFFFF;color:#191B1D;">Scan</button>
            <button type="button" id="rtk-srv-finder-stop" class="rtk-srv-chip" style="display:none;height:38px;color:#F74B52;">Stop</button>
          </div>
          <div id="rtk-srv-finder-result" style="margin-top:8px;font-size:13px;"></div>
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

      box.querySelector("#rtk-srv-hop").addEventListener("click", async () => {
        try {
          this.showServerBarStatus("Finding fresh server to hop into...", "#BDBEBE");
          const s = await Launcher.serverHop(Utils.getPlaceIdFromPage(), accSelect.value);
          this.showServerBarStatus(`Hopping to server (${s.playing}/${s.maxPlayers} players)...`, "#00B06F");
        } catch (err) {
          this.showServerBarStatus(err.message, "#F74B52");
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

      box.querySelector("#rtk-srv-pin").addEventListener("click", async () => {
        const rawJob = input.value.trim() || PlaytimeTracker.getData().activeSession?.gameId || "";
        if (!rawJob) {
          this.showServerBarStatus("Paste a Job ID in the input above (or be in an active server) to pin it.", "#F74B52");
          return;
        }
        const label = window.prompt("Optional label for pinned server:", "") ?? "";
        try {
          await PinnedServers.pin({ jobId: rawJob, placeId: Utils.getPlaceIdFromPage(), label });
          this.showServerBarStatus("Pinned server to Toolkit!", "#00B06F");
        } catch (err) {
          this.showServerBarStatus(err.message, "#F74B52");
        }
      });

      // Inline Player Finder
      const finderPanel = box.querySelector("#rtk-srv-finder-panel");
      const finderInput = box.querySelector("#rtk-srv-finder-input");
      const finderGo = box.querySelector("#rtk-srv-finder-go");
      const finderStop = box.querySelector("#rtk-srv-finder-stop");
      const finderRes = box.querySelector("#rtk-srv-finder-result");

      box.querySelector("#rtk-srv-find-toggle").addEventListener("click", () => {
        const open = finderPanel.style.display === "none";
        finderPanel.style.display = open ? "block" : "none";
        if (open) finderInput.focus();
      });

      const runInlineScan = async () => {
        const q = finderInput.value.trim();
        const pId = Utils.getPlaceIdFromPage();
        if (!q) return;
        finderGo.style.display = "none";
        finderStop.style.display = "inline-flex";
        finderRes.textContent = "Resolving user & scanning public server tokens...";
        try {
          const res = await ServerScanner.findPlayerInServers(pId, q, (prog) => {
            finderRes.textContent = `Scanning @${prog.username} — Page ${prog.page}/15 (${Utils.formatNumber(prog.serversChecked)} servers, ${Utils.formatNumber(prog.playersChecked)} players)...`;
          });
          if (res.found && res.server) {
            finderRes.innerHTML = `
              <div class="rtk-srv-row" style="justify-content:space-between;">
                <span>Found <b>@${Utils.escapeHtml(res.user.name)}</b> in <code>${Utils.escapeHtml(res.server.id)}</code> (${res.server.playing}/${res.server.maxPlayers})</span>
                <div class="rtk-srv-row">
                  <button type="button" class="rtk-srv-chip" id="rtk-inline-found-copy">${Icons.copy}<span>Copy</span></button>
                  <button type="button" class="rtk-srv-join-btn" id="rtk-inline-found-join" style="height:32px;padding:0 14px;font-size:13px;">Join</button>
                </div>
              </div>
            `;
            finderRes.querySelector("#rtk-inline-found-copy")?.addEventListener("click", () => {
              Utils.copyText(res.server.id);
              HubUI.toast("Copied Job ID.", "success");
            });
            finderRes.querySelector("#rtk-inline-found-join")?.addEventListener("click", () => {
              Launcher.join(pId, res.server.id, accSelect.value).catch((e) => HubUI.toast(e.message, "error"));
            });
          } else {
            finderRes.textContent = `@${res.user.name} was not found in the first ${Utils.formatNumber(res.serversChecked)} public servers.`;
          }
        } catch (err) {
          finderRes.textContent = err.message;
        } finally {
          finderGo.style.display = "inline-flex";
          finderStop.style.display = "none";
        }
      };

      finderGo.addEventListener("click", runInlineScan);
      finderInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          runInlineScan();
        }
      });
      finderStop.addEventListener("click", () => ServerScanner.abort());

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
      const placeId = Utils.getPlaceIdFromPage();
      if (!placeId) return;
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
        <button type="button" id="rtk-main-hop-btn" class="rtk-srv-chip" style="height:34px;padding:0 12px;" title="Server Hop">
          ${Icons.shuffle}<span>Hop</span>
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

      bar.querySelector("#rtk-main-hop-btn").addEventListener("click", async () => {
        const accId = bar.querySelector("#rtk-main-play-acc").value;
        try {
          const s = await Launcher.serverHop(Utils.getPlaceIdFromPage(), accId);
          HubUI.toast(`Hopping to server (${s.playing}/${s.maxPlayers})...`, "success");
        } catch (err) {
          HubUI.toast(err.message, "error");
        }
      });
    },

    ensureHomePinnedShelf() {
      if (!Store.getSettings().qolHomePinnedShelf) return;
      if (!/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?home\/?$/i.test(window.location.pathname)) return;
      const pinned = PlaylistManager.getAll();
      if (!pinned.length) {
        document.getElementById("rtk-home-pinned-shelf")?.remove();
        return;
      }
      if (document.getElementById("rtk-home-pinned-shelf")) return;

      const homeContainer =
        document.querySelector(".game-home-page-container") ||
        document.getElementById("place-list") ||
        document.querySelector(".home-container") ||
        document.querySelector(".content");
      if (!homeContainer) return;

      injectInPageStyles();
      const shelf = document.createElement("div");
      shelf.id = "rtk-home-pinned-shelf";
      shelf.className = "rtk-inline-bar";
      shelf.style.flexDirection = "column";
      shelf.style.alignItems = "stretch";
      shelf.innerHTML = `
        <div class="rtk-srv-row" style="justify-content:space-between;width:100%;">
          <div class="rtk-srv-row" style="gap:8px;">
            ${Icons.pin}
            <strong style="font-size:14px;">Pinned Experiences (${pinned.length})</strong>
          </div>
          <button type="button" class="rtk-srv-chip" id="rtk-home-manage-pins" style="height:26px;font-size:12px;">Manage Playlists</button>
        </div>
        <div class="rtk-srv-row" style="gap:8px;overflow-x:auto;padding-top:4px;">
          ${pinned.slice(0, 12).map((g) => `
            <div class="rtk-srv-chip" style="height:36px;padding:0 10px;gap:8px;">
              ${g.iconUrl ? `<img src="${Utils.escapeHtml(g.iconUrl)}" style="width:22px;height:22px;border-radius:4px;" alt="" />` : ""}
              <a href="https://www.roblox.com/games/${encodeURIComponent(g.placeId)}/-" style="color:inherit;text-decoration:none;font-weight:700;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Utils.escapeHtml(g.name)}</a>
              <button type="button" data-home-play="${Utils.escapeHtml(g.placeId)}" style="background:#00B06F;color:#fff;border:none;border-radius:5px;padding:3px 8px;font-size:11.5px;font-weight:700;cursor:pointer;">Play</button>
            </div>
          `).join("")}
        </div>
      `;

      homeContainer.insertBefore(shelf, homeContainer.firstChild);

      shelf.querySelector("#rtk-home-manage-pins")?.addEventListener("click", () => {
        HubUI.openExplore({ mode: "experience" });
      });
      shelf.querySelectorAll("[data-home-play]").forEach((b) => {
        b.addEventListener("click", () => {
          Launcher.join(b.dataset.homePlay, null, "current").catch((err) => HubUI.toast(err.message, "error"));
        });
      });
    },

    ensureGameInsightsBar() {
      const placeId = Utils.getPlaceIdFromPage();
      if (!placeId || !Store.getSettings().qolGameInsightsBar) return;
      if (document.getElementById("rtk-game-insights-bar")) return;

      const anchor =
        document.querySelector(".game-calls-to-action") ||
        document.getElementById("game-details-play-button-container")?.parentElement;
      if (!anchor) return;

      injectInPageStyles();
      const bar = document.createElement("div");
      bar.id = "rtk-game-insights-bar";
      bar.className = "rtk-inline-bar";
      bar.innerHTML = `<span class="rtk-inline-stat-label">Loading experience insights...</span>`;
      anchor.appendChild(bar);

      ExplorerEngine.inspectExperience(placeId)
        .then((data) => {
          if (!bar.isConnected) return;
          const isPinned = PlaylistManager.isPinned(placeId);
          bar.innerHTML = `
            <div class="rtk-inline-stats">
              <span>${Icons.thumbsUp} <b>${data.likeRatio !== null ? `${data.likeRatio}%` : "—"}</b> <span class="rtk-inline-stat-label">Rating</span></span>
              <span><b>${data.places.length}</b> <span class="rtk-inline-stat-label">Place${data.places.length === 1 ? "" : "s"}</span></span>
            </div>
            <div class="rtk-srv-row" style="gap:6px;">
              <button type="button" class="rtk-srv-chip" id="rtk-gi-pin" style="height:28px;font-size:12px;">${Icons.pin}<span>${isPinned ? "Pinned" : "Pin Game"}</span></button>
              <button type="button" class="rtk-srv-chip" id="rtk-gi-subplaces" style="height:28px;font-size:12px;">${Icons.layers}<span>Subplaces (${data.places.length})</span></button>
              <button type="button" class="rtk-srv-chip" id="rtk-gi-univ" style="height:28px;font-size:12px;" title="Copy Universe ID">${Icons.copy}<span>Univ ${Utils.escapeHtml(data.universeId)}</span></button>
            </div>
          `;
          bar.querySelector("#rtk-gi-pin")?.addEventListener("click", async (e) => {
            if (PlaylistManager.isPinned(placeId)) {
              PlaylistManager.unpinGame(placeId);
              e.currentTarget.querySelector("span").textContent = "Pin Game";
              HubUI.toast("Unpinned experience.", "info");
            } else {
              const folder = window.prompt("Playlist folder name (e.g. Favorites, Grinding):", "Favorites") || "Favorites";
              await PlaylistManager.pinGame({ placeId, folder, name: data.meta?.name, iconUrl: data.meta?.iconUrl });
              e.currentTarget.querySelector("span").textContent = "Pinned";
              HubUI.toast(`Pinned to ${folder}!`, "success");
            }
          });
          bar.querySelector("#rtk-gi-subplaces")?.addEventListener("click", () => {
            HubUI.openExplore({ mode: "experience", query: placeId, subtab: "places" });
          });
          bar.querySelector("#rtk-gi-univ")?.addEventListener("click", async () => {
            await Utils.copyText(data.universeId);
            HubUI.toast(`Copied Universe ID: ${data.universeId}`, "success");
          });
        })
        .catch(() => {
          bar.remove();
        });
    },

    ensureProfileInsightsBar() {
      if (!Store.getSettings().qolProfileStatsBar) return;
      const m = window.location.pathname.match(/\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?users\/(\d+)\/profile/i);
      if (!m) return;
      const userId = m[1];
      if (document.getElementById("rtk-profile-insights-bar")) return;

      const headerAnchor =
        document.querySelector(".profile-header") ||
        document.getElementById("profile-header-container") ||
        document.querySelector(".profile-container .section");
      if (!headerAnchor || !headerAnchor.parentElement) return;

      injectInPageStyles();
      const bar = document.createElement("div");
      bar.id = "rtk-profile-insights-bar";
      bar.className = "rtk-inline-bar";
      bar.innerHTML = `<span class="rtk-inline-stat-label">Loading profile insights...</span>`;
      headerAnchor.parentElement.insertBefore(bar, headerAnchor.nextSibling);

      ExplorerEngine.inspectUser(userId)
        .then((u) => {
          if (!bar.isConnected) return;
          const years = (u.accountAgeDays / 365.25).toFixed(1);
          const totalVal = u.collectibles.totalValue || u.collectibles.totalRap || 0;
          const rapText = u.collectibles.privateInventory
            ? "Private"
            : `R$ ${Utils.formatCompact(u.collectibles.totalRap)} (Val R$ ${Utils.formatCompact(totalVal)})`;
          bar.innerHTML = `
            <div class="rtk-inline-stats">
              <span><span class="rtk-inline-stat-label">Joined</span><b>${Utils.formatDateShort(u.profile.created)}</b> <span class="rtk-inline-stat-label">(${years}y / ${Utils.formatNumber(u.accountAgeDays)}d)</span></span>
              <span><span class="rtk-inline-stat-label">RAP / Value</span><b>${Utils.escapeHtml(rapText)}</b></span>
              ${u.pastNames.length > 0 ? `<span title="${Utils.escapeHtml(u.pastNames.join(", "))}"><span class="rtk-inline-stat-label">Past Names</span><b>${u.pastNames.length}</b></span>` : ""}
            </div>
            <div class="rtk-srv-row" style="gap:6px;">
              <button type="button" class="rtk-srv-chip" id="rtk-pi-explore" style="height:28px;font-size:12px;">${Icons.compass}<span>Inspect Outfit & RAP (${u.wearingIds.length})</span></button>
              <button type="button" class="rtk-srv-chip" id="rtk-pi-copyid" style="height:28px;font-size:12px;">${Icons.copy}<span>ID ${Utils.escapeHtml(u.userId)}</span></button>
            </div>
          `;
          bar.querySelector("#rtk-pi-explore")?.addEventListener("click", () => {
            HubUI.openExplore({ mode: "user", query: userId });
          });
          bar.querySelector("#rtk-pi-copyid")?.addEventListener("click", async () => {
            await Utils.copyText(u.userId);
            HubUI.toast(`Copied User ID: ${u.userId}`, "success");
          });
        })
        .catch(() => {
          bar.remove();
        });
    },

    ensureAssetQuickBar() {
      if (!Store.getSettings().qolAssetQuickBar) return;
      const ctx = DevTools.detectUrlContext();
      if (ctx.type !== "asset" || !ctx.id) return;
      if (document.getElementById("rtk-asset-quick-bar")) return;

      const anchor =
        document.querySelector("#item-details") ||
        document.querySelector(".item-details-section") ||
        document.querySelector(".item-purchase-container") ||
        document.querySelector("[class*='item-details-info']");
      if (!anchor) return;

      injectInPageStyles();
      const bar = document.createElement("div");
      bar.id = "rtk-asset-quick-bar";
      bar.className = "rtk-inline-bar";
      bar.innerHTML = `
        <div class="rtk-inline-stats" id="rtk-aq-left">
          <span><span class="rtk-inline-stat-label">Asset ID</span><b>${Utils.escapeHtml(ctx.id)}</b></span>
        </div>
        <div class="rtk-srv-row" style="gap:6px;">
          <button type="button" class="rtk-srv-chip" id="rtk-aq-copy" style="height:28px;font-size:12px;">${Icons.copy}<span>Copy ID</span></button>
          <button type="button" class="rtk-srv-chip" id="rtk-aq-audio" style="height:28px;font-size:12px;">${Icons.volume}<span>Preview Audio</span></button>
          <button type="button" class="rtk-srv-chip" id="rtk-aq-extract" style="height:28px;font-size:12px;">${Icons.code}<span>Extract ID / Scripts</span></button>
          <button type="button" class="rtk-srv-chip" id="rtk-aq-dl" style="height:28px;font-size:12px;">${Icons.download}<span>Download Raw</span></button>
        </div>
      `;
      anchor.appendChild(bar);

      bar.querySelector("#rtk-aq-copy").addEventListener("click", async () => {
        await Utils.copyText(ctx.id);
        HubUI.toast(`Copied Asset ID: ${ctx.id}`, "success");
      });
      bar.querySelector("#rtk-aq-audio").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const data = await DevTools.inspectAssetAndExtractIds(ctx.id);
          if (!data.isAudio) {
            HubUI.toast(`Asset is ${data.format.kind}, not an audio stream.`, "info");
            return;
          }
          const blobUrl = URL.createObjectURL(new Blob([data.buffer], { type: data.format.mime }));
          const left = bar.querySelector("#rtk-aq-left");
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.autoplay = true;
          audio.src = blobUrl;
          audio.style.height = "28px";
          left.appendChild(audio);
          btn.style.display = "none";
        } catch (err) {
          HubUI.toast(err.message, "error");
        } finally {
          btn.disabled = false;
        }
      });
      bar.querySelector("#rtk-aq-extract").addEventListener("click", () => {
        HubUI.openDevAsset(ctx.id);
      });
      bar.querySelector("#rtk-aq-dl").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const data = await DevTools.inspectAssetAndExtractIds(ctx.id);
          const safeName = data.name.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40);
          DevTools.triggerBlobDownload(data.buffer, `${safeName}_${data.assetId}.${data.format.ext}`, data.format.mime);
          HubUI.toast(`Downloaded ${safeName}.${data.format.ext}`, "success");
        } catch (err) {
          HubUI.toast(err.message, "error");
        } finally {
          btn.disabled = false;
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
          <button type="button" class="rtk-srv-chip" data-card-region="${Utils.escapeHtml(jobId)}" title="Resolve Server Datacenter Region & PlaceVersion">${Icons.globe}<span>Region</span></button>
          <button type="button" class="rtk-srv-chip" data-card-link="${Utils.escapeHtml(jobId)}">${Icons.link}<span>Link</span></button>
          <button type="button" class="rtk-srv-chip" data-card-pin="${Utils.escapeHtml(jobId)}">${Icons.pin}<span>Pin</span></button>
          <button type="button" class="rtk-srv-chip" data-card-joinas="${Utils.escapeHtml(jobId)}">${Icons.users}<span>Join As</span></button>
        `;

        tools.querySelector("[data-card-copy]").addEventListener("click", async () => {
          await Utils.copyText(jobId);
          HubUI.toast("Copied server Job ID.", "success");
        });

        tools.querySelector("[data-card-region]").addEventListener("click", async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          const span = btn.querySelector("span");
          span.textContent = "Locating...";
          try {
            const info = await ServerRegionInspector.inspectServer(Utils.getPlaceIdFromPage(), jobId);
            span.textContent = `${info.regionLabel} · v${info.placeVersion || "?"}`;
            btn.title = `${info.regionLabel} | IP: ${info.ip || "?"} | PlaceVersion: ${info.placeVersion || "?"}`;
          } catch (err) {
            span.textContent = "Region N/A";
            HubUI.toast(err.message, "error");
          } finally {
            btn.disabled = false;
          }
        });

        tools.querySelector("[data-card-link]").addEventListener("click", async () => {
          const placeId = Utils.getPlaceIdFromPage();
          const url = `https://www.roblox.com/games/${placeId}/-?serverJobId=${jobId}`;
          await Utils.copyText(url);
          HubUI.toast("Copied shareable server link.", "success");
        });

        tools.querySelector("[data-card-pin]").addEventListener("click", async () => {
          const label = window.prompt("Optional label for pinned server:", "") ?? "";
          try {
            await PinnedServers.pin({ jobId, placeId: Utils.getPlaceIdFromPage(), label });
            HubUI.toast("Pinned server.", "success");
          } catch (err) {
            HubUI.toast(err.message, "error");
          }
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
      this.ensureHomePinnedShelf();
      this.ensureServersTabPanel();
      this.ensurePlayAsBar();
      this.ensureGameInsightsBar();
      this.ensureProfileInsightsBar();
      this.ensureAssetQuickBar();
      this.enhanceServerCards();
      ContentBlocker.applyDomFilter();
      SiteQoL.annotateRobuxPricesOnPage();
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
    SiteQoL.applySettings();
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

    Store.onChange(STORAGE_KEYS.SETTINGS, () => {
      SiteQoL.applySettings();
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
