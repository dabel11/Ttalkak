# Ttalkak Backend API Contract

프론트엔드와 백엔드 연동 시 유지해야 하는 현재 API 응답 계약입니다.

이 문서는 `trytur/develop` 브랜치의 실제 구현을 기준으로 작성합니다.

---

## 1. 공통 인증 정책

### 인증 헤더

로그인이 필요한 API는 아래 헤더를 요구합니다.

```http
Authorization: Bearer demo-token-{memberId}
```

현재 `demo-token`은 프론트 연동 검증용 임시 인증 방식입니다.

- 토큰 서명 검증이 없는 개발용 구조입니다.
- 운영 배포 전 JWT 또는 세션 인증으로 교체해야 합니다.
- 탈퇴하거나 비활성화된 회원의 토큰은 인증되지 않습니다.

### 공통 상태 코드

토큰이 없거나 잘못된 경우:

```text
401 Unauthorized
```

일반 사용자가 관리자 API를 호출하거나, 다른 사용자의 데이터를 수정·삭제하려는 경우:

```text
403 Forbidden
```

대상을 찾을 수 없는 경우:

```text
404 Not Found
```

---

## 2. 인증 응답

### 로그인

```http
POST /api/auth/login
```

요청 예시:

```json
{
  "userId": "admin",
  "password": "Admin1234!"
}
```

응답 예시:

```json
{
  "user": {
    "id": 1,
    "userId": "admin",
    "nickname": "admin",
    "role": "admin",
    "active": true
  },
  "accessToken": "demo-token-1"
}
```

`user.role`은 프론트 응답에서 아래 소문자 값으로 반환합니다.

```text
user
admin
```

DB와 Spring Security 내부 역할은 각각 `USER`, `ADMIN`을 사용합니다.

---

## 3. 개발용 관리자 계정

빈 DB에서 백엔드를 최초 실행하면 개발용 관리자 계정을 자동 생성합니다.

기본 계정:

```text
아이디: admin
비밀번호: Admin1234!
역할: ADMIN
```

로그인 응답에서는 다음과 같이 반환됩니다.

```json
{
  "role": "admin"
}
```

설정 가능한 환경변수:

```text
ADMIN_SEED_ENABLED
ADMIN_USER_ID
ADMIN_PASSWORD
ADMIN_NICKNAME
ADMIN_NAME
```

기본 관리자 비밀번호는 개발 환경 전용입니다. 운영 환경에서는 반드시 환경변수로 변경해야 합니다.

---

## 4. 목록 API 응답 형식

현재 목록 API는 모두 동일한 형식이 아닙니다.

프론트에서는 아래 구분을 따라야 합니다.

| API | 인증 | 현재 응답 형식 |
|---|---:|---|
| `GET /api/prompts` | 선택 | 페이지 객체 |
| `GET /api/me/library` | 필수 | 페이지 객체 |
| `GET /api/me/prompts` | 필수 | 페이지 객체 |
| `GET /api/me/comments` | 필수 | 페이지 객체 |
| `GET /api/me/reports` | 필수 | 페이지 객체 |
| `GET /api/make/threads` | 필수 | 배열 |
| `GET /api/make/folders` | 필수 | 배열 |
| `GET /api/admin/reports` | ADMIN | 배열 |
| `GET /api/admin/tags` | ADMIN | 배열 |
| `GET /api/admin/prompts` | ADMIN | 페이지 객체 |
| `GET /api/me/revision-requests` | 필수 | 배열 |
| `GET /api/admin/revision-requests` | ADMIN | 배열 |

### 공통 페이지 객체

페이지 객체를 반환하는 API는 아래 필드를 사용합니다.

```json
{
  "items": [],
  "content": [],
  "page": 1,
  "size": 16,
  "total": 0,
  "totalPages": 0
}
```

- `items`와 `content`는 같은 목록의 호환용 필드입니다.
- 프론트에서는 `items`를 우선 사용해도 됩니다.
- `page`는 현재 1부터 시작합니다.
- 일부 API는 `size`와 `pageSize`를 모두 지원합니다.

배열을 반환하는 API 예시:

```json
[
  {
    "id": 1
  }
]
```

