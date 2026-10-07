"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowLeft, MessageCircle, Search, Send } from "lucide-react";

import { DashboardShell } from "../components/DashboardShell";
import { formatDateTime } from "../lib/format";
import type {
  ComplianceMessage,
  PriceComplianceCase,
} from "../lib/priceCompliance";
import { useRealtimeCollection } from "../lib/useFirestoreCollection";
import {
  buildThreads,
  markThreadRead,
  sendAdminMessageToVendor,
} from "../lib/vendorMessages";
import styles from "./page.module.css";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name.trim().slice(0, 2) || "V").toUpperCase();
}

function shortTime(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const diffDays = (now.getTime() - ms) / 86_400_000;
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function MessagesPage() {
  const messagesQuery = useRealtimeCollection<ComplianceMessage>(
    "price_compliance_messages",
    "createdAt",
    { limit: 1000 },
  );
  const casesQuery = useRealtimeCollection<PriceComplianceCase>(
    "price_compliance",
    "createdAt",
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [draft, setDraft] = useState("");
  const [caseId, setCaseId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const threads = useMemo(
    () => buildThreads(messagesQuery.data),
    [messagesQuery.data],
  );

  const visibleThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (unreadOnly && t.unread === 0) return false;
      if (!q) return true;
      return (
        t.vendorName.toLowerCase().includes(q) ||
        t.last.message.toLowerCase().includes(q)
      );
    });
  }, [threads, search, unreadOnly]);

  const selected = useMemo(
    () => threads.find((t) => t.vendorId === selectedId) || null,
    [threads, selectedId],
  );

  const vendorCases = useMemo(
    () =>
      casesQuery.data.filter((c) => selected && c.vendorId === selected.vendorId),
    [casesQuery.data, selected],
  );

  const totalUnread = useMemo(
    () => threads.reduce((sum, t) => sum + t.unread, 0),
    [threads],
  );

  // Deep link: /messages?vendor=<vendorId>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("vendor");
    if (id) setSelectedId(id);
  }, []);

  // Reset composer when switching conversation; default to the latest case.
  useEffect(() => {
    setDraft("");
    setError("");
    setCaseId("");
  }, [selectedId]);

  useEffect(() => {
    if (!selected) return;
    const lastCase = [...selected.messages]
      .reverse()
      .find((m) => m.caseId)?.caseId;
    if (lastCase) setCaseId((prev) => prev || lastCase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Mark vendor messages as read while the thread is open.
  useEffect(() => {
    if (selected && selected.unread > 0) {
      markThreadRead(selected.messages).catch((e) =>
        console.error("Failed to mark messages as read:", e),
      );
    }
  }, [selected]);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [selected?.messages.length, selectedId]);

  async function handleSend() {
    if (!selected || sending) return;
    const text = draft.trim();
    if (!text) return;

    const linked = vendorCases.find((c) => c.id === caseId);

    setSending(true);
    setError("");
    try {
      await sendAdminMessageToVendor({
        vendorId: selected.vendorId,
        vendorName: selected.vendorName,
        message: text,
        caseId: linked?.id,
        productId: linked?.productId,
        productName: linked?.productName,
      });
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <DashboardShell
      title="Messages"
      description="Chat with vendors about price notices and other concerns."
    >
      <div
        className={`${styles.messenger} ${selected ? styles.hasSelection : ""}`}
      >
        {/* ── Conversation list ── */}
        <aside className={styles.listPane}>
          <div className={styles.listHead}>
            <h2>
              Chats
              {totalUnread > 0 && (
                <span className={styles.countPill}>{totalUnread}</span>
              )}
            </h2>

            <label className={styles.searchBox}>
              <Search size={15} />
              <input
                type="search"
                placeholder="Search vendors or messages"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>

            <div className={styles.filters}>
              <button
                type="button"
                className={!unreadOnly ? styles.filterActive : styles.filter}
                onClick={() => setUnreadOnly(false)}
              >
                All
              </button>
              <button
                type="button"
                className={unreadOnly ? styles.filterActive : styles.filter}
                onClick={() => setUnreadOnly(true)}
              >
                Unread
              </button>
            </div>
          </div>

          <ul className={styles.threadList}>
            {messagesQuery.loading ? (
              <li className={styles.listEmpty}>Loading conversations…</li>
            ) : visibleThreads.length === 0 ? (
              <li className={styles.listEmpty}>
                {threads.length === 0
                  ? "No vendor messages yet."
                  : "No conversations match."}
              </li>
            ) : (
              visibleThreads.map((t) => (
                <li key={t.vendorId}>
                  <button
                    type="button"
                    className={`${styles.thread} ${
                      t.vendorId === selectedId ? styles.threadActive : ""
                    }`}
                    onClick={() => setSelectedId(t.vendorId)}
                  >
                    <span className={styles.avatar}>{initials(t.vendorName)}</span>
                    <span className={styles.threadText}>
                      <span className={styles.threadTop}>
                        <strong className={t.unread ? styles.unreadText : ""}>
                          {t.vendorName}
                        </strong>
                        <small>{shortTime(t.last.createdAt)}</small>
                      </span>
                      <span
                        className={`${styles.preview} ${
                          t.unread ? styles.unreadText : ""
                        }`}
                      >
                        {t.last.senderRole === "admin" ? "You: " : ""}
                        {t.last.message}
                      </span>
                    </span>
                    {t.unread > 0 && <span className={styles.dot}>{t.unread}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        {/* ── Chat pane ── */}
        <section className={styles.chatPane}>
          {!selected ? (
            <div className={styles.placeholder}>
              <MessageCircle size={42} />
              <strong>Select a conversation</strong>
              <p>Vendor messages from price notices appear here.</p>
            </div>
          ) : (
            <>
              <header className={styles.chatHead}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => setSelectedId(null)}
                  aria-label="Back to chats"
                >
                  <ArrowLeft size={18} />
                </button>
                <span className={styles.avatar}>{initials(selected.vendorName)}</span>
                <div>
                  <strong>{selected.vendorName}</strong>
                  <small>
                    {selected.messages.length} message
                    {selected.messages.length === 1 ? "" : "s"}
                  </small>
                </div>
              </header>

              <div className={styles.messages}>
                {selected.messages.map((m) => {
                  const mine = m.senderRole === "admin";
                  return (
                    <div
                      key={m.id}
                      className={`${styles.row} ${mine ? styles.rowMine : ""}`}
                    >
                      <div
                        className={`${styles.bubble} ${
                          mine ? styles.bubbleMine : styles.bubbleTheirs
                        }`}
                      >
                        {m.productName && (
                          <span className={styles.tag}>
                            {m.productName}
                            {m.caseId ? ` · #${m.caseId.slice(-4).toUpperCase()}` : ""}
                          </span>
                        )}
                        <p>{m.message}</p>
                        <time>{m.createdAt ? formatDateTime(m.createdAt) : ""}</time>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <footer className={styles.composer}>
                {vendorCases.length > 0 && (
                  <label className={styles.caseSelect}>
                    <span>Regarding</span>
                    <select
                      value={caseId}
                      onChange={(e) => setCaseId(e.target.value)}
                    >
                      <option value="">General message</option>
                      {vendorCases.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.productName} · {c.status}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.inputRow}>
                  <textarea
                    rows={1}
                    placeholder="Type a message…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    type="button"
                    className={styles.sendBtn}
                    disabled={sending || !draft.trim()}
                    onClick={() => void handleSend()}
                    aria-label="Send message"
                  >
                    <Send size={17} />
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
