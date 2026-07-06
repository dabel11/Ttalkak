# Frontend Handoff

TTALKAK 웹 프론트엔드 프로토타입을 백엔드와 연결하기 위한 인수인계 문서입니다.

## Current Implementation

- 기술 형태: 정적 `HTML + CSS + Vanilla JavaScript`
- 실행: `node preview-server.cjs`
- 화면 상태: `src/app.js`의 로컬 배열
- 영속 상태: 브라우저 `localStorage`
- API 초안: `src/api.js`, `docs/API_SPEC.md`

현재 프론트는 백엔드 없이 UX 확인이 가능하도록 만들어져 있습니다. 실제 연동 시에는 로컬 상태 변경 함수를 API 호출로 교체하면 됩니다.

## Screen Structure

```text
App
├─ Sidebar
├─ Header
├─ HomePage
│  ├─ SearchField
│  ├─ SearchHelpTooltip
│  ├─ PopularTags
│  ├─ SortDropdown
│  └─ PromptGrid
├─ MakePage
│  ├─ RecentThreads
│  ├─ CategoryButtons
│  ├─ ChatFeed
│  └─ Composer
├─ SavedPage / MyPage
│  ├─ SavedLibraryTab
│  ├─ MyPromptsTab
│  ├─ MyCommentsTab
│  ├─ MyReportsTab
│  ├─ SavedFilter
│  └─ PromptGrid
├─ SharePage
├─ PromptDetailModal
│  ├─ PromptDetail
│  ├─ Comments
│  └─ DetailActions
└─ AuthModal
```

## Important State Model

```ts
type Prompt = {
  id: string;
  title: string;
  text: string;
  tags: string[];
  views: number;
  likes?: number;
  comments: number;
  saves: number;
  createdAt?: number | string;
  author: string;
  source: "community" | "mine";
  isShared?: boolean;
  savedByMe?: boolean; // prototype equivalent of backend isSaved
  messages?: Message[];
};
```

`author`는 공개 표시명이며 실명이 아니라 `nickname`을 사용합니다. 회원가입의 `name`은 계정 확인용이고, 프롬프트 카드/상세/댓글/대댓글에는 노출하지 않습니다.

`내 프롬프트`와 `저장한 프롬프트`는 분리해서 다뤄야 합니다.

- 내가 Share한 직후의 프롬프트는 Home에 노출되지만 저장 아이콘은 비활성입니다.
- 저장 버튼을 누른 뒤에만 저장 아이콘이 활성화되고 저장 수가 증가합니다.
- 백엔드 응답에서는 `isMine`, `isShared`, `isSaved`를 분리해서 내려주는 것이 좋습니다.
- `saves`는 전체 저장 수이고 `isSaved`는 현재 사용자의 저장 여부입니다. 저장 아이콘의 활성/비활성 상태를 `saves > 0`으로 계산하면 내가 저장하지 않은 인기 프롬프트도 저장된 것처럼 보일 수 있으므로 금지합니다.

## Functions To Replace With APIs

- `sharePrompt`: 프롬프트 공유
- `performUnsharePrompt`: 공유 취소
- `toggleSavedPrompt`: 저장/저장 취소
- `saveMakeMessage`: Make 결과 저장
- `toggleLikePrompt`: 프롬프트 좋아요
- `openPromptDetail`: 상세 조회와 조회수 증가
- `addPromptComment`: 댓글 작성
- `addCommentReply`: 대댓글 작성
- `updateOwnComment`: 댓글/대댓글 수정
- `performDeleteComment`: 댓글/대댓글 삭제
- `toggleLikeComment`: 댓글/대댓글 좋아요
- `reportPrompt`: 프롬프트 신고
- `reportComment`: 댓글/대댓글 신고
- `performDeletePrompt`: 내 프롬프트 삭제
- `executeMakeMessage`: 외부 AI 사이트 실행 흐름

## Current Frontend Policy

