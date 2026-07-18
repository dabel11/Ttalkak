# TTALKAK API Spec Draft

## Current Admin API Contract Used By Frontend

The frontend first attempts the following backend endpoints for Admin features. If a request fails during local QA, the UI may keep demo fallback state so reviewers can continue checking layout, but production behavior must be server-authorized.

| Feature | Method + path | Request body | Notes |
| --- | --- | --- | --- |
| Report list | `GET /api/admin/reports?status=pending` | none | Should return report target context, reporter, author/comment author, status, memo, reviewedAt |
| Report status update | `PATCH /api/admin/reports/{id}/status` | `{ status, memo? }` | `status`: `pending`, `reviewed`, `resolved`, `dismissed` |
| Admin prompt list | `GET /api/admin/prompts?page=1&pageSize=64&status=...` | none | Used by prompt management and user activity fallback |
| Hide prompt | `PATCH /api/admin/prompts/{id}/hide` | none or `{ memo? }` | Admin moderation action. Current backend policy treats this as hide/soft-delete, not permanent deletion. |
| Restore prompt | `PATCH /api/admin/prompts/{id}/restore` | none or `{ memo? }` | Restores a hidden/soft-deleted prompt. |
| Prompt revision request | `POST /api/prompts/{promptId}/revision-requests` | `{ reason, memo? }` | General prompt revision request flow |
| Admin author revision request | `POST /api/admin/prompts/{promptId}/author-revision-requests` | `{ message }` | Admin asks the prompt author to revise; admin should not directly edit user text |
| Admin author revision update | `PATCH /api/admin/author-revision-requests/{requestId}` | `{ message }` | Only `pending` author revision requests can be edited |
| Admin revision requests | `GET /api/admin/revision-requests?page=1&pageSize=64&status=...` | none | Used for the general revision request review flow |
| Revision request status | `PATCH /api/admin/revision-requests/{requestId}/status` | `{ status, memo? }` | `status`: `pending`, `approved`, `rejected` |
| Hide comment | `PATCH /api/admin/comments/{commentId}/hide` | none or `{ memo? }` | Admin moderation action |
| Unhide comment | `PATCH /api/admin/comments/{commentId}/unhide` | none or `{ memo? }` | Admin moderation action |
| Delete comment | `DELETE /api/admin/comments/{commentId}` | none or `{ memo? }` | Admin moderation action |
| Admin tags | `GET /api/admin/tags?status=all` | none | `pending`, `approved`, `rejected`, `disabled` supported by frontend |
| Tag status update | `PATCH /api/admin/tags/{id}/status` | `{ status }` | `pending`, `approved`, `rejected`, `disabled`; recommendation-excluded UI sends `disabled` |
| User search | `GET /api/admin/users?nickname={nickname}&page=1&pageSize=20` | none | Admin-only partial nickname search. Author clicks should use `author.id` when available. |
| User activity summary | `GET /api/admin/users/{memberId}/activity` | none | Counts and user status for prompts, comments, replies, submitted reports, and received reports. |
| User prompts | `GET /api/admin/users/{memberId}/prompts?page=1&pageSize=20` | none | Prompts authored by the user. |
| User comments | `GET /api/admin/users/{memberId}/comments?page=1&pageSize=20` | none | Top-level comments authored by the user. |
| User replies | `GET /api/admin/users/{memberId}/replies?page=1&pageSize=20` | none | Replies authored by the user. |
| User submitted reports | `GET /api/admin/users/{memberId}/reports/submitted?page=1&pageSize=20` | none | Reports submitted by the user. |
| User received reports | `GET /api/admin/users/{memberId}/reports/received?page=1&pageSize=20` | none | Reports received on prompts/comments/replies authored by the user. |

Admin accounts are operation-only accounts in the frontend. Admin users can inspect Home and Admin screens, but normal user actions such as Make submit, Share submit, save, like, report, comment, and personal My page actions are hidden or blocked. Admin credentials are provided by backend `.env` / `ADMIN_*` seed settings, not a fixed default password. Team test credentials should follow the backend password policy, including the 12-character minimum for seeded admin passwords.

