# TTALKAK API Spec Draft

프론트엔드 프로토타입 기준의 백엔드 API 초안입니다. 실제 경로와 응답 형태는 Spring Boot 구현 방식에 맞춰 조정해도 됩니다.

## Auth

| 기능 | Method + path | Request body | Response |
| --- | --- | --- | --- |
| 로그인 | `POST /api/auth/login` | `{ userId, password }` | `{ user, accessToken }` |
| 회원가입 | `POST /api/auth/signup` | `{ name, birth, phone, userId, password }` | `{ user, accessToken }` |
| 아이디 찾기 | `POST /api/auth/find-id` | `{ name, phone }` | `{ maskedUserId }` |
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
| 프롬프트 상세 | `GET /api/prompts/:id` | none | 본문, 태그, 카운트, 작성자, 소유 여부, 저장/좋아요/신고 여부 |
| 조회수 증가 | `POST /api/prompts/:id/view` | none | 상세 팝업 오픈 시 호출 |

## Prompt Actions

| 기능 | Method + path | Request body | Response notes |
| --- | --- | --- | --- |
| 프롬프트 공유 | `POST /api/prompts` | `{ title, text, tags }` | 내 프롬프트를 공유 상태로 생성 |
| 공유 취소 | `PATCH /api/prompts/:id/visibility` | `{ isShared: false }` | Home에서 제거, Saved에는 내 프롬프트로 유지 |
| 비공개 프롬프트 공유 | `PATCH /api/prompts/:id/visibility` | `{ isShared: true }` | Saved의 내 프롬프트를 Home에 노출 |
| 프롬프트 삭제 | `DELETE /api/prompts/:id` | none | 소유자만 가능 |
| 저장 | `POST /api/prompts/:id/save` | none | 저장 수와 `isSaved` 반환 |
| 저장 취소 | `DELETE /api/prompts/:id/save` | none | 저장 수와 `isSaved` 반환 |
| 좋아요 | `POST /api/prompts/:id/like` | none | 좋아요 수와 `isLiked` 반환 |
| 좋아요 취소 | `DELETE /api/prompts/:id/like` | none | 좋아요 수와 `isLiked` 반환 |
| 프롬프트 신고 | `POST /api/reports/prompts/:id` | `{ reason }` | 동일 사용자 중복 신고 방지 |

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

Saved 화면은 저장한 커뮤니티 프롬프트와 내 프롬프트를 함께 보여줍니다. Saved 화면에서 저장 취소를 누르면 즉시 목록에서 사라지지 않고, 사용자가 다른 화면으로 이동할 때 저장 취소를 확정하는 UX입니다.

| 기능 | Method + path | Request body | Response notes |
| --- | --- | --- | --- |
| Saved 목록 | `GET /api/prompts/my?filter=all&page=1&pageSize=16` | none | `filter=all|community|mine|liked` 권장 |
| 저장 취소 확정 | `DELETE /api/prompts/:id/save` | none | Saved 이탈 시 pending 항목에 대해 호출 |

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
  "author": { "id": "user-1", "name": "김지수" },
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
  "author": { "id": "user-2", "name": "이서연" },
  "text": "브랜드 톤앤매너를 추가하면 결과가 더 정확해질 것 같습니다.",
  "likes": 2,
  "edited": true,
  "isMine": false,
  "isLiked": false,
  "isReported": false,
  "replies": [
    {
      "id": "reply-1",
      "author": { "id": "user-3", "name": "박민준" },
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
