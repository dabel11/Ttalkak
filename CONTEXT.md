# Ttalkak 도메인 용어집

> 이 파일은 구현 세부사항을 담지 않는다. 팀이 공유하는 용어의 정의만 기록한다.

---

## 핵심 용어

### Thread (대화 스레드)
사용자가 하나의 프롬프트를 개선하는 과정을 담는 대화 세션.
`+` 버튼(명시적 생성) 또는 첫 메시지 전송(자동 생성)으로 시작된다.
로그인 사용자의 Thread는 DB에 저장되며, 비로그인 사용자의 Thread는 localStorage에만 존재한다.

### Turn (대화 턴)
Thread 안에서 사용자의 메시지 1건 + AI의 응답 1건을 묶은 단위.
로그인 사용자의 경우 `/improve` 호출 성공 시 즉시 DB에 저장된다(자동 저장).
Turn에는 `improved_prompt`, `techniques_applied`, `changes`, `sources`가 포함된다.

### SavedPrompt (저장 프롬프트)
로그인 사용자가 개선 결과를 내 보관함에 저장한 것. Thread와 연결되며 기본적으로 비공개다.
Spring의 `Prompt` 엔티티에 해당한다.

### CommunityPost (커뮤니티 게시물)
SavedPrompt를 커뮤니티에 공유할 때 생성되는 별도 엔티티.
제목·해시태그·조회수·좋아요·댓글을 독립적으로 관리한다.
공유 대상은 최종 `improved_prompt` 텍스트만이며 Thread 대화 기록은 포함되지 않는다.
Spring의 `CommunityPost` 엔티티에 해당한다.

### AnonymousSession (익명 세션)
비로그인 사용자를 식별하는 UUID 기반 세션.
확장이 최초 실행 시 생성해 localStorage에 저장한다.
Spring은 이 UUID로 체험 횟수를 카운팅하며, 24시간마다 리셋된다.

### TrialCount (체험 횟수)
AnonymousSession당 `/improve` 호출 가능 횟수. 한도는 3회/24시간.
Turn 단위로 차감된다(피드백 1회 = 1회 차감).

### ImprovedPrompt (개선된 프롬프트)
Turn에서 AI가 생성한 결과물 중 "다른 AI에게 시킬 지시문" 부분.
`answer` 전체 응답에서 정규식으로 추출되며, Execute 시 이 값만 대상 AI 입력창에 입력된다.

### TechniquesApplied (적용 기법)
Turn에서 RAG가 검색해 LLM이 적용한 프롬프트 엔지니어링 기법 목록.
`rag_chunk` 테이블의 `prompt_techniques` 컬렉션에서 검색된다.

---

## 경계 용어

### 개선 경로
확장·웹 양쪽 모두 `Extension/Web → Spring:8080 /api/prompts/improve → rag-server:8000 /query` 단일 경로를 사용한다.
Spring은 인증·TrialCount 검사·Turn 저장만 담당하고 LLM 호출은 하지 않는다.

### 저장 vs 공유
- **저장(Save)**: Thread의 Turn이 자동 저장되거나, 사용자가 명시적으로 결과를 SavedPrompt로 보관하는 행위. 비공개.
- **공유(Share)**: SavedPrompt를 바탕으로 CommunityPost를 새로 생성하는 행위. Share 화면에서 제목·태그를 추가해 수행. Home 화면은 CommunityPost 목록을 표시한다.
