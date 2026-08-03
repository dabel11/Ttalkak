import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Check, Copy, Edit3, Play, Plus, X } from "lucide-react";
import { EXAMPLE_QUERIES, TIPS } from "../constants";
import { parseLegacyImproveAnswer } from "../utils/legacyImproveAnswer";

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
            <ActionButton icon={copied ? <Check size={14} /> : <Copy size={14} />} label={copied ? "복사됨" : "복사"} onClick={() => onCopy(message)} />
            <ActionButton icon={message.saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />} label={message.saved ? "보관됨" : "보관"} onClick={() => onSave(message.id)} />
            {hasExecutablePrompt(message) && <ActionButton icon={<Play size={14} />} label="실행" onClick={() => onExecute(message)} />}
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

function AssistantResponse({ message, isAsk }) {
  const parsed = parseAssistantSections(message);
  const content =
    parsed.improvedPrompt ||
    (isAsk ? message.summary || message.answer || parsed.lead : parsed.lead || message.content);
  const questions = mergeLists(message.questions, parsed.questions);
  const changes = mergeLists(message.changes, parsed.changes);
  const techniques = mergeLists(message.techniques || message.techniquesApplied, parsed.techniques);

  return (
    <>
      <EvidenceNotice ragStatus={message.ragStatus} />
      {content && (
        <p style={{ whiteSpace: "pre-wrap" }}>
          <PromptText text={content} />
        </p>
      )}
      <FieldList fields={message.fields} />
      <ChangeList changes={changes} />
      <QuestionList questions={questions} mode={message.mode} summary={message.summary} />
      <TechniqueList techniques={techniques} />
    </>
  );
}

function mergeLists(primary, secondary) {
  return [
    ...(Array.isArray(primary) ? primary : []),
    ...(Array.isArray(secondary) ? secondary : []),
  ];
}

function parseAssistantSections(message) {
  return parseLegacyImproveAnswer(message?.content || message?.answer || "");
}

function PromptText({ text }) {
  const source = String(text || "");
  const pattern = /\[[^\]\n]{1,80}\]/g;
  const parts = [];
  let cursor = 0;

  for (const match of source.matchAll(pattern)) {
    if (match.index > cursor) parts.push(source.slice(cursor, match.index));
    parts.push(
      <span className="prompt-placeholder-chip" title="채워 넣으면 더 정확해지는 정보입니다." key={`placeholder-${match.index}`}>
        {match[0]}
      </span>,
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) parts.push(source.slice(cursor));
  return <>{parts.length ? parts : source}</>;
}

