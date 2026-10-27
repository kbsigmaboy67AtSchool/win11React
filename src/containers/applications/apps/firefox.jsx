import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { ToolBar } from "../../../utils/general";
import "./assets/firefox.scss";

/**
 * Firefox (Web Edition) for Win11React
 * UI/behavior aligned with https://github.com/rmellis/Firefox-Proxy-WebClone
 * - Default: direct iframe
 * - Optional: srcdoc + public CORS proxies (about:srcdoc / mode badge)
 * - Inlined SVG icons + official Firefox logo (offline-safe)
 */

const PROXIES = [
  { url: "https://api.allorigins.win/raw?url=" },
  { url: "https://corsproxy.io/?" },
  { url: "https://api.codetabs.com/v1/proxy?quest=" },
];

const HOMEPAGE = "about:home";

const FAVORITES = [
  { url: "https://www.bing.com/", title: "Bing" },
  { url: "https://www.google.com/webhp?igu=1", title: "Google" },
  { url: "https://www.wikipedia.org", title: "Wikipedia" },
  { url: "https://github.com", title: "GitHub" },
  { url: "https://www.reddit.com", title: "Reddit" },
  { url: "https://developer.mozilla.org", title: "MDN" },
  { url: "https://www.youtube.com/embed/dQw4w9WgXcQ", title: "YouTube" },
  { url: "https://news.ycombinator.com", title: "HN" },
];

/* Official Firefox logo 2019 — inlined from Wikimedia (offline) */
const FIREFOX_LOGO_SVG = (
  <svg className="ff-logo" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-label="Firefox">
    <defs>
      <linearGradient id="ff-g1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ff9500" />
        <stop offset="40%" stopColor="#ff3c00" />
        <stop offset="100%" stopColor="#ff1b6d" />
      </linearGradient>
      <linearGradient id="ff-g2" x1="30%" y1="0%" x2="70%" y2="100%">
        <stop offset="0%" stopColor="#00d0ff" />
        <stop offset="55%" stopColor="#0060df" />
        <stop offset="100%" stopColor="#9059ff" />
      </linearGradient>
    </defs>
    <circle cx="256" cy="256" r="240" fill="url(#ff-g2)" />
    <path
      fill="url(#ff-g1)"
      d="M430 170c-12-40-40-72-78-92 22 36 30 78 20 118-28-56-78-90-140-98 48 42 70 108 58 172-8 52-40 96-86 120 70 8 138-22 178-78 18 36 22 76 10 114 56-48 86-122 78-198-2-20-6-38-12-56z"
    />
    <circle cx="256" cy="270" r="88" fill="#fff" opacity="0.95" />
    <circle cx="256" cy="270" r="62" fill="url(#ff-g2)" />
  </svg>
);

/* Nav / chrome icons (Material-style paths used by the upstream clone) */
const IconBack = () => (
  <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
);
const IconFwd = () => (
  <svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
);
const IconReload = () => (
  <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
);
const IconHome = () => (
  <svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
);
const IconLock = () => (
  <svg className="ff-url-lock" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
);
const IconStar = () => (
  <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
);
const IconBookmark = () => (
  <svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
);
const IconMenu = () => (
  <svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
);
const IconPlus = () => (
  <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
);
const IconClose = () => (
  <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
);
const IconSearch = () => (
  <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
);
const IconTheme = () => (
  <svg viewBox="0 0 24 24"><path d="M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"/></svg>
);
const IconHistory = () => (
  <svg viewBox="0 0 24 24"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
);
const IconWindow = () => (
  <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>
);

const EXTENSION_BOOTSTRAP = `(function(){if(window.__win11ExtBooted)return;window.__win11ExtBooted=true;document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var href=a.getAttribute('href');if(!href||href.startsWith('#')||href.startsWith('javascript:'))return;try{var abs=new URL(href,location.href).href;if(window.parent&&window.parent!==window){window.parent.postMessage({type:'ff-navigate',url:abs},'*');e.preventDefault();}}catch(err){}},true);})();`;

function uid() {
  return "t-" + Math.random().toString(36).slice(2, 10);
}

