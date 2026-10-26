import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { ToolBar } from "../../../utils/general";
import "./assets/firefox.scss";

/**
 * Firefox browser app — multi-tab, dual mode:
 * - direct: normal iframe src (same-origin proxy / embeddable sites)
 * - srcdoc: CORS-bypass via public proxies + srcdoc injection (rmellis/Firefox-Proxy-WebClone)
 * Extension scripts inject into top-level iframe document when same-origin, or into srcdoc HTML.
 */

const PROXIES = [
  { url: "https://api.allorigins.win/raw?url=", type: "raw" },
  { url: "https://corsproxy.io/?", type: "raw" },
  { url: "https://api.codetabs.com/v1/proxy?quest=", type: "raw" },
];

const HOMEPAGE = "about:home";
const BOOKMARKS = [
  { title: "Google", url: "https://www.google.com/webhp?igu=1" },
  { title: "Bing", url: "https://www.bing.com" },
  { title: "Wikipedia", url: "https://en.wikipedia.org" },
  { title: "GitHub", url: "https://github.com" },
  { title: "Reddit", url: "https://www.reddit.com" },
  { title: "MDN", url: "https://developer.mozilla.org" },
];

const EXTENSION_BOOTSTRAP = `
(function(){
  if (window.__win11ExtBooted) return;
  window.__win11ExtBooted = true;
  window.__win11Ext = window.__win11Ext || { hooks: [], on(fn){ this.hooks.push(fn); } };
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    try {
      var abs = new URL(href, location.href).href;
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'ff-navigate', url: abs }, '*');
        e.preventDefault();
      }
    } catch(err) {}
  }, true);
})();`;

function uid() {
  return "t-" + Math.random().toString(36).slice(2, 10);
}

function normalizeUrl(input) {
  let s = String(input || "").trim();
  if (!s) return "about:blank";
  if (s === "about:home" || s === "about:srcdoc" || s === "about:blank") return s;
  if (s.startsWith("about:")) return s;
  if (s.startsWith("data:") || s.startsWith("blob:") || s.startsWith("vfs:")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.includes(".") && !s.includes(" ")) return "https://" + s;
  return "https://www.bing.com/search?q=" + encodeURIComponent(s);
}

function faviconFor(url) {
  if (!url || url.startsWith("about:") || url.startsWith("data:") || url.startsWith("blob:"))
    return "";
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
  } catch {
    return "";
  }
}