응답 형식을 변경할 때는 프론트와 백엔드를 동시에 수정해야 합니다.

---

## 5. Prompt 목록 및 검색

### 목록 조회

```http
GET /api/prompts
```

주요 쿼리 파라미터:

```text
scope
query
sort
page
size
pageSize
```

검색 범위:

```text
all
tag
keyword
author
```

정렬:

```text
popular
latest
saves
likes
comments
```

호출 예시:

```http
GET /api/prompts?scope=tag&query=marketing&page=1&size=16
GET /api/prompts?scope=keyword&query=SEO&sort=latest&page=1&size=16
GET /api/prompts?scope=author&query=nickname&page=1&size=16
```

각 Prompt 응답 필드:

```json
{
  "id": 1,
  "title": "string",
  "text": "string",
  "tags": [],
  "views": 0,
  "likes": 0,
  "comments": 0,
  "saves": 0,
  "createdAt": "2026-07-10T00:00:00",
  "author": {
    "id": 1,
    "nickname": "string"
  },
  "owner": "string",
  "isSaved": false,
  "isLiked": false,
  "isMine": false,
  "isShared": true,
  "isReported": false
}
```

프론트에서 아래 필드명을 임의로 변경하면 안 됩니다.

```text
author.id
author.nickname
isSaved
isLiked
isMine
isShared
isReported
createdAt
```

---

## 6. My Page 목록

아래 API는 모두 로그인이 필요하며 페이지 객체를 반환합니다.

```http
GET /api/me/library
GET /api/me/prompts
GET /api/me/comments
GET /api/me/reports
GET /api/me/revision-requests
```

주요 페이지 파라미터:

```text
page
size
pageSize
```

### 내 댓글 응답 주요 필드

```json
{
  "id": 1,
  "promptId": 1,
  "parentId": null,
  "text": "댓글 내용",
  "likes": 0,
  "edited": false,
  "deleted": false,
  "hidden": false,
  "hiddenAt": null,
  "isMine": true,
  "createdAt": "2026-07-10T00:00:00",
  "promptTitle": "원문 프롬프트 제목",
  "prompt": {
    "id": 1,
    "title": "원문 프롬프트 제목",
    "text": "원문 프롬프트 내용",
    "author": {
      "id": 1,
      "nickname": "작성자 닉네임"
    }
  }
}
```

`deleted=true`인 댓글은 프론트에서 다음 문구로 표시합니다.

```text
삭제된 댓글입니다.
```

`hidden=true`인 댓글은 일반 사용자 응답에서 원문 대신 다음 문구를 반환합니다.

```text
관리자에 의해 숨겨진 댓글입니다.
```

일반 사용자에게는 `hiddenAt=null`로 반환합니다.

관리자 댓글 조회 및 관리자 신고 응답에서는 숨겨진 댓글의 원문과 숨김 시각을 확인할 수 있습니다.

---

## 7. 저장 및 좋아요

### 저장

```http
POST /api/prompts/{id}/save
DELETE /api/prompts/{id}/save
```

저장 목록 조회:

```http
GET /api/me/library?filter=community
```

### 좋아요

```http
POST /api/prompts/{id}/like
DELETE /api/prompts/{id}/like
```

좋아요 목록 조회:

```http
GET /api/me/library?filter=liked
```

저장 또는 좋아요 취소 성공 후 프론트는 관련 목록을 다시 조회해야 합니다.

---

## 8. Make API

Make API는 모두 로그인이 필요합니다.

비로그인 요청은 빈 배열이 아니라 다음 상태를 반환합니다.

```text
401 Unauthorized
```

### Thread 목록

```http
GET /api/make/threads
```

현재 응답 형식은 배열입니다.

```json
[
  {
    "id": 1,
    "threadId": 1,
    "folderId": 1,
    "title": "string",
    "messages": [],
    "createdAt": "2026-07-10T00:00:00",
    "updatedAt": "2026-07-10T00:00:00"
  }
]
```

### Thread 저장 및 수정

```http
POST /api/make/threads
```

요청에 `id` 또는 `threadId`가 존재하면 본인의 기존 thread를 수정합니다.

둘 다 없으면 새 thread를 생성합니다.