- Home에는 공유된 프롬프트만 표시합니다.
- Home 카드에서 다른 사용자 프롬프트에는 `공유됨` 배지를 표시하지 않습니다.
- 내 프롬프트가 공유 상태이면 공유 아이콘을 짙은 녹색 채움 상태로 표시합니다.
- 커뮤니티에 공유되는 대상은 최종 프롬프트이며, Make에서 작성한 개인 대화 기록은 공유하지 않습니다.
- 내 프롬프트 카드를 눌러도 Make 대화 기록으로 이동하지 않고 최종 프롬프트 상세 팝업을 엽니다.
- 검색은 쉼표를 이용한 복수 해시태그 검색을 지원합니다.
- 검색창의 전구 아이콘은 처음 focus 시 다중 검색 안내를 잠깐 보여주고, hover 시 다시 보여줍니다.
- 검색 결과 상태에서 TTALKAK 로고를 누르면 Home 기본 상태로 돌아갑니다.
- Home 정렬 드롭다운은 `인기`, `저장`, `댓글`, `좋아요`, `최신`을 지원합니다.
- 추천 해시태그 8개는 태그 사용 횟수 내림차순입니다.
- Share 화면의 태그 입력은 기존 태그 검색/선택을 우선합니다. 검색 결과가 없을 때만 `새 태그로 추가`를 보여주며, 새 태그는 관리자 검토 또는 사용 횟수 기준으로 추천 태그에 승격하는 정책을 권장합니다.
- Prompt 상세 팝업을 여는 것을 조회로 간주하고 조회수를 증가시킵니다.
- My page에서 저장 취소를 누르면 즉시 사라지지 않고 `저장 취소 예정`으로 남습니다.
- My page를 벗어날 때 실제 저장 취소가 확정됩니다.
- My page의 `좋아요만 보기` 필터를 켜면 현재 소유자 필터 범위 안에서 좋아요한 프롬프트만 볼 수 있습니다.
- Make에서 저장한 내 프롬프트는 카드 클릭 시 최종 프롬프트 상세를 열고, 별도 `대화 보기` 버튼으로 개인 대화 기록을 확인합니다.
- 내가 작성한 댓글/대댓글은 수정/삭제만 가능하고 신고는 표시하지 않습니다.
- 다른 사용자의 댓글/대댓글은 좋아요/신고가 가능합니다.
- 댓글/대댓글은 좋아요 수 내림차순으로 표시합니다.

## Demo And LocalStorage

- 저장 키: `prompt_hub_web_state_v2`
- 데모 초기화 버튼은 Home/My page 상단 도구에 있습니다.
- Make/Share에는 신고 숨김/데모 초기화 도구를 노출하지 않는 것이 현재 UI 정책입니다.
- QA 중 상태가 꼬이면 데모 초기화를 눌러 localStorage를 비우고 새로 시작하면 됩니다.

## Backend Priority

1. Auth
2. Prompt 목록/검색/정렬/상세
3. Save/Like/View
4. Share/Unshare/Delete
5. Comments/Replies
6. Reports
7. Make Improve API
8. Make 최근 대화 동기화

## My Page Navigation Update

The sidebar currently exposes `My page` as a top-level navigation item. Internally, the route/function names still use `saved` for implementation compatibility, but the user-facing screen is broader than a simple saved-list page and groups account-owned activity:

- `내 보관함`: saved prompts, liked-only filter, community/mine filters, delayed unsave UX.
- `내가 만든 프롬프트`: prompts authored by the current user, including private/shared state.
- `댓글 관리`: comments and replies written by the current user, with edit/delete entry points.
- `신고 내역`: report history submitted by the current user.

Backend integration should treat `My page` as the current user activity area. The implementation route may remain `saved`, but product copy and navigation should use `My page`.

## Make Thread Identity

- Recent Make conversations are separate records by `threadId`, not by message text.
- Starting a new conversation with the same first prompt must create a new recent conversation instead of replacing the old one.
- Folder movement, deletion, and rename actions should operate on thread/folder ids.

## Action Placement Rules

- Prompt preview cards use a `...` menu for owner-only management actions such as edit, share/unshare, and delete.
- Prompt detail modals separate owner/admin management actions from usage actions to prevent dense icon rows.
- Admin review detail is read-only for normal user actions. Admin mode should show only close, revision request, hide/unhide, and delete style moderation actions.

## My Page Demo Data

- Production My page should start empty for a newly authenticated user.
- The prototype can show sample saved/owned/comment/report data only when the demo data toggle is enabled.
- The demo data toggle is for QA and backend handoff review, not a production default state.

## Execute Flow Note

웹사이트만으로는 ChatGPT/Gemini/Claude 입력창에 직접 자동 입력할 수 없습니다. 현재 UX는 최종 프롬프트를 클립보드에 복사하고 선택한 AI 사이트를 연 뒤, 사용자가 입력창에 붙여넣도록 안내합니다. 직접 자동 입력은 Chrome Extension content script 또는 공식 API 연동이 필요합니다.