프론트엔드 프로토타입 기준의 백엔드 API 초안입니다. 실제 경로와 응답 형태는 Spring Boot 구현 방식에 맞춰 조정해도 됩니다.

## Auth

| 기능 | Method + path | Request body | Response |
| --- | --- | --- | --- |
| 로그인 | `POST /api/auth/login` | `{ userId, password }` | `{ user, accessToken }` |
| 회원가입 | `POST /api/auth/signup` | `{ nickname, name, birth?, phone?, email?, userId, password, agreeTerms, agreePrivacy }` | `{ user, accessToken }` |
| 아이디 찾기 | `POST /api/auth/find-id` | `{ method: "phone", name, phone }` 또는 `{ method: "email", name, email }` | `{ maskedUserId }` |
| 비밀번호 재설정 요청 | `POST /api/auth/password-reset/request` | `{ userId, phone }` | `{ ok: true }` |

## Prompt List And Search

Home에는 공유된 프롬프트만 반환합니다. 검색은 쉼표로 구분한 복수 태그를 지원하며, 요청한 태그를 모두 포함하는 프롬프트를 반환합니다.

정렬 파라미터:

| sort | 의미 | 기준 |
| --- | --- | --- |
| `popular` | 인기 | `views desc`, `comments desc`, `saves desc` |
| `saves` | 저장 | `saves desc`, `views desc`, `comments desc` |
| `comments` | 댓글 | `comments desc`, `views desc`, `saves desc` |
| `likes` | 좋아요 | `likes desc`, `views desc`, `saves desc` |
| `latest` | 최신 | `createdAt desc`, `views desc` |

| 기능 | Method + path | Request body | Response notes |
| --- | --- | --- | --- |
| 프롬프트 목록 | `GET /api/prompts?sort=popular&page=1&pageSize=16` | none | 공유 프롬프트 16개 단위 페이지 |
| 해시태그 검색 | `GET /api/prompts?tags=marketing,seo&sort=popular&page=1&pageSize=16` | none | 복수 태그 AND 검색 |
| 인기 태그 | `GET /api/tags/popular?limit=8` | none | 태그 사용 횟수 내림차순 상위 8개 |
| 태그 검색/추천 | `GET /api/tags?query=marketing&limit=8` | none | Share 화면에서 기존 태그 우선 선택용. 기존 태그가 있으면 기존 태그만 반환 |
| 새 태그 생성 후보 | `POST /api/tags/proposals` | `{ name }` | 검색 결과가 없을 때만 호출 권장. 관리자 검토 또는 사용 횟수 기준 승격 대상 |
| 프롬프트 상세 | `GET /api/prompts/:id` | none | 본문, 태그, 카운트, 작성자, 소유 여부, 저장/좋아요/신고 여부 |
| 조회수 증가 | `POST /api/prompts/:id/view` | none | 상세 팝업 오픈 시 호출 |

## Prompt Actions

| 기능 | Method + path | Request body | Response notes |
| --- | --- | --- | --- |
| 프롬프트 공유 | `POST /api/prompts` | `{ title, text, tags }` | 내 프롬프트를 공유 상태로 생성 |
| 프롬프트 수정 | `PATCH /api/prompts/:id` | `{ title, text, tags }` | 소유자만 가능. 관리자는 사용자 작성 프롬프트를 직접 수정하지 않고 수정 요청/숨김/복구로 처리 |
| 공유 취소 | `PATCH /api/prompts/:id/visibility` | `{ isShared: false }` | Home에서 제거, My page에는 내 프롬프트로 유지 |
| 비공개 프롬프트 공유 | `PATCH /api/prompts/:id/visibility` | `{ isShared: true }` | My page의 내 프롬프트를 Home에 노출 |
| 프롬프트 삭제 | `DELETE /api/prompts/:id` | none | 소유자만 가능 |
| 관리자 프롬프트 수정 요청/숨김 | `POST /api/prompts/:id/revision-requests`, `PATCH /api/admin/prompts/:id/hide`, `PATCH /api/admin/prompts/:id/restore` | varies | 관리자는 사용자 콘텐츠를 직접 수정하지 않고 수정 요청 또는 숨김/복구 운영 조치만 수행. 현재 영구 삭제 API는 없음 |
| 저장 | `POST /api/prompts/:id/save` | none | 저장 수와 `isSaved` 반환 |
| 저장 취소 | `DELETE /api/prompts/:id/save` | none | 저장 수와 `isSaved` 반환 |
| 좋아요 | `POST /api/prompts/:id/like` | none | 좋아요 수와 `isLiked` 반환 |
| 좋아요 취소 | `DELETE /api/prompts/:id/like` | none | 좋아요 수와 `isLiked` 반환 |
| 프롬프트 신고 | `POST /api/reports/prompts/:id` | `{ reason }` | 동일 사용자 중복 신고 방지 |