프론트 임시 ID 예시:

```text
thread-1783608277086
```

위와 같은 문자열 임시 ID는 백엔드 폴더 이동 API에 직접 보내면 안 됩니다.

서버 저장 후 반환된 숫자 ID를 사용해야 합니다.

```http
PATCH /api/make/threads/{numberId}/folder
```

### Folder 목록

```http
GET /api/make/folders
```

현재 응답 형식은 배열입니다.

```json
[
  {
    "id": 1,
    "name": "폴더 이름",
    "createdAt": "2026-07-10T00:00:00"
  }
]
```

---

## 9. 신고 API

신고 생성은 로그인 사용자만 가능합니다.

```http
POST /api/reports/prompts/{promptId}
POST /api/reports/comments/{commentId}
```

비로그인 요청:

```text
401 Unauthorized
```

### 신고 응답

일반 신고 생성, 내 신고 목록, 관리자 신고 목록은 동일한 신고 맥락 필드를 사용합니다.

```json
{
  "id": 1,
  "targetType": "comment",
  "targetId": 1,
  "reporterId": 2,
  "reporterNickname": "신고자",
  "reason": "신고 사유",
  "status": "pending",
  "memo": null,
  "reviewedAt": null,
  "createdAt": "2026-07-10T00:00:00",
  "targetExists": true,
  "targetDeleted": false,
  "targetHidden": false,
  "targetPreview": "신고 대상 내용 미리보기",
  "targetAuthorId": 3,
  "targetAuthorNickname": "대상 작성자",
  "promptId": 10,
  "promptTitle": "원문 프롬프트 제목",
  "promptAuthorId": 4,
  "promptAuthorNickname": "프롬프트 작성자",
  "parentId": null
}
```

### 필드 의미

- `reporterId`: 신고자 회원 ID
- `reporterNickname`: 신고자 닉네임
- `targetExists`: 신고 대상이 현재 DB에 존재하는지 여부
- `targetDeleted`: 신고 대상의 삭제 상태
- `targetPreview`: 신고 대상의 최대 200자 미리보기
- `targetAuthorId`: 신고 대상 작성자 ID
- `targetAuthorNickname`: 신고 대상 작성자 닉네임
- `promptId`: 연관된 프롬프트 ID
- `promptTitle`: 연관된 프롬프트 제목
- `promptAuthorId`: 연관된 프롬프트 작성자 ID
- `promptAuthorNickname`: 연관된 프롬프트 작성자 닉네임
- `parentId`: 답글인 경우 부모 댓글 ID

신고 대상이 실제 삭제되어 존재하지 않으면 일부 맥락 필드는 `null`일 수 있습니다.

---

## 10. 관리자 API

관리자 API는 `ADMIN` 역할이 필요합니다.

```http
GET /api/admin/reports
PATCH /api/admin/reports/{id}/status
GET /api/admin/tags
PATCH /api/admin/tags/{id}/status
GET /api/admin/prompts
GET /api/admin/users/{memberId}/activities
GET /api/admin/revision-requests
PATCH /api/admin/revision-requests/{requestId}/status
PATCH /api/admin/prompts/{id}/hide
PATCH /api/admin/prompts/{id}/restore
DELETE /api/admin/comments/{commentId}
PATCH /api/admin/comments/{commentId}/hide
PATCH /api/admin/comments/{commentId}/unhide
```

### 사용자 활동 조회

```http
GET /api/admin/users/{memberId}/activities?limit=20
```

- `ADMIN` 역할만 호출할 수 있습니다.
- 존재하지 않는 회원 ID는 `404 Not Found`를 반환합니다.
- `limit` 기본값은 20이며 최소 1, 최대 100으로 제한합니다.
- 회원 기본 정보, 유형별 활동 수와 최근 활동을 반환합니다.
- 최근 활동은 `occurredAt` 내림차순으로 정렬합니다.
- 프롬프트 수정과 Make 스레드 수정은 `updatedAt`을 활동 시각으로 사용합니다.
- 댓글, 신고, Make 폴더는 `createdAt`을 활동 시각으로 사용합니다.

응답 예시:

```json
{
  "member": {
    "id": 5,
    "userId": "user01",
    "nickname": "사용자",
    "name": "사용자 이름",
    "role": "USER",
    "active": true,
    "createdAt": "2026-07-14T14:11:10",
    "withdrawnAt": null
  },
  "summary": {
    "prompts": 1,
    "comments": 2,
    "reports": 1,
    "makeThreads": 1,
    "makeFolders": 1,
    "total": 6
  },
  "activities": [
    {
      "type": "comment",
      "id": 9,
      "promptId": 6,
      "parentId": null,
      "preview": "댓글 내용 미리보기",
      "status": "active",
      "createdAt": "2026-07-14T15:15:54",
      "occurredAt": "2026-07-14T15:15:54"
    }
  ],
  "limit": 20,
  "returned": 6,
  "latestActivityAt": "2026-07-14T15:15:54"
}
```

활동 유형:

```text
prompt
comment
report
make_thread
make_folder
```

### 신고 상태 변경

```http
PATCH /api/admin/reports/{id}/status
```

요청:

```json
{
  "status": "reviewed",
  "memo": "신고 내용을 확인했습니다."
}
```

현재 기본 신고 상태는 다음과 같습니다.

```text
pending
```

현재 구현은 상태 문자열을 소문자로 저장하지만 허용 상태를 enum으로 엄격하게 제한하지는 않습니다.

신고 상태값의 정식 제한은 추후 작업입니다.

### 관리자 목록 응답

현재 아래 API는 페이지 객체가 아니라 배열을 반환합니다.

```http
GET /api/admin/reports
GET /api/admin/tags
GET /api/admin/revision-requests
```

---

## 11. 프롬프트 수정 요청 API

다른 사용자가 공유한 프롬프트에 개선 내용을 제안하고, 관리자가 승인하거나 거절하는 기능입니다.

### 수정 요청 등록

```http
POST /api/prompts/{promptId}/revision-requests
```

- 로그인이 필요합니다.
- 공유 중이며 삭제되지 않은 프롬프트에만 요청할 수 있습니다.
- 본인이 작성한 프롬프트에는 수정 요청을 등록할 수 없습니다.
- 같은 사용자가 같은 프롬프트에 `pending` 요청을 중복 등록하면 `409 Conflict`를 반환합니다.
- `title`, `text`, `tags` 중 생략된 값은 기존 프롬프트 값을 사용합니다.
- 기존 프롬프트와 실제로 다른 내용이 하나 이상 있어야 합니다.
- 제목이나 본문을 전달할 경우 빈 문자열은 허용하지 않습니다.

요청 예시:

```json
{
  "title": "개선된 프롬프트 제목",
  "text": "개선된 프롬프트 본문",
  "tags": ["요약", "문서"],
  "reason": "출력 형식을 더 명확하게 만들었습니다."
}
```

성공 상태 코드는 `201 Created`입니다.

### 내 수정 요청 목록

```http
GET /api/me/revision-requests
GET /api/me/revision-requests?status=pending
```

- 로그인한 사용자가 직접 등록한 요청만 반환합니다.
- 배열 응답이며 `createdAt` 내림차순으로 정렬합니다.
- `status`는 `all`, `pending`, `approved`, `rejected`를 사용할 수 있습니다.
- 기본값은 `all`입니다.

### 관리자 수정 요청 목록

```http
GET /api/admin/revision-requests
GET /api/admin/revision-requests?status=pending
```

- `ADMIN` 역할만 호출할 수 있습니다.
- 배열 응답이며 `createdAt` 내림차순으로 정렬합니다.
- `status`는 `all`, `pending`, `approved`, `rejected`를 사용할 수 있습니다.

### 관리자 승인 및 거절

```http
PATCH /api/admin/revision-requests/{requestId}/status
```

승인 요청:

```json
{
  "status": "approved",
  "memo": "제안 내용을 프롬프트에 반영했습니다."
}
```

거절 요청:

```json
{
  "status": "rejected",
  "memo": "기존 프롬프트의 목적과 맞지 않습니다."
}
```

처리 정책:

- `status`는 `approved` 또는 `rejected`만 허용합니다.
- 승인 시 제안된 제목, 본문, 태그를 실제 프롬프트에 반영합니다.
- 거절 시 실제 프롬프트 내용은 변경하지 않습니다.
- 처리한 관리자 ID를 `reviewedBy`에 저장합니다.
- 처리 시각을 `reviewedAt`에 저장합니다.
- 이미 처리된 요청을 다시 처리하면 `409 Conflict`를 반환합니다.
- 삭제된 프롬프트의 수정 요청은 승인할 수 없습니다.

응답 주요 필드:

```json
{
  "id": 1,
  "promptId": 6,
  "requester": {
    "id": 5,
    "nickname": "사용자"
  },
  "reason": "수정 요청 사유",
  "status": "approved",
  "original": {
    "title": "기존 제목",
    "text": "기존 본문",
    "tags": ["기존 태그"]
  },
  "proposed": {
    "title": "제안 제목",
    "text": "제안 본문",
    "tags": ["제안 태그"]
  },
  "adminMemo": "관리자 처리 메모",
  "reviewedBy": 1,
  "reviewedAt": "2026-07-14T16:10:00",
  "createdAt": "2026-07-14T16:09:00"
}
```

---

## 12. 댓글 삭제 및 숨김 정책

### 댓글 삭제

- 작성자 또는 관리자만 일반 댓글 삭제 API를 사용할 수 있습니다.
- 관리자는 `DELETE /api/admin/comments/{commentId}`를 사용할 수 있습니다.
- 답글이 없는 댓글은 DB에서 실제 삭제합니다.
- 답글이 있는 부모 댓글은 soft delete 처리합니다.
- soft delete된 댓글은 `deleted=true`가 됩니다.
- 본문은 `삭제된 댓글입니다.`로 변경됩니다.
- 기존 답글은 유지됩니다.
- 마지막 답글이 삭제되면 soft delete된 부모 댓글도 DB에서 정리됩니다.

### 관리자 댓글 숨김

```http
PATCH /api/admin/comments/{commentId}/hide
PATCH /api/admin/comments/{commentId}/unhide
```

- 댓글 숨김과 숨김 해제는 `ADMIN` 역할만 가능합니다.
- 숨김은 원문을 삭제하지 않으며 `hidden=true`와 `hiddenAt`을 저장합니다.
- 일반 사용자에게는 원문 대신 `관리자에 의해 숨겨진 댓글입니다.`를 반환합니다.
- 관리자 댓글 조회와 관리자 신고 응답에서는 원문을 확인할 수 있습니다.
- 중복 숨김 또는 중복 숨김 해제 요청은 성공 응답과 함께 `changed=false`를 반환합니다.
- 숨겨진 댓글은 수정, 답글 작성, 좋아요가 제한됩니다.
- 숨김 처리 시 프롬프트의 공개 댓글 수를 1 감소시킵니다.
- 숨김 해제 시 공개 댓글 수를 1 증가시킵니다.
- 이미 숨겨진 댓글을 삭제하더라도 댓글 수를 다시 감소시키지 않습니다.

---

## 13. 회원탈퇴

```http
DELETE /api/auth/withdraw
```

요청:

```json
{
  "password": "user password"
}
```

정책:

- 로그인한 사용자 본인만 탈퇴할 수 있습니다.
- 비밀번호가 일치해야 합니다.
- 탈퇴 시 `active=false` 처리합니다.
- 탈퇴 이후 같은 demo token은 더 이상 인증되지 않습니다.
- 탈퇴 계정은 재로그인할 수 없습니다.
- 기존 프롬프트, 댓글, Make 데이터는 즉시 삭제하지 않고 보존합니다.
- 탈퇴 회원의 닉네임과 이름은 비식별 형태로 변경합니다.

---

## 14. 현재 남은 주요 작업

아래 기능은 아직 최종 구현이 아닙니다.

- demo token을 JWT 또는 세션 인증으로 교체
- 신고 상태값 enum 및 전이 규칙
- 태그 추천 상태값 enum 및 전이 규칙
- Make와 Admin 목록 API 페이지네이션 통일
- 운영 환경 관리자 기본 비밀번호 제거

API 응답 형식을 변경할 때는 반드시 프론트 담당자와 동시에 수정합니다.