async function fetchWithTimeout(resource, ms = 9000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(resource, { signal: ctrl.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function raceProxies(targetUrl) {
  const errors = [];
  for (const proxy of PROXIES) {
    try {
      const res = await fetchWithTimeout(proxy.url + encodeURIComponent(targetUrl));
      if (!res.ok) throw new Error("status " + res.status);
      const text = await res.text();
      if (text && text.length > 40) return text;
      throw new Error("empty body");
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  throw new Error(errors.join("; ") || "All proxies failed");
}

function injectBaseAndExt(html, pageUrl) {
  let baseHref = pageUrl;
  try {
    baseHref = new URL(pageUrl).origin + "/";
  } catch {}
  const baseTag = `<base href="${baseHref}">`;
  const extTag = `<script>${EXTENSION_BOOTSTRAP}<\/script>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + baseTag + extTag);
  }
  return baseTag + extTag + html;
}

function newTab(url = HOMEPAGE) {
  return {
    id: uid(),
    url,
    title: url === HOMEPAGE ? "New Tab" : "Loading…",
    loading: false,
    mode: "auto", // auto | direct | srcdoc
    history: [url],
    histIdx: 0,
    srcdoc: null,
    useSrcdoc: false,
    error: null,
  };
}

export const Firefox = () => {
  const wnapp = useSelector((state) => state.apps.firefox);
  const [tabs, setTabs] = useState(() => [newTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0]?.id);
  const [urlDraft, setUrlDraft] = useState(HOMEPAGE);
  const [status, setStatus] = useState("Ready");
  const [forceSrcdoc, setForceSrcdoc] = useState(false);
  const [extCode, setExtCode] = useState(
    "// Example extension: runs in page top context when possible\nconsole.log('[Win11 Firefox ext] loaded', location.href);"
  );
  const [showExt, setShowExt] = useState(false);
  const iframeRefs = useRef({});

  const active = useMemo(
    () => tabs.find((t) => t.id === activeId) || tabs[0],
    [tabs, activeId]
  );

  useEffect(() => {
    if (active) setUrlDraft(active.url === HOMEPAGE ? "" : active.url);
  }, [active?.id, active?.url]);

  // Open path from File Explorer / external dispatch
  useEffect(() => {
    if (!wnapp || wnapp.hide) return;
    const payload = wnapp.url || wnapp.path;
    if (payload && typeof payload === "string") {
      openInActiveOrNew(payload);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wnapp?.url, wnapp?.path, wnapp?.hide]);

  const updateTab = useCallback((id, patch) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const navigateTab = useCallback(
    async (tabId, rawUrl, { pushHist = true } = {}) => {
      const url = normalizeUrl(rawUrl);
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      updateTab(tabId, {
        loading: true,
        error: null,
        url,
        title: url === HOMEPAGE ? "New Tab" : "Loading…",
        srcdoc: null,
        useSrcdoc: false,
      });
      setStatus("Loading " + url + "…");

      if (pushHist) {
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            const history = t.history.slice(0, t.histIdx + 1).concat(url);
            return { ...t, history, histIdx: history.length - 1, url };
          })
        );
      }

      if (url === HOMEPAGE || url === "about:blank") {
        updateTab(tabId, {
          loading: false,
          title: url === HOMEPAGE ? "New Tab" : "Blank",
          useSrcdoc: false,
          srcdoc: null,
        });
        setStatus("Ready");
        return;
      }

      // about:srcdoc forces proxy/srcdoc mode for subsequent navigations
      if (url === "about:srcdoc") {
        setForceSrcdoc(true);
        updateTab(tabId, {
          loading: false,
          title: "srcdoc mode",
          url: HOMEPAGE,
        });
        setStatus("CORS bypass mode (srcdoc) enabled");
        return;
      }

      // blob / data / vfs — always direct
      if (
        url.startsWith("blob:") ||
        url.startsWith("data:") ||
        url.startsWith("vfs:")
      ) {
        updateTab(tabId, {
          loading: false,
          useSrcdoc: false,
          srcdoc: null,
          title: "Local file",
        });
        setStatus("Ready");
        return;
      }

      const preferSrcdoc = forceSrcdoc || tab.mode === "srcdoc";

      if (!preferSrcdoc) {
        // Direct iframe mode
        updateTab(tabId, {
          loading: false,
          useSrcdoc: false,
          srcdoc: null,
          title: (() => {
            try {
              return new URL(url).hostname;
            } catch {
              return url;
            }
          })(),
        });
        setStatus("Ready (direct iframe)");
        return;
      }

      // srcdoc + proxy race
      try {
        const html = await raceProxies(url);
        const injected = injectBaseAndExt(html, url);
        const withUserExt =
          injected.replace(
            "</body>",
            `<script>${extCode}<\/script></body>`
          ) || injected + `<script>${extCode}<\/script>`;
        let title = url;
        try {
          title = new URL(url).hostname;
        } catch {}
        const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (m) title = m[1].trim().slice(0, 80);
        updateTab(tabId, {
          loading: false,
          useSrcdoc: true,
          srcdoc: withUserExt,
          title,
        });
        setStatus("Ready (srcdoc / proxy)");
      } catch (e) {
        updateTab(tabId, {
          loading: false,
          error: String(e.message || e),
          title: "Connection Failed",
          useSrcdoc: true,
          srcdoc: `<!doctype html><html><body style="font-family:sans-serif;display:grid;place-items:center;height:100vh;background:#1c1b22;color:#eee">
            <div style="max-width:420px;text-align:center">
              <h2 style="color:#f55">Secure Connection Failed</h2>
              <p>Could not load <b>${url.replace(/</g, "")}</b></p>
              <p style="opacity:.7;font-size:13px">${String(e.message || e)}</p>
            </div></body></html>`,
        });
        setStatus("Failed");
      }
    },
    [tabs, forceSrcdoc, extCode, updateTab]
  );

  const openInActiveOrNew = (url) => {
    if (!active) {
      const t = newTab(normalizeUrl(url));
      setTabs([t]);
      setActiveId(t.id);
      navigateTab(t.id, url);
      return;
    }
    navigateTab(active.id, url);
  };

  const addTab = (url = HOMEPAGE) => {
    const t = newTab(url);
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
    navigateTab(t.id, url);
  };

  const closeTab = (id, e) => {
    e?.stopPropagation?.();
    setTabs((prev) => {
      if (prev.length === 1) {
        navigateTab(prev[0].id, HOMEPAGE);
        return prev;
      }
      const next = prev.filter((t) => t.id !== id);
      if (activeId === id) {
        setActiveId(next[Math.max(0, prev.findIndex((t) => t.id === id) - 1)]?.id);
      }
      return next;
    });
  };

  const goBack = () => {
    if (!active || active.histIdx <= 0) return;
    const idx = active.histIdx - 1;
    const url = active.history[idx];
    updateTab(active.id, { histIdx: idx });
    navigateTab(active.id, url, { pushHist: false });
  };

  const goFwd = () => {
    if (!active || active.histIdx >= active.history.length - 1) return;
    const idx = active.histIdx + 1;
    const url = active.history[idx];
    updateTab(active.id, { histIdx: idx });
    navigateTab(active.id, url, { pushHist: false });
  };

  const reload = () => {
    if (active) navigateTab(active.id, active.url, { pushHist: false });
  };

  // Listen for extension link navigations from srcdoc
  useEffect(() => {
    const onMsg = (ev) => {
      if (ev?.data?.type === "ff-navigate" && ev.data.url && active) {
        navigateTab(active.id, ev.data.url);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [active, navigateTab]);

  // Try inject extension into direct iframes when same-origin
  useEffect(() => {
    if (!active || active.useSrcdoc) return;
    const frame = iframeRefs.current[active.id];
    if (!frame) return;
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const s = doc.createElement("script");
      s.textContent = EXTENSION_BOOTSTRAP + "\n" + extCode;
      (doc.head || doc.documentElement).appendChild(s);
    } catch {
      // cross-origin — expected without proxy
    }
  }, [active?.id, active?.url, active?.useSrcdoc, active?.loading, extCode]);

  if (!wnapp) return null;

  const canBack = active && active.histIdx > 0;
  const canFwd = active && active.histIdx < active.history.length - 1;

  return (
    <div
      className="firefoxApp floatTab dpShad"
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
          <div className="ff-chrome">
            <div className="ff-tabs">
              {tabs.map((t) => (
                <div
                  key={t.id}
                  className={"ff-tab" + (t.id === activeId ? " active" : "")}
                  onClick={() => setActiveId(t.id)}
                >
                  {faviconFor(t.url) ? (
                    <img className="ff-favicon" src={faviconFor(t.url)} alt="" />
                  ) : (
                    <span className="ff-favicon" />
                  )}
                  <span className="ff-title">
                    {t.loading ? "Loading…" : t.title}
                  </span>
                  <span className="ff-close" onClick={(e) => closeTab(t.id, e)}>
                    ×
                  </span>
                </div>
              ))}
              <button className="ff-newtab" title="New Tab" onClick={() => addTab()}>
                +
              </button>
            </div>

            <div className="ff-nav">
              <button className="ff-btn" disabled={!canBack} onClick={goBack} title="Back">
                ←
              </button>
              <button className="ff-btn" disabled={!canFwd} onClick={goFwd} title="Forward">
                →
              </button>
              <button className="ff-btn" onClick={reload} title="Reload">
                ↻
              </button>
              <button
                className="ff-btn"
                onClick={() => active && navigateTab(active.id, HOMEPAGE)}
                title="Home"
              >
                ⌂
              </button>
              <div className="ff-urlbar">
                <span className="ff-lock">
                  {active?.url?.startsWith("https") ? "🔒" : "ℹ️"}
                </span>
                <input
                  value={urlDraft}
                  placeholder="Search or enter address"
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && active) {
                      navigateTab(active.id, urlDraft || HOMEPAGE);
                    }
                  }}
                />
                <span
                  className="ff-mode"
                  title="Click to toggle CORS bypass (srcdoc) mode"
                  onClick={() => {
                    setForceSrcdoc((v) => !v);
                    setStatus(
                      !forceSrcdoc
                        ? "srcdoc / proxy mode ON"
                        : "direct iframe mode ON"
                    );
                  }}
                >
                  {forceSrcdoc ? "srcdoc" : "direct"}
                </span>
              </div>
              <button
                className="ff-btn"
                title="Extensions"
                onClick={() => setShowExt((v) => !v)}
              >
                🧩
              </button>
            </div>

            <div className="ff-bookmarks">
              {BOOKMARKS.map((b) => (
                <button key={b.url} onClick={() => active && navigateTab(active.id, b.url)}>
                  {b.title}
                </button>
              ))}
            </div>
          </div>

          {showExt && (
            <div
              style={{
                padding: 8,
                background: "#1c1b22",
                borderBottom: "1px solid #333",
              }}
            >
              <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.8 }}>
                Extension script (injected into srcdoc pages; same-origin direct iframes when possible)
              </div>
              <textarea
                value={extCode}
                onChange={(e) => setExtCode(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  background: "#0c0c0d",
                  color: "#eee",
                  border: "1px solid #333",
                  borderRadius: 6,
                  fontFamily: "consolas, monospace",
                  fontSize: 12,
                  padding: 8,
                }}
              />
            </div>
          )}

          <div className="ff-content">
            {tabs.map((t) => {
              const isActive = t.id === activeId;
              if (t.url === HOMEPAGE && !t.useSrcdoc) {
                return (
                  <div
                    key={t.id}
                    className="ff-home"
                    style={{ display: isActive ? "flex" : "none" }}
                  >
                    <div style={{ fontSize: 48 }}>🦊</div>
                    <h1>Firefox</h1>
                    <div className="ff-search">
                      <input
                        placeholder="Search the web"
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            navigateTab(t.id, e.target.value || HOMEPAGE);
                        }}
                      />
                      <button
                        onClick={(e) => {
                          const input = e.target.parentElement.querySelector("input");
                          navigateTab(t.id, input?.value || HOMEPAGE);
                        }}
                      >
                        Search
                      </button>
                    </div>
                    <div className="ff-tiles">
                      {BOOKMARKS.map((b) => (
                        <button key={b.url} onClick={() => navigateTab(t.id, b.url)}>
                          <img src={faviconFor(b.url)} alt="" />
                          <span>{b.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <iframe
                  key={t.id}
                  ref={(el) => {
                    iframeRefs.current[t.id] = el;
                  }}
                  title={t.title}
                  style={{ display: isActive ? "block" : "none" }}
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-downloads"
                  {...(t.useSrcdoc
                    ? { srcDoc: t.srcdoc || "" }
                    : { src: t.url === HOMEPAGE ? "about:blank" : t.url })}
                />
              );
            })}
          </div>

          <div className="ff-status">{status}</div>
        </div>
      </div>
    </div>
  );
};

export default Firefox;
