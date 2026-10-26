import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { ToolBar } from "../../../utils/general";
import accounts from "../../../utils/vfs/accounts";

/**
 * Local Chat — on-device messages stored encrypted per account (IndexedDB meta).
 * No network required.
 */
const CHAT_KEY = "local_chat_messages";

export const Chat = () => {
  const wnapp = useSelector((state) => state.apps.code);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);
  const bottomRef = useRef(null);

  const user = accounts.getCurrentAccount();
  const name = user?.displayName || user?.username || "You";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accounts.isUnlocked()) {
        setMessages([
          {
            id: "sys",
            from: "System",
            body: "Sign in to use Local Chat. Messages are saved encrypted with your account.",
            at: Date.now(),
          },
        ]);
        setReady(true);
        return;
      }
      try {
        const saved = await accounts.loadMeta(CHAT_KEY, []);
        if (!cancelled) {
          setMessages(Array.isArray(saved) ? saved : []);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setMessages([]);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    const msg = {
      id: "m_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      from: name,
      body,
      at: Date.now(),
    };
    const next = [...messages, msg];
    setMessages(next);
    setText("");
    if (accounts.isUnlocked()) {
      try {
        await accounts.saveMeta(CHAT_KEY, next);
      } catch (e) {
        console.warn("chat save failed", e);
      }
    }
  };

  const clearChat = async () => {
    setMessages([]);
    if (accounts.isUnlocked()) {
      await accounts.saveMeta(CHAT_KEY, []);
    }
  };

  if (!wnapp) return null;

  return (
    <div
      className="floatTab dpShad"
      data-size={wnapp.size}
      data-max={wnapp.max}
      style={{
        ...(wnapp.size == "cstm" ? wnapp.dim : null),
        zIndex: wnapp.z,
        background: "var(--bg-color, #1e1e1e)",
        color: "var(--text-color, #eee)",
      }}
      data-hide={wnapp.hide}
      id={wnapp.icon + "App"}
    >
      <ToolBar
        app={wnapp.action}
        icon={wnapp.icon}
        size={wnapp.size}
        name="Local Chat"
      />
      <div className="windowScreen flex flex-col" style={{ height: "100%" }}>
        <div
          className="flex items-center justify-between px-3 py-2 text-sm border-b border-white/10"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <span>
            {accounts.isUnlocked()
              ? `Signed in as ${name} · messages encrypted on this device`
              : "Not signed in"}
          </span>
          <button
            className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
            onClick={clearChat}
          >
            Clear
          </button>
        </div>
        <div
          className="flex-grow overflow-auto p-3 space-y-2"
          style={{ minHeight: 200 }}
        >
          {!ready && <div className="text-xs opacity-50">Loading…</div>}
          {messages.map((m) => (
            <div
              key={m.id}
              className="rounded-lg px-3 py-2 max-w-[85%]"
              style={{
                background:
                  m.from === name
                    ? "rgba(0,120,215,0.35)"
                    : "rgba(255,255,255,0.08)",
                marginLeft: m.from === name ? "auto" : 0,
              }}
            >
              <div className="text-xs opacity-60 mb-0.5">
                {m.from} ·{" "}
                {new Date(m.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              <div className="text-sm whitespace-pre-wrap break-words">
                {m.body}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2 p-2 border-t border-white/10">
          <input
            className="flex-grow px-3 py-2 rounded bg-black/30 border border-white/10 outline-none text-sm"
            placeholder="Type a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
            onClick={send}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