## Auth Actions

| 기능 | Method + path | Request body | Response notes |
| --- | --- | --- | --- |
| Google OAuth2 로그인 | `POST /api/auth/google` | `{ credential }` | Google credential 검증 후 자체 JWT 발급. 운영 배포 전 Google Cloud Console 도메인 등록과 환경변수 설정 필요 |
| 닉네임 중복 확인 | `GET /api/auth/check-nickname?nickname=...` | none | 사용 가능 여부 반환 |
| 아이디 중복 확인 | `GET /api/auth/check-user-id?userId=...` | none | 사용 가능 여부 반환 |
| 로그아웃 | `POST /api/auth/logout` | none | 세션/token 종료 |
| 회원탈퇴 | `DELETE /api/auth/withdraw` | `{ password }` + `Authorization: Bearer ...` | 성공 시 계정 비활성화, 기존 토큰 무효, 프론트 인증/캐시 상태 초기화 |

## My Page / User Activity

The current UI exposes this area as `My page`. It groups saved prompts, owned prompts, comments/replies, and report history for the current authenticated user. The frontend implementation route may still be named `saved` for compatibility.

| Feature | Method + path | Request body | Response notes |
| --- | --- | --- | --- |
| My page library | `GET /api/me/library?filter=all&sort=saves&page=1&pageSize=16` | none | My page library tab data. Saved prompts plus liked-only filter support. Keep `isSaved` separate from `saves`. |
| My prompts | `GET /api/me/prompts?sort=latest` | none | Prompts authored by the current user, including private/shared status. |
| My comments | `GET /api/me/comments` | none | Comments and replies written by the current user with prompt summary and edit/delete permissions. |
| My reports | `GET /api/me/reports` | none | Report history submitted by the current user with target type, reason, submitted time, and status. |

## Admin

관리자 화면은 신고 관리, 전체 프롬프트 관리, 태그 관리를 담당합니다. 실제 서비스에서는 `/api/auth/login` 응답의 `user.role: "admin"`과 서버 권한 검증을 기준으로 노출합니다.

| 기능 | Method + path | Request body | Response notes |
| --- | --- | --- | --- |
| 신고 목록 | `GET /api/admin/reports?status=pending` | none | 프롬프트/댓글/대댓글 신고 사유, 대상, 게시물 작성자, 댓글 작성자, 처리 상태, 원문 강조용 target id |
| 신고 검토 완료 | `PATCH /api/admin/reports/:id/status` | `{ status: "reviewed", memo? }` | 검토자와 검토 시각 감사 로그 필요 |
| 신고 기각 | `PATCH /api/admin/reports/:id/status` | `{ status: "dismissed", memo? }` | 대상의 신고 표시 해제 가능 |
| 신고 대상 운영 조치 | report status + hide/comment delete APIs | `{ memo? }` | 프롬프트는 숨김/복구 정책을 따르고, 댓글은 관리자 댓글 삭제 API를 사용 |
| 프롬프트 수정 요청 | `POST /api/prompts/:id/revision-requests` | `{ reason, memo? }` | 작성자에게 수정 요청을 전달, 관리자와 요청 시각 감사 로그 필요 |
| 전체 프롬프트 숨김/복구 | `PATCH /api/admin/prompts/:id/hide`, `PATCH /api/admin/prompts/:id/restore` | `{ memo? }` | 숨김은 복구 가능한 소프트 삭제 정책. 영구 삭제가 필요하면 별도 정책/API 결정 필요 |
| 태그 관리 | `GET /api/admin/tags?status=all` | none | `pending`, `approved`, `rejected` 상태와 사용 횟수 반환 |
| 태그 상태 변경 | `PATCH /api/admin/tags/:id/status` | `{ status: "approved" \| "rejected" \| "disabled", memo? }` | 검토 완료, 반려, 추천 제외/복구 상태 전환 |