function ChangeList({ changes }) {
  const normalizedChanges = normalizeMessageChanges(changes);
  if (!normalizedChanges.length) return null;

  return (
    <div className="assumption-list" aria-label="가정한 부분">
      <strong>가정한 부분</strong>
      <ul>
        {normalizedChanges.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function FieldList({ fields }) {
  const normalizedFields = normalizeMessageFields(fields).filter((item) => item.status !== "filled");
  if (!normalizedFields.length) return null;

  return (
    <div className="field-list" aria-label="채워야 할 정보">
      <strong>채워야 할 정보</strong>
      <ul>
        {normalizedFields.map((item, index) => (
          <li className={item.role} key={`${item.name}-${index}`}>
            <span>{item.name}</span>
            <em>{item.role === "required" ? "필수" : item.role === "fact" ? "사실 확인" : "선택"}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TechniqueList({ techniques }) {
  const normalizedTechniques = normalizeMessageTechniques(techniques);
  if (!normalizedTechniques.length) return null;

  return (
    <div className="technique-list" aria-label="참고한 프롬프트 기법">
      <strong>참고한 프롬프트 기법</strong>
      <ul>
        {normalizedTechniques.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span>{item.name}</span>
            {item.reason && <small>{item.reason}</small>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function hasExecutablePrompt(message) {
  if (!message?.executablePrompt || message.mode === "ask") return false;
  if (isUtilityOnlyPrompt(message.executablePrompt)) return false;
  const combinedText = [
    message.executablePrompt,
    message.content,
    message.answer,
    message.summary,
  ]
    .filter(Boolean)
    .join("\n");
  return !isAskOnlyResponse(combinedText);
}

function isUtilityOnlyPrompt(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return true;
  return [
    "관련 프롬프트 기법 근거를 찾지 못했습니다",
    "관련 기법 근거 없이",
    "개선안을 만들 수 없",
    "확인이 필요",
  ].some((fragment) => value.includes(fragment));
}

function isAskOnlyResponse(text) {
  const value = String(text || "").trim();
  if (!value) return true;
  if (isUtilityOnlyPrompt(value)) return true;
  return [
    /확인이\s*필요/i,
    /답변이\s*필요/i,
    /추가\s*정보가\s*필요/i,
    /정보를\s*보완해\s*주세요/i,
    /개선안을?\s*만들\s*수\s*없/i,
    /만들\s*수\s*없어/i,
    /아래\s*정보를\s*알려주시면/i,
    /어떤\s*주제/i,
    /무엇에\s*대한\s*글/i,
  ].some((pattern) => pattern.test(value));
}

function EvidenceNotice({ ragStatus }) {
  if (String(ragStatus || "").toLowerCase() !== "no_evidence") return null;
  return (
    <div className="evidence-notice">
      <span>참고 근거 없이 기본 방식으로 다듬었습니다.</span>
    </div>
  );
}

function QuestionList({ questions, mode, summary }) {
  const normalizedQuestions = normalizeMessageQuestions(questions);
  if (!normalizedQuestions.length) return null;
  const isAsk = mode === "ask";

  return (
    <div className="ask-message">
      <strong>{isAsk ? "답변이 필요한 정보" : "더 정확하게 개선하려면 아래 질문에 답해보세요."}</strong>
      {summary && !isAsk && <p>{summary}</p>}
      <ol>
        {normalizedQuestions.map((item, index) => (
          <li className={item.importance === "required" ? "required" : "recommended"} key={`${item.field || "question"}-${index}`}>
            <span>{item.question}</span>
            <em>{item.importance === "required" ? "필수 정보" : "선택 정보"}</em>
            {item.reason && <small>{item.reason}</small>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function normalizeMessageChanges(changes) {
  return Array.isArray(changes)
    ? changes
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (!item || typeof item !== "object") return "";
          return String(item.text || item.message || item.description || item.change || item.reason || "").trim();
        })
        .filter(Boolean)
    : [];
}

function normalizeMessageQuestions(questions) {
  return Array.isArray(questions)
    ? questions
        .map((item, index) => {
          if (typeof item === "string") {
            const question = item.trim();
            return question ? { field: "", question, reason: "", importance: "recommended" } : null;
          }
          if (!item || typeof item !== "object") return null;
          const question = String(item.question || item.text || item.content || item.label || "").trim();
          if (!question) return null;
          const importance = String(item.importance || item.priority || "recommended").toLowerCase();
          return {
            field: String(item.field || item.key || item.name || `question_${index + 1}`).trim(),
            question,
            reason: String(item.reason || item.description || item.effect || item.helpText || "").trim(),
            importance: importance === "required" ? "required" : "recommended",
          };
        })
        .filter(Boolean)
    : [];
}

function normalizeMessageFields(fields) {
  return Array.isArray(fields)
    ? fields
        .map((item, index) => {
          if (typeof item === "string") {
            const name = item.trim();
            return name ? { name, role: "fact", status: "empty", value: "" } : null;
          }
          if (!item || typeof item !== "object") return null;
          const name = String(item.name || item.field || item.key || item.label || `field_${index + 1}`).trim();
          if (!name) return null;
          const role = String(item.role || item.type || item.importance || "fact").toLowerCase();
          const status = String(item.status || (item.value ? "filled" : "empty")).toLowerCase();
          return {
            name,
            role: ["required", "fact", "framing"].includes(role) ? role : "fact",
            status: ["filled", "empty", "missing"].includes(status) ? status : "empty",
            value: String(item.value || item.answer || "").trim(),
          };
        })
        .filter(Boolean)
    : [];
}

function normalizeMessageTechniques(techniques) {
  return Array.isArray(techniques)
    ? techniques
        .map((item) => {
          if (typeof item === "string") {
            const name = item.trim();
            return name ? { name, reason: "" } : null;
          }
          if (!item || typeof item !== "object") return null;
          const name = String(item.name || item.technique || item.title || item.label || "").trim();
          if (!name) return null;
          return {
            name,
            reason: String(item.reason || item.description || item.effect || item.summary || "").trim(),
          };
        })
        .filter(Boolean)
    : [];
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
