import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageSquare, Send } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAsync } from "../hooks/useAsync";
import { useLanguage } from "../hooks/useLanguage";
import * as chatApi from "../api/chat";
import { normalizeError } from "../api/client";
import { pickLocalizedText } from "../utils/localizedText";
import { Card } from "../components/common/Card";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import "./ChatPage.css";

const POLL_INTERVAL_MS = 5000;
const MAX_MESSAGE_LENGTH = 2000;

export function ChatPage() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const location = useLocation();

  const [activeId, setActiveId] = useState(location.state?.conversationId || null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messageError, setMessageError] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const bottomRef = useRef(null);

  const {
    data: conversations,
    loading,
    error,
    run: refetchConversations,
  } = useAsync(chatApi.listConversations);

  const active = conversations?.find((conversation) => conversation._id === activeId) || null;

  const pullMessages = useCallback(
    async (conversationId, { reset = false } = {}) => {
      if (!conversationId) return;
      try {
        const latest = reset ? null : messages[messages.length - 1]?.createdAt;
        const incoming = await chatApi.listMessages(conversationId, latest || undefined);
        if (reset) {
          setMessages(incoming);
        } else if (incoming.length) {
          setMessages((previous) => {
            const seen = new Set(previous.map((message) => message._id));
            return [...previous, ...incoming.filter((message) => !seen.has(message._id))];
          });
        }
        setMessageError(null);
      } catch (err) {
        setMessageError(normalizeError(err));
      }
    },
    [messages]
  );

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setLoadingThread(true);
    setMessages([]);
    (async () => {
      try {
        const incoming = await chatApi.listMessages(activeId);
        if (cancelled) return;
        setMessages(incoming);
        setMessageError(null);
        await chatApi.markRead(activeId).catch(() => {});
        if (!cancelled) refetchConversations();
      } catch (err) {
        if (!cancelled) setMessageError(normalizeError(err));
      } finally {
        if (!cancelled) setLoadingThread(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return undefined;
    const timer = setInterval(() => pullMessages(activeId), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activeId, pullMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const handleSend = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !activeId) return;
    setSending(true);
    setMessageError(null);
    try {
      const sent = await chatApi.sendMessage(activeId, text);
      setMessages((previous) => [...previous, sent]);
      setDraft("");
      refetchConversations();
    } catch (err) {
      setMessageError(normalizeError(err));
    } finally {
      setSending(false);
    }
  };

  const conversationTitle = (conversation) => {
    const job = conversation.jobId;
    return job?.titleText || pickLocalizedText(job?.title, language, job?.originalLanguage) || "Job";
  };

  return (
    <div className="container chat-page page-animate">
      <div className="chat-header">
        <h1>
          <MessageSquare size={24} aria-hidden="true" /> <span>{t("nav.messages")}</span>
        </h1>
      </div>

      {loading && <Spinner label={t("loadingConversations")} />}
      {!loading && error && <ErrorBanner error={error} onRetry={refetchConversations} />}

      {!loading && !error && conversations?.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          title={t("noConversationsYet")}
          description={t("noConversationsDesc")}
        />
      )}

      {!loading && !error && conversations?.length > 0 && (
        <div className="chat-layout">
          <Card className="chat-list animated-card">
            {conversations.map((conversation) => (
              <button
                key={conversation._id}
                type="button"
                className={`chat-list-item ${conversation._id === activeId ? "active" : ""}`}
                onClick={() => setActiveId(conversation._id)}
              >
                <span className="chat-list-name">
                  {conversation.counterpartName || t("conversation")}
                  {conversation.unreadCount > 0 && (
                    <span className="chat-unread" aria-label={`${conversation.unreadCount} unread`}>
                      {conversation.unreadCount}
                    </span>
                  )}
                </span>
                <span className="chat-list-job">{conversationTitle(conversation)}</span>
                {conversation.lastMessage && (
                  <span className="chat-list-preview">{conversation.lastMessage}</span>
                )}
              </button>
            ))}
          </Card>

          <Card className="chat-thread animated-card">
            {!active && <p className="chat-thread-hint">{t("chooseConversationHint")}</p>}

            {active && (
              <>
                <div className="chat-thread-head">
                  <strong>{active.counterpartName || t("conversation")}</strong>
                  <span>{conversationTitle(active)}</span>
                </div>

                {messageError && <ErrorBanner error={messageError} />}
                {loadingThread && <Spinner label={t("loadingMessages")} />}

                {!loadingThread && messages.length === 0 && (
                  <p className="chat-thread-hint">{t("noMessagesYet")}</p>
                )}

                <ul className="chat-messages">
                  {messages.map((message) => {
                    const mine = String(message.senderId) === String(user?._id);
                    return (
                      <li key={message._id} className={mine ? "mine" : "theirs"}>
                        <span className="chat-bubble">{message.text}</span>
                        <span className="chat-time">
                          {new Date(message.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {mine && message.isRead ? ` · ${t("read")}` : ""}
                        </span>
                      </li>
                    );
                  })}
                  <li ref={bottomRef} aria-hidden="true" />
                </ul>

                <form className="chat-composer" onSubmit={handleSend}>
                  <input
                    type="text"
                    value={draft}
                    maxLength={MAX_MESSAGE_LENGTH}
                    placeholder={t("writeMessagePlaceholder")}
                    onChange={(event) => setDraft(event.target.value)}
                    aria-label={t("message")}
                  />
                  <button type="submit" className="btn btn-primary animated-button" disabled={!draft.trim() || sending}>
                    <Send size={16} aria-hidden="true" /> <span>{sending ? t("sending") : t("chat.send")}</span>
                  </button>
                </form>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
