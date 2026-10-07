import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Glyph } from "../../../components/Glyph";
import { command, providerAction } from "../../../core/bridge";
import { useT, type Translate } from "../../../core/i18n";
import { useIsland } from "../../../core/island";
import { ClaudeIcon } from "../../ai-agents/claude/ClaudeIcon";
import {
  addAttachments,
  ASK_PROVIDER,
  CLAUDE_ORANGE,
  focusRequest,
  pendingAttachments,
  type AskState,
  type Attachment,
} from "../store";
import { Formatted } from "./Formatted";

/** "Ask Claude": a conversation with Claude Code (headless) inside the island. */
export function AskPanel({ state }: { state: AskState | undefined }) {
  const t = useT();
  const island = useIsland();
  const attachments = pendingAttachments.use();
  const focusPending = focusRequest.use();
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const messages = state?.messages ?? [];
  const running = !!state?.running;

  // On screen: no "Claude answered" alert, and the answer counts as read.
  useEffect(() => {
    providerAction(ASK_PROVIDER, "viewing", true);
    return () => {
      providerAction(ASK_PROVIDER, "viewing", false);
      island.keepOpen(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global shortcut / "ask about this file": take the keyboard.
  useEffect(() => {
    if (!focusPending) return;
    focusRequest.set(false);
    takeKeyboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPending]);

  // Follow the newest text.
  const last = messages[messages.length - 1];
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.text]);

  // The textarea grows with the question.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [draft]);

  function takeKeyboard() {
    island.keepOpen(true);
    command("focus_island");
    window.setTimeout(() => input.current?.focus(), 30);
  }

  function send() {
    if (running || (!draft.trim() && !attachments.length)) return;
    providerAction(ASK_PROVIDER, "send", { text: draft, attachments });
    setDraft("");
    pendingAttachments.set([]);
    setCopied(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      // Enter sends; Shift+Enter breaks the line.
      e.preventDefault();
      send();
    } else if (e.key === "Escape") {
      // Back to the app you were in; Claude keeps answering meanwhile.
      e.preventDefault();
      input.current?.blur();
      command("restore_focus");
      island.collapse();
    }
  }

  async function screenshot() {
    const shot = await providerAction<Attachment>(ASK_PROVIDER, "screenshot").catch(() => undefined);
    if (shot) addAttachments([shot]);
    takeKeyboard();
  }

  if (state && !state.available) {
    return (
      <div className="ask-panel">
        <div className="ask-empty">{t("ask.notFound")}</div>
      </div>
    );
  }

  const lastAnswer = !running && last && !last.fromUser && !last.error && last.text ? last.text : null;

  return (
    <div className="ask-panel" onClick={(e) => e.stopPropagation()}>
      <div className="ask-head">
        <motion.span
          className="ask-logo"
          animate={running ? { rotate: 360 } : { rotate: 0 }}
          transition={running ? { duration: 2.4, repeat: Infinity, ease: "linear" } : { duration: 0.3 }}
        >
          <ClaudeIcon size={16} />
        </motion.span>
        <span className="ask-title">Claude</span>
        {running && state?.status && <span className="ask-status">{statusText(t, state.status)}</span>}
        <span className="ask-spacer" />
        {messages.length > 0 && !running && (
          <button className="ask-text-btn" onClick={() => providerAction(ASK_PROVIDER, "new")}>
            {t("ask.new")}
          </button>
        )}
      </div>

      {messages.length === 0 ? (
        <p className="ask-hint">
          {t("ask.hint")} {state?.hotkey && t("ask.hotkey", { keys: state.hotkey })}
        </p>
      ) : (
        <div className="ask-messages" ref={scroller} data-scroll>
          {messages.map((m, i) =>
            m.fromUser ? (
              <div key={i} className="ask-user">
                {m.attachments.map((a) =>
                  a.isImage && a.thumb ? (
                    <img key={a.path} className="ask-user-image" src={a.thumb} alt="" />
                  ) : (
                    <span key={a.path} className="ask-user-file">
                      📎 {a.label ?? a.name}
                    </span>
                  ),
                )}
                <span>{m.text}</span>
              </div>
            ) : (
              <div key={i} className={`ask-answer ${m.error ? "is-error" : ""}`}>
                {m.text ? <Formatted text={m.text} /> : running && i === messages.length - 1 ? <span className="ask-dots">…</span> : null}
              </div>
            ),
          )}
          {lastAnswer && (
            <button
              className="ask-text-btn ask-copy"
              onClick={() => {
                navigator.clipboard.writeText(lastAnswer).then(() => setCopied(true));
              }}
            >
              {copied ? t("ask.copied") : t("ask.copy")}
            </button>
          )}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="ask-chips">
          {attachments.map((a) => (
            <span key={a.path} className="ask-chip" title={a.path}>
              {a.thumb ? <img src={a.thumb} alt="" /> : <Glyph name="folder" size={13} />}
              <span className="ask-chip-name">{a.label ?? a.name}</span>
              <button
                title={t("ask.remove")}
                onClick={() => pendingAttachments.set((prev) => prev.filter((p) => p.path !== a.path))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="ask-field" data-no-drag>
        <button className="ask-icon-btn" title={t("ask.screenshot")} onClick={screenshot}>
          <Glyph name="camera" size={14} />
        </button>
        <textarea
          ref={input}
          rows={1}
          value={draft}
          placeholder={t("ask.placeholder")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onMouseDown={takeKeyboard}
          onFocus={() => island.keepOpen(true)}
          onBlur={() => island.keepOpen(false)}
        />
        <button
          className={`ask-send ${running ? "is-stop" : ""}`}
          style={{ background: CLAUDE_ORANGE }}
          title={running ? t("ask.stop") : t("ask.send")}
          disabled={!running && !draft.trim() && !attachments.length}
          onClick={() => (running ? providerAction(ASK_PROVIDER, "cancel") : send())}
        >
          {running ? <span className="ask-stop-square" /> : <Glyph name="upload" size={13} />}
        </button>
      </div>
    </div>
  );
}

export function statusText(t: Translate, status: NonNullable<AskState["status"]>) {
  if (status.kind !== "tool") return t(`ask.status.${status.kind}`);
  switch (status.arg) {
    case "WebSearch":
      return t("ask.status.webSearch");
    case "WebFetch":
      return t("ask.status.webFetch");
    case "Read":
      return t("ask.status.read");
    case "Glob":
    case "Grep":
      return t("ask.status.search");
    default:
      return t("ask.status.tool", { tool: status.arg ?? "" });
  }
}