Admin status model:

- Report status: `pending` = 접수, `reviewed` = 검토 완료, `resolved` = 처리 완료, `dismissed` = 기각. `resolved`와 `dismissed`는 최종 상태이며 프론트에서 재처리 버튼을 제공하지 않습니다.
- Tag status: `pending` = 검토 중, `approved` = 검토 완료, `rejected` = 반려, `disabled` = 추천 제외. `rejected`는 최종 상태이며, 승인된 태그는 `approved`와 `disabled` 사이에서만 전환합니다.

회원가입 필수값은 `nickname`, `name`, `userId`, `password`, `passwordConfirm`, `agreeTerms`, `agreePrivacy`입니다. `birth`, `phone`, `email`은 선택값이며, 입력된 경우에만 형식 검증을 권장합니다. 이메일은 아이디 찾기 보조 수단으로 사용할 수 있으나, 이메일을 등록하지 않은 사용자는 이메일 방식 아이디 찾기를 사용할 수 없습니다. 커뮤니티 화면에는 실명 `name`이 아니라 `nickname`을 표시해야 합니다. 약관/개인정보 동의는 실제 서비스에서 동의 버전과 동의 시각 저장이 필요합니다.

프롬프트 카드, 프롬프트 상세, 댓글, 대댓글 등 공개 커뮤니티 응답의 작성자 표시는 `author.nickname`을 사용합니다. 실명 `name`은 계정 확인용 정보로만 사용하고 공개 API 응답에는 포함하지 않는 것을 권장합니다. 닉네임은 회원가입 필수값이며 중복 불가입니다.

## Saved And Ownership

`내 프롬프트`와 `내가 저장한 프롬프트`는 다른 개념입니다.

공유 대상은 최종 프롬프트입니다. Make에서 최종 프롬프트를 만들기 위해 사용한 개인 대화 기록은 커뮤니티에 공유하지 않습니다.

- `isMine`: 현재 사용자가 작성한 프롬프트인지 여부
- `isShared`: 커뮤니티에 공개되어 Home에 노출되는지 여부
- `isSaved`: 현재 사용자가 저장 버튼을 눌렀는지 여부
- `saves`: 전체 사용자 저장 횟수입니다. `isSaved`와 같은 의미가 아니며, UI의 저장 아이콘 활성화 여부는 반드시 `isSaved`만 기준으로 판단해야 합니다.

백엔드 연동 시 `isSaved`와 `saves`는 반드시 분리해서 내려주세요. 예를 들어 내가 공유한 프롬프트는 Home에 노출되더라도 저장 버튼을 누르기 전에는 `isSaved: false`, `saves: 0`일 수 있습니다. 반대로 `saves`가 10이어도 현재 사용자가 저장하지 않았다면 `isSaved: false`여야 합니다.

예시:

- Share 직후 내 프롬프트: `isMine: true`, `isShared: true`, `isSaved: false`, `saves: 0`
- 저장 버튼 클릭 후: `isSaved: true`, `saves: 1`
- 저장 취소 후: `isSaved: false`, `saves: 0`

My page 화면은 저장한 커뮤니티 프롬프트와 내 프롬프트를 함께 보여줍니다. My page 화면에서 저장 취소를 누르면 즉시 목록에서 사라지지 않고, 사용자가 다른 화면으로 이동할 때 저장 취소를 확정하는 UX입니다.
My page의 내 프롬프트는 `공유됨`/`비공개` 상태를 버튼 한 번으로 전환합니다. 이미 제목, 본문, 태그가 있는 비공개 프롬프트는 `PATCH /api/prompts/:id/visibility`로 즉시 공유 상태가 되며, 태그가 없는 경우에만 Share 화면에서 태그를 보완하도록 안내합니다.

