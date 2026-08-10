import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Check, Copy, Edit3, Play, Plus, X } from "lucide-react";
import { EXAMPLE_QUERIES, TIPS } from "../constants";
import { AssistantResponse, PromptText } from "./AssistantResponse";
import { getMessageActionVisibility } from "../utils/messageActions";

export function ChatFeed({
  messages,
  isLoading,
  copiedId,
  canEditUserMessages,
  editingMessageId,
  editingDraft,
  onCopy,
  onSave,
  onExecute,
  onStartEdit,
  onChangeEditDraft,
  onCancelEdit,
  onSubmitEdit,
  onSelectExample,
}) {
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
        <Intro onSelectExample={onSelectExample} />
      ) : (
        <div className="message-stack">
          {messages.map((message) => (
            <MessageCard
              message={message}
              copied={copiedId === message.id}
              canEditUserMessages={canEditUserMessages}
              isEditing={editingMessageId === message.id}
              editingDraft={editingDraft}
              onCopy={onCopy}
              onSave={onSave}
              onExecute={onExecute}
              onStartEdit={onStartEdit}
              onChangeEditDraft={onChangeEditDraft}
              onCancelEdit={onCancelEdit}
              onSubmitEdit={onSubmitEdit}
              key={message.id}
            />
          ))}
          {isLoading && <TypingIndicator />}
        </div>
      )}
    </section>
  );
}

function Intro({ onSelectExample }) {
  return (
    <div className="intro">
      <div className="intro-icon"><Plus size={34} /></div>
      <h1>프롬프트 개선</h1>
      <p>AI 도구에 보낼 문장을 입력하면 TTALKAK이 더 명확하고 실행 가능한 프롬프트로 다듬어줍니다.</p>
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
        <p className="example-label">예시로 시작하기</p>
        {EXAMPLE_QUERIES.map((example) => (
          <button className="example-chip" type="button" onClick={() => onSelectExample(example)} key={example}>
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageCard({
  message,
  copied,
  canEditUserMessages,
  isEditing,
  editingDraft,
  onCopy,
  onSave,
  onExecute,
  onStartEdit,
  onChangeEditDraft,
  onCancelEdit,
  onSubmitEdit,
}) {
  const isAssistant = message.role === "assistant";
  const isAsk = message.mode === "ask";
  const actionVisibility = getMessageActionVisibility(message);
  const [showSources, setShowSources] = useState(false);
  const hasSources = isAssistant && message.sources?.length > 0;
  const canEdit = !isAssistant && canEditUserMessages && !message.isError;

  return (
    <article className={`message-row ${message.role}${message.isError ? " error" : ""}`} data-mid={message.id}>
      <div className={`message-card${isEditing ? " editing" : ""}`}>
        {isEditing ? (
          <form className="message-edit-form" onSubmit={(event) => onSubmitEdit(event, message.id)}>
            <textarea
              rows={3}
              value={editingDraft}
              onChange={(event) => onChangeEditDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSubmitEdit(event, message.id);
                }
              }}
              autoFocus
            />
            <div className="message-edit-actions">
              <button type="button" onClick={onCancelEdit}>
                <X size={14} />
                <span>취소</span>
              </button>
              <button type="submit">
                <Play size={14} />
                <span>다시 전송</span>
              </button>
            </div>
          </form>
        ) : isAssistant ? (
          <AssistantResponse message={message} isAsk={isAsk} />
        ) : (
          <p style={{ whiteSpace: "pre-wrap" }}><PromptText text={message.content} /></p>
        )}
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
            {actionVisibility.copy && <ActionButton icon={copied ? <Check size={14} /> : <Copy size={14} />} label={copied ? "\uBCF5\uC0AC\uB428" : "\uBCF5\uC0AC"} onClick={() => onCopy(message)} />}
            {actionVisibility.save && <ActionButton icon={message.saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />} label={message.saved ? "보관됨" : "보관"} onClick={() => onSave(message.id)} />}
            {actionVisibility.execute && <ActionButton icon={<Play size={14} />} label="실행" onClick={() => onExecute(message)} />}
          </div>
        )}
        {canEdit && !isEditing && (
          <button className="user-edit-button" type="button" onClick={() => onStartEdit(message)} aria-label="메시지 수정" title="수정">
            <Edit3 size={14} />
          </button>
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
      <div className="typing-message" aria-label="프롬프트 개선 중"><span /><span /><span /></div>
    </div>
  );
}