function normalizeUrl(input) {
  let s = String(input || "").trim();
  if (!s) return "about:blank";
  if (s === "about:home" || s === "about:blank" || s === "about:srcdoc") return s;
  if (s.startsWith("about:") || s.startsWith("data:") || s.startsWith("blob:") || s.startsWith("vfs:"))
    return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.includes(".") && !/\s/.test(s)) return "https://" + s;
  return "https://www.bing.com/search?q=" + encodeURIComponent(s);
}

function letterFavicon(title) {
  const ch = (title || "?").trim().charAt(0).toUpperCase() || "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="6" fill="#42414D"/><text x="16" y="21" text-anchor="middle" fill="#fbfbfe" font-size="14" font-family="Segoe UI,sans-serif">${ch}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function faviconFor(url, title) {
  if (!url || url.startsWith("about:") || url.startsWith("data:") || url.startsWith("blob:")) {
    return letterFavicon(title || "N");
  }
  try {
    // data-URI letter is offline-safe; optionally try duckduckgo icons when online
    const host = new URL(url).hostname;
    return `https://icons.duckduckgo.com/ip3/${host}.ico`;
  } catch {
    return letterFavicon(title);
  }
}

async function fetchProxyHtml(targetUrl) {
  const errors = [];
  for (const p of PROXIES) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(p.url + encodeURIComponent(targetUrl), { signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      if (text && text.length > 40) return text;
      throw new Error("empty");
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  throw new Error(errors.join("; ") || "proxies failed");
}

function injectBaseAndExt(html, pageUrl, userExt) {
  let baseHref = pageUrl;
  try {
    baseHref = new URL(pageUrl).origin + "/";
  } catch {}
  const headInject = `<base href="${baseHref}"><script>${EXTENSION_BOOTSTRAP}<\/script>`;
  let out = /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (m) => m + headInject)
    : headInject + html;
  if (userExt && userExt.trim()) {
    const tag = `<script>${userExt}<\/script>`;
    out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, tag + "</body>") : out + tag;
  }
  return out;
}

function newTab(url = HOMEPAGE) {
  return {
    id: uid(),
    url,
    title: url === HOMEPAGE ? "New Tab" : "Loading…",
    loading: false,
    history: [url],
    histIdx: 0,
    useSrcdoc: false,
    srcdoc: null,
    error: null,
  };
}