| 기능 | Method + path | Request body | Response notes |
| --- | --- | --- | --- |
| My page 목록 | `GET /api/prompts/my?filter=all&page=1&pageSize=16` | none | `filter=all|community|mine|liked` 권장 |
| 저장 취소 확정 | `DELETE /api/prompts/:id/save` | none | My page 이탈 시 pending 항목에 대해 호출 |

## Comments And Replies

댓글은 1단계 대댓글까지만 지원합니다. 대댓글 아래에 다시 대댓글을 중첩하지 않습니다. 댓글과 대댓글은 좋아요 수 내림차순, 동률이면 작성순으로 표시합니다.

| 기능 | Method + path | Request body | Response notes |
| --- | --- | --- | --- |
| 댓글 목록 | `GET /api/prompts/:id/comments` | none | 댓글과 대댓글 포함 |
| 댓글 작성 | `POST /api/prompts/:id/comments` | `{ text }` | 생성된 댓글 반환 |
| 대댓글 작성 | `POST /api/comments/:id/replies` | `{ text }` | 부모 댓글 아래 생성된 대댓글 반환 |
| 댓글/대댓글 수정 | `PATCH /api/comments/:id` | `{ text }` | 소유자만 가능, `edited: true` 반환 |
| 댓글/대댓글 삭제 | `DELETE /api/comments/:id` | none | 소유자만 가능 |
| 댓글/대댓글 좋아요 | `POST /api/comments/:id/like` | none | 본인 댓글/대댓글에는 허용하지 않음 |
| 댓글/대댓글 좋아요 취소 | `DELETE /api/comments/:id/like` | none | 좋아요 수와 상태 반환 |
| 댓글/대댓글 신고 | `POST /api/reports/comments/:id` | `{ reason }` | 본인 댓글/대댓글에는 신고 버튼 미노출 |

## Make

| 기능 | Method + path | Request body | Response notes |
| --- | --- | --- | --- |
| 프롬프트 첨삭 | `POST /api/prompts/improve` | `{ prompt, category? }` | 개선된 최종 프롬프트 반환 |
| Make 대화 저장 | `POST /api/make/threads` | `{ messages }` | 로그인 사용자 최근 대화 동기화 |
| Make 대화 목록 | `GET /api/make/threads` | none | 최근 대화 목록 반환 |
| Make 폴더 목록 | `GET /api/make/folders` | none | `전체`은 프론트 가상 필터, 서버는 사용자 폴더와 미분류 상태를 반환 |
| Make 폴더 생성 | `POST /api/make/folders` | `{ name }` | 사용자 개인 폴더 생성 |
| Make 폴더 수정 | `PATCH /api/make/folders/:id` | `{ name }` | 폴더 이름 변경 |
| Make 폴더 삭제 | `DELETE /api/make/folders/:id` | none | 폴더 안 대화는 삭제하지 않고 미분류로 이동 |
| Make 대화 폴더 이동 | `PATCH /api/make/threads/:id/folder` | `{ folderId }` | `folderId: null` 또는 `"uncategorized"`는 미분류 |

Make thread identity policy:

- Make conversation identity must be based on `threadId` / `conversationId`.
- Do not deduplicate or overwrite conversations by first message text, title, or normalized prompt content.
- If a user starts two separate conversations with the same input text, both conversations must remain as separate thread records.
- Updating a thread should replace only the record with the same `threadId`.

## Prompt Improve / RAG Response Contract

프론트엔드 호출 경계:

- 프론트엔드는 Spring Boot의 `POST /api/prompts/improve`만 호출합니다.
- 프론트엔드는 FastAPI `/query`를 직접 호출하지 않습니다.
- 프론트엔드는 FastAPI 서버 주소, RAG 서버 주소, Vector DB 주소, LLM API Key, AI provider key를 저장하거나 사용하지 않습니다.
- 확정된 호출 흐름은 `Frontend -> Spring Boot /api/prompts/improve -> FastAPI /query -> RAG / Vector DB / LLM -> Spring Boot -> Frontend`입니다.
- Spring Boot가 FastAPI 요청/응답 DTO, timeout 정책, 검색 결과 없음 정책, 프론트 응답 형태 변환을 담당합니다.

