# TTALKAK API Spec Draft

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
| 프롬프트 수정 | `PATCH /api/prompts/:id` | `{ title, text, tags }` | 소유자 또는 관리자만 가능 |
| 공유 취소 | `PATCH /api/prompts/:id/visibility` | `{ isShared: false }` | Home에서 제거, My page에는 내 프롬프트로 유지 |
| 비공개 프롬프트 공유 | `PATCH /api/prompts/:id/visibility` | `{ isShared: true }` | My page의 내 프롬프트를 Home에 노출 |
| 프롬프트 삭제 | `DELETE /api/prompts/:id` | none | 소유자만 가능 |
| 관리자 프롬프트 수정/삭제 | `PATCH/DELETE /api/admin/prompts/:id` | varies | 관리자 권한 및 감사 로그 필요 |
| 저장 | `POST /api/prompts/:id/save` | none | 저장 수와 `isSaved` 반환 |
| 저장 취소 | `DELETE /api/prompts/:id/save` | none | 저장 수와 `isSaved` 반환 |
| 좋아요 | `POST /api/prompts/:id/like` | none | 좋아요 수와 `isLiked` 반환 |
| 좋아요 취소 | `DELETE /api/prompts/:id/like` | none | 좋아요 수와 `isLiked` 반환 |
| 프롬프트 신고 | `POST /api/reports/prompts/:id` | `{ reason }` | 동일 사용자 중복 신고 방지 |

## Auth Actions

| 기능 | Method + path | Request body | Response notes |
| --- | --- | --- | --- |
| Google OAuth2 시작 | `GET /api/auth/google` | none | OAuth provider redirect |
| Google OAuth2 callback | `GET /api/auth/google/callback` | provider params | session/token 발급 |
| 닉네임 중복 확인 | `GET /api/auth/check-nickname?nickname=...` | none | 사용 가능 여부 반환 |
| 아이디 중복 확인 | `GET /api/auth/check-user-id?userId=...` | none | 사용 가능 여부 반환 |
| 로그아웃 | `POST /api/auth/logout` | none | 세션/token 종료 |
| 회원탈퇴 | `DELETE /api/users/me` | confirmation payload | 계정/작성물/댓글/저장/신고 정책 필요 |

## My Page / User Activity

The current UI exposes this area as `My page`. It groups saved prompts, owned prompts, comments/replies, and report history for the current authenticated user. The frontend implementation route may still be named `saved` for compatibility.

| Feature | Method + path | Request body | Response notes |
| --- | --- | --- | --- |
| My page library | `GET /api/me/library?filter=all&sort=saves&page=1&pageSize=16` | none | My page library tab data. Saved prompts plus liked-only filter support. Keep `isSaved` separate from `saves`. |
| My prompts | `GET /api/me/prompts?sort=latest` | none | Prompts authored by the current user, including private/shared status. |
| My comments | `GET /api/me/comments` | none | Comments and replies written by the current user with prompt summary and edit/delete permissions. |
| My reports | `GET /api/me/reports` | none | Report history submitted by the current user with target type, reason, submitted time, and status. |

## Admin

관리자 화면은 신고 관리, 전체 프롬프트 관리, 태그 관리를 담당합니다. 프론트엔드 데모에서는 `관리자 데모` 토글로 노출하지만, 실제 서비스에서는 서버 권한 검증이 필요합니다.

| 기능 | Method + path | Request body | Response notes |
| --- | --- | --- | --- |
| 신고 목록 | `GET /api/admin/reports?status=pending` | none | 프롬프트/댓글/대댓글 신고 사유, 대상, 작성자, 처리 상태 |
| 신고 처리 완료 | `PATCH /api/admin/reports/:id` | `{ status: "resolved", memo? }` | 처리자와 처리 시각 감사 로그 필요 |
| 신고 기각 | `PATCH /api/admin/reports/:id` | `{ status: "dismissed", memo? }` | 대상의 신고 표시 해제 가능 |
| 신고 재처리 | `PATCH /api/admin/reports/:id` | `{ status: "pending", memo? }` | 처리 완료/기각 상태를 다시 접수 상태로 되돌림 |
| 신고 대상 삭제 | `DELETE /api/admin/reports/:id/target` | `{ memo? }` | 대상이 프롬프트/댓글/대댓글인지에 따라 삭제 |
| 전체 프롬프트 수정 | `PATCH /api/admin/prompts/:id` | `{ title, text, tags, isShared? }` | 소유자와 무관하게 관리자 권한으로 수정 |
| 전체 프롬프트 삭제 | `DELETE /api/admin/prompts/:id` | `{ memo? }` | 삭제 사유와 관리자 감사 로그 필요 |
| 태그 관리 | `GET /api/admin/tags?status=all` | none | `pending`, `approved`, `rejected` 상태와 사용 횟수 반환 |
| 태그 상태 변경 | `PATCH /api/admin/tags/:id` | `{ status: "pending" \| "approved" \| "rejected", memo? }` | 검토 완료, 추천 제외, 재검토 상태 전환 |

Admin status model:

- Report status: `pending` = 접수, `resolved` = 처리 완료, `dismissed` = 기각. 처리 완료/기각 상태는 `pending`으로 되돌려 재처리할 수 있어야 합니다.
- Tag status: `pending` = 검토 중, `approved` = 검토 완료, `rejected` = 추천 제외. 승인/제외된 태그도 `pending`으로 되돌려 재검토할 수 있어야 합니다.

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