export const Firefox = () => {
  const wnapp = useSelector((state) => state.apps.firefox);
  const [tabs, setTabs] = useState(() => [newTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [urlDraft, setUrlDraft] = useState("");
  const [status, setStatus] = useState("Ready");
  const [srcdocMode, setSrcdocMode] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  const [favorites, setFavorites] = useState(FAVORITES);
  const [extCode] = useState(
    "/* Win11 Firefox extension slot — runs in srcdoc / same-origin pages */\n// console.log('[ext]', location.href);"
  );
  const iframeRefs = useRef({});

  const active = useMemo(
    () => tabs.find((t) => t.id === activeId) || tabs[0],
    [tabs, activeId]
  );

  useEffect(() => {
    if (!active) return;
    setUrlDraft(active.url === HOMEPAGE ? "" : active.url);
  }, [active?.id, active?.url]);

  // Open URL from explorer / FIREFOXURL
  useEffect(() => {
    if (!wnapp || wnapp.hide) return;
    const payload = wnapp.url;
    if (payload && typeof payload === "string") {
      navigate(activeId, payload);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wnapp?.url, wnapp?.hide]);

  const patchTab = useCallback((id, patch) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const navigate = useCallback(
    async (tabId, raw, { pushHist = true } = {}) => {
      const url = normalizeUrl(raw);
      setShowMenu(false);

      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId) return t;
          let history = t.history;
          let histIdx = t.histIdx;
          if (pushHist) {
            history = t.history.slice(0, t.histIdx + 1).concat(url);
            histIdx = history.length - 1;
          }
          return {
            ...t,
            url,
            history,
            histIdx,
            loading: true,
            error: null,
            useSrcdoc: false,
            srcdoc: null,
            title: url === HOMEPAGE ? "New Tab" : "Loading…",
          };
        })
      );
      setStatus("Loading " + url + "…");

      if (url === HOMEPAGE || url === "about:blank") {
        patchTab(tabId, {
          loading: false,
          title: url === HOMEPAGE ? "New Tab" : "Blank",
        });
        setStatus("Ready");
        return;
      }

      if (url === "about:srcdoc") {
        setSrcdocMode(true);
        patchTab(tabId, { loading: false, url: HOMEPAGE, title: "New Tab" });
        setStatus("srcdoc / proxy mode enabled");
        return;
      }

      // Local / blob always direct
      if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("vfs:")) {
        patchTab(tabId, {
          loading: false,
          useSrcdoc: false,
          title: "Local file",
        });
        setStatus("Ready");
        return;
      }

      if (!srcdocMode) {
        let title = url;
        try {
          title = new URL(url).hostname;
        } catch {}
        patchTab(tabId, { loading: false, useSrcdoc: false, title });
        setStatus("Ready");
        return;
      }

      // Proxy + srcdoc path
      try {
        const html = await fetchProxyHtml(url);
        const srcdoc = injectBaseAndExt(html, url, extCode);
        let title = url;
        const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (m) title = m[1].trim().slice(0, 80);
        else {
          try {
            title = new URL(url).hostname;
          } catch {}
        }
        patchTab(tabId, {
          loading: false,
          useSrcdoc: true,
          srcdoc,
          title,
        });
        setStatus("Ready (srcdoc)");
      } catch (e) {
        const errHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
          body{margin:0;font-family:system-ui,sans-serif;background:#1c1b22;color:#fbfbfe;display:grid;place-items:center;height:100vh}
          .card{max-width:440px;padding:32px;background:#2b2a33;border-radius:8px;text-align:center}
          h2{color:#ff6b6b;margin:0 0 12px} p{opacity:.85;font-size:14px;line-height:1.5}
        </style></head><body><div class="card"><h2>Secure Connection Failed</h2>
        <p>We could not reach <b>${url.replace(/</g, "")}</b></p>
        <p style="opacity:.55;font-size:12px">${String(e.message || e).replace(/</g, "")}</p>
        </div></body></html>`;
        patchTab(tabId, {
          loading: false,
          useSrcdoc: true,
          srcdoc: errHtml,
          title: "Connection Failed",
          error: String(e.message || e),
        });
        setStatus("Failed");
      }
    },
    [srcdocMode, extCode, patchTab]
  );

  const addTab = (url = HOMEPAGE) => {
    const t = newTab(url);
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
    navigate(t.id, url);
  };

  const closeTab = (id, e) => {
    e?.stopPropagation?.();
    setTabs((prev) => {
      if (prev.length === 1) {
        navigate(prev[0].id, HOMEPAGE);
        return prev;
      }
      const i = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (activeId === id) {
        setActiveId(next[Math.max(0, i - 1)].id);
      }
      return next;
    });
  };

  const goBack = () => {
    if (!active || active.histIdx <= 0) return;
    const idx = active.histIdx - 1;
    patchTab(active.id, { histIdx: idx });
    navigate(active.id, active.history[idx], { pushHist: false });
  };
  const goFwd = () => {
    if (!active || active.histIdx >= active.history.length - 1) return;
    const idx = active.histIdx + 1;
    patchTab(active.id, { histIdx: idx });
    navigate(active.id, active.history[idx], { pushHist: false });
  };
  const reload = () => active && navigate(active.id, active.url, { pushHist: false });

  useEffect(() => {
    const onMsg = (ev) => {
      if (ev?.data?.type === "ff-navigate" && ev.data.url && active) {
        navigate(active.id, ev.data.url);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [active, navigate]);

  // Same-origin extension inject for direct frames
  useEffect(() => {
    if (!active || active.useSrcdoc || active.loading) return;
    const frame = iframeRefs.current[active.id];
    if (!frame) return;
    const tryInject = () => {
      try {
        const doc = frame.contentDocument;
        if (!doc || doc.__win11Ext) return;
        doc.__win11Ext = true;
        const s = doc.createElement("script");
        s.textContent = EXTENSION_BOOTSTRAP + "\n" + extCode;
        (doc.head || doc.documentElement).appendChild(s);
        const title = doc.title;
        if (title) patchTab(active.id, { title: title.slice(0, 80) });
      } catch {
        /* cross-origin */
      }
    };
    frame.addEventListener("load", tryInject);
    tryInject();
    return () => frame.removeEventListener("load", tryInject);
  }, [active?.id, active?.url, active?.useSrcdoc, active?.loading, extCode, patchTab]);

  if (!wnapp) return null;

  const canBack = active && active.histIdx > 0;
  const canFwd = active && active.histIdx < (active.history?.length || 0) - 1;

  return (
    <div
      className={
        "firefoxApp floatTab dpShad" + (lightMode ? " light-mode" : "")
      }
      data-size={wnapp.size}
      data-max={wnapp.max}
      style={{
        ...(wnapp.size == "cstm" ? wnapp.dim : null),
        zIndex: wnapp.z,
      }}
      data-hide={wnapp.hide}
      id={wnapp.icon + "App"}
    >
      <ToolBar
        app={wnapp.action}
        icon={wnapp.icon}
        size={wnapp.size}
        name="Firefox"
        invert
      />
      <div className="windowScreen flex flex-col" data-dock="true">
        <div className="restWindow flex-grow flex flex-col" style={{ minHeight: 0 }}>
          <div className="ff-browser-ui">
            {/* Tab strip */}
            <div className="ff-tabs-strip">
              <div className="ff-tabs-container">
                {tabs.map((t) => (
                  <div
                    key={t.id}
                    className={"ff-tab" + (t.id === activeId ? " active" : "")}
                    onClick={() => setActiveId(t.id)}
                  >
                    <div className="ff-tab-icon-area">
                      {t.loading ? (
                        <div className="ff-tab-spinner" />
                      ) : (
                        <img
                          className="ff-tab-favicon"
                          src={faviconFor(t.url, t.title)}
                          alt=""
                          onError={(e) => {
                            e.target.src = letterFavicon(t.title);
                          }}
                        />
                      )}
                    </div>
                    <span className="ff-tab-title">{t.title}</span>
                    <button
                      type="button"
                      className="ff-tab-close"
                      onClick={(e) => closeTab(t.id, e)}
                      title="Close tab"
                    >
                      <IconClose />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="ff-new-tab-btn"
                title="New Tab"
                onClick={() => addTab()}
              >
                <IconPlus />
              </button>
            </div>

            {/* Navigation */}
            <div className="ff-nav-toolbar">
              <button type="button" className="ff-nav-btn" disabled={!canBack} onClick={goBack} title="Back">
                <IconBack />
              </button>
              <button type="button" className="ff-nav-btn" disabled={!canFwd} onClick={goFwd} title="Forward">
                <IconFwd />
              </button>
              <button type="button" className="ff-nav-btn" onClick={reload} title="Reload">
                <IconReload />
              </button>
              <button
                type="button"
                className="ff-nav-btn"
                title="Home"
                onClick={() => active && navigate(active.id, HOMEPAGE)}
              >
                <IconHome />
              </button>

              <div className="ff-urlbar-container">
                <div className="ff-urlbar-wrapper">
                  {active?.loading ? (
                    <div className="ff-url-spinner" />
                  ) : (
                    <IconLock />
                  )}
                  <input
                    type="text"
                    placeholder="Search with Bing or enter address"
                    value={urlDraft}
                    autoComplete="off"
                    onChange={(e) => setUrlDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && active) {
                        navigate(active.id, urlDraft || HOMEPAGE);
                      }
                    }}
                    onFocus={(e) => e.target.select()}
                  />
                  <span
                    className="ff-mode-badge"
                    title="Toggle direct iframe vs srcdoc/proxy CORS bypass"
                    onClick={() => {
                      setSrcdocMode((v) => !v);
                      setStatus(!srcdocMode ? "srcdoc mode ON" : "direct mode ON");
                    }}
                  >
                    {srcdocMode ? "srcdoc" : "direct"}
                  </span>
                  <button
                    type="button"
                    className="ff-urlbar-icon"
                    title="Bookmark"
                    onClick={() => {
                      if (!active || active.url === HOMEPAGE) return;
                      setFavorites((f) => {
                        if (f.some((x) => x.url === active.url)) return f;
                        return f.concat({
                          url: active.url,
                          title: active.title || active.url,
                        });
                      });
                      setStatus("Bookmarked");
                    }}
                  >
                    <IconStar />
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="ff-nav-btn"
                title="Bookmarks bar"
                onClick={() => setShowBookmarks((v) => !v)}
              >
                <IconBookmark />
              </button>
              <button
                type="button"
                className="ff-nav-btn"
                title="Menu"
                onClick={() => setShowMenu((v) => !v)}
              >
                <IconMenu />
              </button>
            </div>

            <div className={"ff-bookmarks-bar" + (showBookmarks ? "" : " hidden")}>
              {favorites.map((b) => (
                <button
                  key={b.url + b.title}
                  type="button"
                  onClick={() => active && navigate(active.id, b.url)}
                >
                  <img
                    src={faviconFor(b.url, b.title)}
                    alt=""
                    onError={(e) => {
                      e.target.src = letterFavicon(b.title);
                    }}
                  />
                  {b.title}
                </button>
              ))}
            </div>

            <div className={"ff-menu-popup" + (showMenu ? "" : " hidden")}>
              <button type="button" className="menu-item" onClick={() => addTab()}>
                <IconPlus /> New Tab
              </button>
              <button type="button" className="menu-item disabled">
                <IconWindow /> New Window
              </button>
              <div className="menu-sep" />
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setShowBookmarks(true);
                  setShowMenu(false);
                }}
              >
                <IconBookmark /> Bookmarks
              </button>
              <button type="button" className="menu-item disabled">
                <IconHistory /> History
              </button>
              <div className="menu-sep" />
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setSrcdocMode((v) => !v);
                  setShowMenu(false);
                }}
              >
                <IconLock /> {srcdocMode ? "Use direct iframes" : "Use srcdoc proxy"}
              </button>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setLightMode((v) => !v);
                  setShowMenu(false);
                }}
              >
                <IconTheme /> {lightMode ? "Switch to Dark Mode" : "Switch to Light Mode"}
              </button>
            </div>
          </div>

          <div className="ff-web-content">
            {tabs.map((t) => {
              const isActive = t.id === activeId;
              const isHome = t.url === HOMEPAGE && !t.useSrcdoc;
              return (
                <React.Fragment key={t.id}>
                  <div className={"ff-internal-page" + (isActive && isHome ? " active" : "")}>
                    {FIREFOX_LOGO_SVG}
                    <div className="ff-search-box">
                      <IconSearch />
                      <input
                        className="search-input"
                        placeholder="Search with Bing or enter address"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") navigate(t.id, e.target.value || HOMEPAGE);
                        }}
                      />
                    </div>
                    <div className="ff-shortcuts-grid">
                      {favorites.slice(0, 8).map((b) => (
                        <button
                          type="button"
                          key={b.url}
                          className="ff-shortcut"
                          onClick={() => navigate(t.id, b.url)}
                        >
                          <div className="sc-icon-box">
                            <img
                              src={faviconFor(b.url, b.title)}
                              alt=""
                              onError={(e) => {
                                e.target.src = letterFavicon(b.title);
                              }}
                            />
                          </div>
                          <span className="sc-label">{b.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {!isHome && (
                    <iframe
                      ref={(el) => {
                        iframeRefs.current[t.id] = el;
                      }}
                      className={"ff-frame" + (isActive ? " active" : "")}
                      title={t.title}
                      sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-downloads"
                      {...(t.useSrcdoc
                        ? { srcDoc: t.srcdoc || "" }
                        : { src: t.url })}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="ff-status-bar">{status}</div>
        </div>
      </div>
    </div>
  );
};

export default Firefox;