`POST /api/prompts/improve`는 Make 화면의 핵심 연동 지점입니다. 프론트는 현재 여러 응답 필드를 방어적으로 받을 수 있지만, 백엔드/RAG 계약은 아래 형태 중 하나로 통일하는 것을 권장합니다.

### Request

```json
{
  "prompt": "사용자가 입력한 원문",
  "category": "blog"
}
```

### Success: improved prompt

```json
{
  "mode": "improve",
  "improved_prompt": "바로 복사해서 사용할 수 있는 최종 프롬프트",
  "techniques": [
    {
      "name": "명확한 목표 설정",
      "reason": "요청 목적을 먼저 고정하기 위해 적용"
    }
  ],
  "changes": ["역할과 출력 형식을 보강함"],
  "score": 0.86
}
```

프론트는 `improved_prompt`, `improvedPrompt`, `final_prompt`, `finalPrompt`, `answer`, `text`, `content`, `prompt`를 모두 fallback으로 읽습니다. 다만 최종 계약은 `improved_prompt` 하나로 맞추는 것이 가장 깔끔합니다.

### Success: more information needed

```json
{
  "mode": "question",
  "questions": [
    "어떤 독자를 대상으로 하나요?",
    "원하는 출력 형식이 있나요?"
  ]
}
```

이 경우 프론트는 질문 목록을 assistant 메시지로 보여주고, 사용자가 추가 답변을 보낼 수 있게 합니다.

### Error states

| HTTP status | Meaning | Frontend behavior |
| --- | --- | --- |
| `401` | 로그인 필요 또는 토큰 만료 | 로그인 팝업 표시 |
| `403` | 권한 없음 | 권한 없음 안내 |
| `404` | 요청한 프롬프트, 게시물, 댓글 등 리소스 없음 | 리소스 없음 안내 또는 데모 첨삭 fallback |
| `429` | 요청 과다 또는 비로그인 체험 횟수 초과 | 잠시 후 재시도 또는 로그인 안내 |
| `500` | 백엔드 내부 오류 | 서버 오류 안내, 데모 첨삭 fallback |
| `503` | AI 서버 또는 외부 LLM 서비스 이용 불가 | AI 첨삭 서비스 장애 안내, 데모 첨삭 fallback |
| `504` | AI 응답 시간 초과 | 응답 시간 초과 안내, 데모 첨삭 fallback |

RAG 검색 근거가 없는 경우는 HTTP `404`가 아니라 정상 응답 `200 OK`로 처리하는 것을 권장합니다. 이때 Spring Boot는 예를 들어 `{ "rag_status": "no_evidence", "improved_prompt": "..." }`처럼 기본 첨삭 결과와 상태값을 함께 내려줍니다.

## Suggested Prompt Response

```json
{
  "id": "post-1",
  "title": "SEO 블로그 포스트",
  "text": "검색엔진 상위 노출을 위한 키워드 중심의 블로그 글을 작성해주세요.",
  "tags": ["SEO", "블로그"],
  "views": 72450,
  "likes": 11890,
  "comments": 1980,
  "saves": 35670,
  "createdAt": "2026-06-17T01:00:00Z",
  "author": { "id": "user-1", "nickname": "지수봇" },
  "isMine": false,
  "isShared": true,
  "isSaved": true,
  "isLiked": false,
  "isReported": false
}
```

## Suggested Comment Response

```json
{
  "id": "comment-1",
  "author": { "id": "user-2", "nickname": "서연" },
  "text": "브랜드 톤앤매너를 추가하면 결과가 더 정확해질 것 같습니다.",
  "likes": 2,
  "edited": true,
  "isMine": false,
  "isLiked": false,
  "isReported": false,
  "replies": [
    {
      "id": "reply-1",
      "author": { "id": "user-3", "nickname": "민준" },
      "text": "맞아요. 바로 복사해서 쓰기 좋은 형태입니다.",
      "likes": 0,
      "edited": false,
      "isMine": false,
      "isLiked": false,
      "isReported": false
    }
  ]
}
```
