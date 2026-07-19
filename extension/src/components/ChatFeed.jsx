import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Check, Copy, Play, Plus } from "lucide-react";
import { EXAMPLE_QUERIES, TIPS } from "../constants";

export function ChatFeed({ messages, isLoading, copiedId, onCopy, onSave, onExecute }) {
  const isEmpty = messages.length === 0 && !isLoading;
  const scrollRef = useRef(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || isEmpty) return;
    requestAnimationFrame(() => container.scrollTo({ top: container.scrollHeight, behavior: "smooth" }));
  }, [messages, isLoading, isEmpty]);

  return (
    <section ref={scrollRef} className={`chat-feed ${isEmpty ? "empty" : ""}`} aria-label="채팅 메시지">
      {isEmpty ? (
        <Intro />
      ) : (
        <div className="message-stack">
          {messages.map((message) => (
            <MessageCard message={message} copied={copiedId === message.id} onCopy={onCopy} onSave={onSave} onExecute={onExecute} key={message.id} />
          ))}
          {isLoading && <TypingIndicator />}
        </div>
      )}
    </section>
  );
}

function Intro() {
  return (
    <div className="intro">
      <div className="intro-icon"><Plus size={34} /></div>
      <h1>AI Prompt Assistant</h1>
      <p>Write a prompt for an AI tool, and TTALKAK will improve it into a clearer, executable prompt.</p>
      <div className="tip-list">
        {TIPS.map((tip) => (
          <article className="tip-card" key={tip.title}>
            <span>{tip.icon}</span>
            <div>
              <h2>{tip.title}</h2>
              <p>{tip.description}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="example-queries">
        <p className="example-label">Try one of these</p>
        {EXAMPLE_QUERIES.map((example) => <span className="example-chip" key={example}>{example}</span>)}
      </div>
    </div>
  );
}

function MessageCard({ message, copied, onCopy, onSave, onExecute }) {
  const isAssistant = message.role === "assistant";
  const [showSources, setShowSources] = useState(false);
  const hasSources = isAssistant && message.sources?.length > 0;

  return (
    <article className={`message-row ${message.role}${message.isError ? " error" : ""}`} data-mid={message.id}>
      <div className="message-card">
        <p style={{ whiteSpace: "pre-wrap" }}>{message.content}</p>
        {hasSources && (
          <div className="sources-section">
            <button className="sources-toggle" type="button" onClick={() => setShowSources((v) => !v)}>
              참고 자료 {message.sources.length}건 {showSources ? "접기" : "보기"}
            </button>
            {showSources && (
              <ul className="sources-list">
                {message.sources.map((source, idx) => (
                  <li key={idx} className="source-item">
                    <span className="source-meta">
                      [{idx + 1}] {source.metadata?.source || source.metadata?.technique || "출처 없음"}
                      {source.metadata?.category ? ` (${source.metadata.category})` : ""}
                      {typeof source.score === "number" ? ` 유사도 ${(source.score * 100).toFixed(1)}%` : ""}
                    </span>
                    <p className="source-text">{source.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {isAssistant && !message.isError && (
          <div className="card-actions">
            <ActionButton icon={copied ? <Check size={14} /> : <Copy size={14} />} label={copied ? "Copied" : "Copy"} onClick={() => onCopy(message)} />
            <ActionButton icon={message.saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />} label={message.saved ? "Saved" : "Save"} onClick={() => onSave(message.id)} />
            {message.executablePrompt && <ActionButton icon={<Play size={14} />} label="Execute" onClick={() => onExecute(message)} />}
          </div>
        )}
      </div>
    </article>
  );
}

function ActionButton({ icon, label, onClick }) {
  return (
    <button className="action-button" type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function TypingIndicator() {
  return (
    <div className="message-row assistant">
      <div className="typing-message" aria-label="Improving prompt"><span /><span /><span /></div>
    </div>
  );
}
