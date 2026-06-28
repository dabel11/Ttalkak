# Backend Handoff Message

TTALKAK 웹 프론트엔드 프로토타입 전달드립니다.

현재 버전은 백엔드 없이도 전체 UX를 확인할 수 있도록 `src/app.js`의 로컬 상태와 브라우저 `localStorage`를 사용합니다. 실제 연동 시에는 `src/api.js`와 `docs/API_SPEC.md`를 기준으로 Spring Boot API 호출로 교체하면 됩니다.

## 실행

```powershell
cd prompt-hub-web-frontend
node preview-server.cjs
```

브라우저:

```text
http://127.0.0.1:4173/
```

## 주요 파일

- `index.html`: 진입 파일
- `src/app.js`: 화면 렌더링, 로컬 상태, 데모 동작
- `src/styles.css`: 전체 UI 스타일
- `src/api.js`: 백엔드 연동용 API wrapper 초안. 현재 데모 화면은 아직 대부분 `src/app.js`의 로컬 상태로 동작합니다.
- `docs/API_SPEC.md`: API 명세 초안
- `docs/FRONTEND_HANDOFF.md`: 프론트 상태/정책 문서
- `docs/BACKEND_INTEGRATION_NOTES.md`: 백엔드 연동 메모
- `docs/SCREEN_MAP.md`: 화면별 필요 데이터

## 구현된 화면

- Home: 공유 프롬프트 목록, 해시태그 검색, 복수 태그 검색 안내, 인기 태그, 정렬 드롭다운, 페이지네이션
- Make: 프롬프트 첨삭 채팅, 분야 버튼, 최근 대화, Copy/Save/Execute
- Saved: 저장한 커뮤니티 프롬프트와 내 프롬프트 관리, 저장 취소 보류
- Share: 로그인 기반 프롬프트 공유
- Auth: 로그인, 회원가입, 아이디 찾기, 비밀번호 찾기
- Detail modal: 전체 프롬프트, 댓글/대댓글, 좋아요, 저장, 신고, 삭제, 공유 취소

## 백엔드 구현 포인트

- Auth: JWT + Google OAuth2 구조와 LOCAL 로그인 병행
- Prompt: 목록, 상세, 검색, 태그 랭킹, 조회수 증가
- Prompt sort: `popular`, `saves`, `comments`, `likes`, `latest`
- Prompt actions: 저장, 좋아요, 신고, 공유, 공유 취소, 삭제
- Saved: `isMine`, `isShared`, `isSaved` 분리 필요
- Share: 커뮤니티에 공개되는 것은 최종 프롬프트만이며 Make 개인 대화 기록은 공개하지 않음
- Comment: 댓글/대댓글 작성, 수정, 삭제, 좋아요, 신고
- Make: 프롬프트 첨삭 API와 최근 대화 동기화
- Admin: 현재는 프론트엔드 데모 토글로 노출됩니다. 실제 서비스에서는 백엔드 `ADMIN` 권한 검증과 감사 로그가 필요합니다.

## UI 정책

- Home에는 공유된 프롬프트만 노출합니다.
- 다른 사용자 프롬프트에는 `공유됨` 배지를 표시하지 않습니다.
- 내 공유 프롬프트는 공유 아이콘을 짙은 녹색 채움 상태로 표시합니다.
- Share 직후 내 프롬프트는 Home에 보이지만 저장 상태는 아닙니다.
- 저장 아이콘은 `isSaved`만 기준으로 활성화해야 합니다.
- `saves`는 전체 저장 수이고 `isSaved`는 현재 사용자 저장 여부입니다. 두 값을 합쳐서 판단하면 저장 수가 0인데 저장된 것처럼 보이거나, 반대로 다른 사용자가 저장한 프롬프트가 내 저장 항목처럼 보일 수 있습니다.
- 공유 성공 후 Home으로 이동하고 최신 정렬에서 방금 공유한 프롬프트를 확인합니다.
- Saved에서 저장 취소는 즉시 제거하지 않고, 화면 이동 시 확정합니다.
- Saved에는 소유자 필터와 `좋아요만 보기` 상태 필터가 있습니다.
- Make 개인 대화 기록은 공개하지 않으며, 내 저장 프롬프트의 별도 `대화 보기` 액션에서만 확인합니다.
- 댓글/대댓글은 좋아요 수 내림차순으로 정렬합니다.
- 본인 댓글/대댓글은 신고 대신 수정/삭제를 제공합니다.

## 데모 상태

브라우저 localStorage에 예전 상태가 남아 있으면 UI가 이상해 보일 수 있습니다. QA 중 이상하면 Home 또는 Saved 상단의 `데모 초기화`를 눌러 `prompt_hub_web_state_v2`를 초기화하면 됩니다.
