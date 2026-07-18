# TTalkak Backend API Contract

이 문서는 프론트엔드와 백엔드 사이에서 응답 구조, 권한 오류 코드, 관리자 기능 및 데이터 처리 정책을 일관되게 맞추기 위한 계약 문서입니다.

최종 수정일: 2026-07-18

---

## 1. 공통 응답 규칙

### 1.1 날짜 형식

날짜 및 시각은 기본적으로 ISO 8601 문자열을 사용합니다.

```json
"2026-07-17T14:30:00"
```

값이 존재하지 않는 경우 `null`을 반환합니다.

---

### 1.2 회원 요약 구조

게시물 작성자, 댓글 작성자, 신고자, 관리자 등 회원을 간단히 표시할 때 다음 구조를 사용합니다.

```json
{
  "id": 10,
  "nickname": "사용자닉네임"
}
```

관련 회원 정보를 찾을 수 없거나 작성자 정보가 없는 경우 `null`이 반환될 수 있습니다.

기존의 다음과 같은 분리 필드는 사용하지 않습니다.

```text
authorId
authorNickname
reporterId
reporterNickname
promptAuthorId
promptAuthorNickname
```

대신 다음과 같이 객체 형태로 통일합니다.

```json
{
  "author": {
    "id": 10,
    "nickname": "사용자닉네임"
  }
}
```

---

## 2. 공통 오류 응답

오류 응답은 다음 구조를 사용합니다.

```json
{
  "timestamp": "2026-07-17T14:30:00+09:00",
  "status": 403,
  "error": "Forbidden",
  "code": "OWNER_ONLY",
  "message": "작성자만 수정할 수 있습니다.",
  "path": "/api/prompts/10"
}
```

### 주요 오류 코드

| HTTP 상태 | code                      | 의미                  |
| ------- | ------------------------- | ------------------- |
| 400     | `NICKNAME_REQUIRED`       | 관리자 회원 검색 시 닉네임 누락 |
| 401     | `LOGIN_REQUIRED`          | 로그인이 필요한 기능         |
| 403     | `OWNER_ONLY`              | 작성자 또는 소유자만 가능한 기능  |
| 403     | `ADMIN_ONLY`              | 관리자만 가능한 기능         |
| 403     | `ACCOUNT_BLOCKED`         | 차단된 계정              |
| 403     | `ACCESS_DENIED`           | 기타 접근 권한 부족         |
| 403     | `ADMIN_ACCOUNT_PROTECTED` | 관리자 계정 차단 시도        |
| 400     | `BLOCK_REASON_REQUIRED`   | 회원 차단 사유 누락         |
| 409     | `ACCOUNT_WITHDRAWN`       | 이미 탈퇴한 계정 대상 작업     |
| 400     | `INVALID_REQUEST`         | 잘못된 요청              |
| 404     | `RESOURCE_NOT_FOUND`      | 대상 리소스를 찾을 수 없음     |
| 409     | `CONFLICT`                | 현재 상태에서 처리할 수 없는 요청 |

로그인 아이디·비밀번호 불일치, 잘못된 Google 인증 토큰 등은 단순히 로그인이 필요한 상황과 의미가 다르므로 별도의 인증 실패 응답으로 처리될 수 있습니다.

---

## 3. 프롬프트 권한 정책

프롬프트 수정, 삭제 및 공유 상태 변경은 작성자만 수행할 수 있습니다.

### 작성자 전용 API

```text
PATCH /api/prompts/{id}
DELETE /api/prompts/{id}
PATCH /api/prompts/{id}/visibility
```

작성자가 아닌 사용자가 요청하면 다음과 같이 반환합니다.

```json
{
  "status": 403,
  "code": "OWNER_ONLY",
  "message": "작성자만 수정할 수 있습니다."
}
```

각 API의 메시지는 작업에 따라 다를 수 있습니다.

```text
작성자만 수정할 수 있습니다.
작성자만 삭제할 수 있습니다.
작성자만 공유 상태를 변경할 수 있습니다.
```

---

## 4. 마이페이지 댓글 조회

### API

```text
GET /api/me/comments
```

### Query Parameters

| 이름         | 필수  | 기본값  | 설명               |
| ---------- | --- | ---- | ---------------- |
| `page`     | 아니요 | `1`  | 페이지 번호           |
| `size`     | 아니요 | `16` | 페이지 크기           |
| `pageSize` | 아니요 | `16` | `size`가 없을 경우 사용 |

### 응답 예시

```json
{
  "items": [
    {
      "id": 31,
      "promptId": 10,
      "parentId": null,
      "text": "작성한 댓글 내용",
      "likes": 2,
      "edited": false,
      "deleted": false,
      "hidden": false,
      "hiddenAt": null,
      "isMine": true,
      "createdAt": "2026-07-17T14:30:00",
      "promptTitle": "프롬프트 제목",
      "prompt": {
        "id": 10,
        "title": "프롬프트 제목",
        "text": "프롬프트 본문",
        "author": {
          "id": 5,
          "nickname": "프롬프트작성자"
        }
      }
    }
  ],
  "content": [
    {
      "id": 31
    }
  ],
  "page": 1,
  "size": 16,
  "total": 1,
  "totalPages": 1
}
```

`items`와 `content`에는 동일한 데이터가 들어갑니다.

대상 프롬프트가 삭제되었거나 존재하지 않는 경우 다음과 같이 반환될 수 있습니다.

```json
{
  "promptTitle": null,
  "prompt": null
}
```

관리자에 의해 숨김 처리된 댓글은 실제 댓글 내용 대신 숨김 안내 문구가 반환됩니다.

현재 미로그인 상태에서는 예외 대신 빈 목록이 반환됩니다.

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

---

## 5. 댓글 수 집계 정책

프롬프트의 댓글 수에는 다음 항목을 포함합니다.

* 삭제되지 않은 일반 댓글
* 삭제되지 않은 답글
* 숨김 처리되지 않은 댓글 및 답글

다음 항목은 댓글 수에서 제외합니다.

* 작성자가 삭제한 댓글
* 관리자가 숨김 처리한 댓글
* 삭제된 부모 댓글을 표시하기 위한 안내용 자리 표시자

부모 댓글이 삭제되었더라도 삭제되지 않은 답글은 각각 댓글 수에 포함됩니다.

---

## 6. 신고 응답 구조

신고 응답은 신고 대상에 대한 문맥을 함께 반환합니다.

### 공통 응답 예시

```json
{
  "id": 7,
  "targetType": "comment",
  "targetId": 31,
  "reporter": {
    "id": 8,
    "nickname": "신고자"
  },
  "reason": "부적절한 내용입니다.",
  "status": "pending",
  "memo": null,
  "reviewedAt": null,
  "createdAt": "2026-07-17T14:30:00",
  "targetExists": true,
  "targetDeleted": false,
  "targetHidden": false,
  "targetPreview": "신고 대상 내용 미리보기",
  "author": {
    "id": 12,
    "nickname": "대상작성자"
  },
  "promptId": 10,
  "promptTitle": "관련 프롬프트 제목",
  "promptAuthor": {
    "id": 5,
    "nickname": "프롬프트작성자"
  },
  "parentId": null,
  "promptContent": null,
  "commentContent": "신고 대상 댓글 전체 내용"
}
```

### targetType이 `prompt`인 경우

다음 필드에 대상 프롬프트 정보가 포함됩니다.

```json
{
  "targetType": "prompt",
  "promptId": 10,
  "promptTitle": "프롬프트 제목",
  "promptContent": "프롬프트 전체 내용",
  "author": {
    "id": 5,
    "nickname": "프롬프트작성자"
  },
  "promptAuthor": {
    "id": 5,
    "nickname": "프롬프트작성자"
  }
}
```

### targetType이 `comment`인 경우

다음 필드에 대상 댓글과 원본 프롬프트 문맥이 포함됩니다.

```json
{
  "targetType": "comment",
  "commentContent": "댓글 전체 내용",
  "promptId": 10,
  "promptTitle": "관련 프롬프트 제목",
  "parentId": null,
  "author": {
    "id": 12,
    "nickname": "댓글작성자"
  },
  "promptAuthor": {
    "id": 5,
    "nickname": "프롬프트작성자"
  }
}
```

대상 게시물이나 댓글이 존재하지 않으면 다음과 같이 반환됩니다.

```json
{
  "targetExists": false,
  "targetDeleted": null,
  "targetHidden": null,
  "targetPreview": null,
  "author": null
}
```

---

## 7. 관리자 신고 처리

### 신고 목록 조회

```text
GET /api/admin/reports
```

### 신고 상태 및 관리자 메모 변경

```text
PATCH /api/admin/reports/{id}/status
```

요청 예시:

```json
{
  "status": "reviewed",
  "memo": "검토 후 게시물 숨김 처리"
}
```

응답에는 변경된 신고의 상태와 관리자 메모가 포함됩니다.

```json
{
  "status": "reviewed",
  "memo": "검토 후 게시물 숨김 처리",
  "reviewedAt": "2026-07-17T14:30:00"
}
```

허용되지 않은 상태 전환은 `409 CONFLICT`로 처리됩니다.

---

## 8. 관리자 회원 검색 및 활동 조회

이 절의 API는 모두 관리자 전용입니다.

* 비로그인 요청: `401 Unauthorized`
* 일반 사용자 요청: `403 Forbidden`
* 존재하지 않는 회원: `404 Not Found`

페이지 번호는 `1`부터 시작합니다.

### 8.1 닉네임 검색

```text
GET /api/admin/users
```

#### Query Parameters

| 이름         | 필수  | 기본값    | 설명                |
| ---------- | --- | ------ | ----------------- |
| `nickname` | 예   | 없음     | 검색할 닉네임. 일부 일치 검색 |
| `page`     | 아니요 | `1`    | 페이지 번호            |
| `size`     | 아니요 | 서버 기본값 | 페이지 크기            |
| `pageSize` | 아니요 | 서버 기본값 | `size`가 없을 경우 사용  |

닉네임 앞뒤 공백은 제거한 후 검색합니다. 영문 닉네임은 대소문자를 구분하지 않고 검색합니다.

요청 예시:

```text
GET /api/admin/users?nickname=카피&page=1&size=20
```

응답 예시:

```json
{
  "items": [
    {
      "id": 2,
      "nickname": "카피메이커",
      "active": true,
      "blocked": false
    }
  ],
  "content": [
    {
      "id": 2,
      "nickname": "카피메이커",
      "active": true,
      "blocked": false
    }
  ],
  "page": 1,
  "size": 20,
  "total": 1,
  "totalPages": 1
}
```

`items`와 `content`에는 동일한 데이터가 포함됩니다.

검색할 닉네임을 입력하지 않거나 공백만 전달하면 다음 오류를 반환합니다.

```json
{
  "status": 400,
  "code": "NICKNAME_REQUIRED",
  "message": "검색할 닉네임을 입력해야 합니다."
}
```

---

### 8.2 사용자 활동 요약 조회

```text
GET /api/admin/users/{memberId}/activity
```

응답 예시:

```json
{
  "user": {
    "id": 2,
    "nickname": "카피메이커",
    "active": true,
    "blocked": false
  },
  "counts": {
    "prompts": 3,
    "comments": 4,
    "replies": 2,
    "submittedReports": 1,
    "receivedReports": 2
  }
}
```

활동 개수의 의미는 다음과 같습니다.

| 필드                 | 의미                      |
| ------------------ | ----------------------- |
| `prompts`          | 사용자가 작성한 프롬프트 수         |
| `comments`         | `parentId`가 없는 일반 댓글 수  |
| `replies`          | `parentId`가 존재하는 답글 수   |
| `submittedReports` | 사용자가 신고한 내역 수           |
| `receivedReports`  | 사용자의 프롬프트·댓글·답글이 신고된 횟수 |

---

### 8.3 작성한 프롬프트 조회

```text
GET /api/admin/users/{memberId}/prompts
```

#### Query Parameters

| 이름         | 필수  | 기본값    | 설명               |
| ---------- | --- | ------ | ---------------- |
| `page`     | 아니요 | `1`    | 페이지 번호           |
| `size`     | 아니요 | 서버 기본값 | 페이지 크기           |
| `pageSize` | 아니요 | 서버 기본값 | `size`가 없을 경우 사용 |

응답은 관리자 프롬프트 목록과 동일한 프롬프트 구조를 사용하며, 작성자 정보는 다음 형태로 포함됩니다.

```json
{
  "author": {
    "id": 2,
    "nickname": "카피메이커"
  }
}
```

삭제·숨김 여부와 현재 상태도 함께 반환됩니다.

---

### 8.4 작성한 댓글 조회

```text
GET /api/admin/users/{memberId}/comments
```

`parentId`가 `null`인 일반 댓글만 반환합니다.

응답 항목 예시:

```json
{
  "id": 21,
  "promptId": 10,
  "parentId": null,
  "text": "작성한 댓글 내용",
  "preview": "작성한 댓글 내용",
  "likes": 0,
  "edited": false,
  "deleted": false,
  "hidden": false,
  "status": "active",
  "author": {
    "id": 2,
    "nickname": "카피메이커"
  },
  "createdAt": "2026-07-18T12:10:00"
}
```

---

### 8.5 작성한 답글 조회

```text
GET /api/admin/users/{memberId}/replies
```

`parentId`가 존재하는 답글만 반환합니다.

응답 항목 예시:

```json
{
  "id": 22,
  "promptId": 10,
  "parentId": 21,
  "text": "작성한 답글 내용",
  "preview": "작성한 답글 내용",
  "likes": 0,
  "edited": false,
  "deleted": false,
  "hidden": false,
  "status": "active",
  "author": {
    "id": 2,
    "nickname": "카피메이커"
  },
  "createdAt": "2026-07-18T12:20:00"
}
```

댓글과 답글의 `status` 값은 다음과 같습니다.

```text
active
hidden
deleted
```

---

### 8.6 사용자가 신고한 내역 조회

```text
GET /api/admin/users/{memberId}/reports/submitted
```

해당 회원이 신고자로 기록된 신고 내역을 최신순으로 반환합니다.

응답 항목은 `6. 신고 응답 구조`와 동일한 형태를 사용합니다.

```json
{
  "id": 31,
  "targetType": "prompt",
  "targetId": 10,
  "reporter": {
    "id": 2,
    "nickname": "카피메이커"
  },
  "reason": "신고 사유",
  "status": "pending",
  "memo": null,
  "reviewedAt": null,
  "createdAt": "2026-07-18T12:30:00"
}
```

---

### 8.7 사용자가 신고당한 내역 조회

```text
GET /api/admin/users/{memberId}/reports/received
```

해당 회원이 작성한 다음 대상에 접수된 신고를 반환합니다.

* 프롬프트
* 댓글
* 답글

프롬프트 신고와 댓글·답글 신고를 합친 뒤 신고 생성 시각 기준 최신순으로 반환합니다.

응답 항목은 `6. 신고 응답 구조`와 동일합니다.

---

### 8.8 기존 통합 활동 조회

```text
GET /api/admin/users/{memberId}/activities
```

기존 호환성을 위해 유지하는 API입니다.

회원의 프롬프트, 댓글, 신고, Make 대화, 폴더 활동 등을 하나의 최신순 목록으로 반환합니다. 프론트의 사용자 활동 탭에서는 활동 유형별 페이지네이션이 가능한 `activity`, `prompts`, `comments`, `replies`, `reports` API 사용을 권장합니다.

---

### 8.9 프론트엔드 작성자 클릭 처리

프롬프트·댓글·답글의 작성자 정보는 다음 객체 형태를 사용합니다.

```json
{
  "author": {
    "id": 2,
    "nickname": "카피메이커"
  }
}
```

작성자 닉네임 클릭 후 사용자 활동 화면으로 이동할 때는 변경될 수 있는 `nickname`이 아니라 `author.id`를 사용합니다.

```text
GET /api/admin/users/{author.id}/activity
```


---

## 9. 관리자 회원 차단

### 회원 차단

```text
PATCH /api/admin/users/{memberId}/block
```

요청:

```json
{
  "reason": "반복적인 이용약관 위반"
}
```

응답:

```json
{
  "id": 10,
  "userId": "test-user",
  "nickname": "test-nickname",
  "role": "USER",
  "active": true,
  "blocked": true,
  "blockedAt": "2026-07-17T14:30:00",
  "blockReason": "반복적인 이용약관 위반"
}
```

차단 사유를 입력하지 않으면 다음 오류가 반환됩니다.

```json
{
  "status": 400,
  "code": "BLOCK_REASON_REQUIRED"
}
```

탈퇴한 회원은 차단할 수 없습니다.

```json
{
  "status": 409,
  "code": "ACCOUNT_WITHDRAWN"
}
```

관리자 계정은 차단할 수 없습니다.

```json
{
  "status": 403,
  "code": "ADMIN_ACCOUNT_PROTECTED"
}
```

---

### 회원 차단 해제

```text
PATCH /api/admin/users/{memberId}/unblock
```

별도의 요청 본문은 필요하지 않습니다.

응답:

```json
{
  "id": 10,
  "blocked": false,
  "blockedAt": null,
  "blockReason": null
}
```

이미 차단이 해제된 회원에게 요청하더라도 현재 회원 상태를 그대로 반환합니다.

---

## 10. 차단 계정 인증 정책

차단된 계정은 다음 인증 방식 모두 사용할 수 없습니다.

* 아이디·비밀번호 로그인
* Google 로그인
* 차단 이전에 발급받은 기존 JWT를 사용한 API 접근

차단된 계정의 응답 예시:

```json
{
  "status": 403,
  "code": "ACCOUNT_BLOCKED",
  "message": "차단된 계정입니다."
}
```

차단 사유가 존재하는 경우 응답 메시지에 사유가 포함될 수 있습니다.

---

## 11. 관리자 게시물 처리

### 게시물 목록 조회

```text
GET /api/admin/prompts
```

### 게시물 숨김

```text
PATCH /api/admin/prompts/{id}/hide
```

### 게시물 복구

```text
PATCH /api/admin/prompts/{id}/restore
```

숨김 또는 복구 후 변경된 게시물 정보가 반환됩니다.

---

## 12. 관리자 댓글 처리

### 댓글 숨김

```text
PATCH /api/admin/comments/{commentId}/hide
```

### 댓글 숨김 해제

```text
PATCH /api/admin/comments/{commentId}/unhide
```

### 관리자 댓글 삭제

```text
DELETE /api/admin/comments/{commentId}
```

일반 사용자가 요청하면 다음 오류가 반환됩니다.

```json
{
  "status": 403,
  "code": "ADMIN_ONLY",
  "message": "관리자 권한이 필요합니다."
}
```

댓글 숨김 및 숨김 해제 시 프롬프트의 댓글 수도 정책에 따라 함께 변경됩니다.

---

## 13. 관리자 태그 처리

### 태그 목록 조회

```text
GET /api/admin/tags
```

### 태그 상태 변경

```text
PATCH /api/admin/tags/{id}/status
```

요청 예시:

```json
{
  "status": "disabled"
}
```

응답에는 변경된 태그 정보가 반환됩니다.

허용되지 않은 상태 전환은 `409 CONFLICT`로 처리됩니다.

---


## 13-1. 관리자 → 작성자 수정 요청

### 수정 요청 생성

```text
POST /api/admin/prompts/{promptId}/author-revision-requests
```

요청 본문:

```json
{
  "message": "수정 요청 내용"
}
```

동일한 게시물에 `pending` 또는 `acknowledged` 상태의 요청이 이미 존재하면 `409 CONFLICT`를 반환합니다.

```json
{
  "code": "AUTHOR_REVISION_REQUEST_ALREADY_ACTIVE",
  "message": "이미 처리 중인 관리자 수정 요청이 있습니다."
}
```

### 수정 요청 내용 변경

```text
PATCH /api/admin/author-revision-requests/{requestId}
```

요청 본문:

```json
{
  "message": "변경된 수정 요청 내용"
}
```

수정 요청 내용은 작성자가 아직 확인하지 않은 `pending` 상태에서만 변경할 수 있습니다.

* `pending`: 수정 가능
* `acknowledged`: 수정 불가
* `completed`: 수정 불가
* `rejected`: 수정 불가

수정할 수 없는 상태에서 요청하면 `409 CONFLICT`를 반환합니다.

관리자 수정 요청 생성과 내용 변경은 관리자 감사 로그에 기록됩니다.

---

## 14. 관리자 감사 로그

관리자의 주요 데이터 변경 작업은 감사 로그로 저장됩니다.

기록 대상은 다음과 같습니다.

* 회원 차단
* 회원 차단 해제
* 신고 상태 및 관리자 메모 변경
* 게시물 숨김
* 게시물 복구
* 댓글 숨김
* 댓글 숨김 해제
* 관리자 댓글 삭제
* 관리자 수정 요청 생성
* 관리자 수정 요청 내용 변경
* 사용자 제출 수정 요청 승인·거절
* 태그 상태 변경

### 감사 로그 조회

```text
GET /api/admin/audit-logs
```

### Query Parameters

| 이름         | 필수  | 기본값    | 설명               |
| ---------- | --- | ------ | ---------------- |
| `page`     | 아니요 | `1`    | 페이지 번호           |
| `size`     | 아니요 | 서버 기본값 | 페이지 크기           |
| `pageSize` | 아니요 | 서버 기본값 | `size`가 없는 경우 사용 |

### 응답 예시

```json
{
  "items": [
    {
      "id": 1,
      "admin": {
        "id": 99,
        "nickname": "admin-nickname"
      },
      "action": "USER_BLOCK",
      "targetType": "USER",
      "targetId": 10,
      "detail": "차단 사유: 반복적인 이용약관 위반",
      "createdAt": "2026-07-17T14:30:00"
    }
  ],
  "content": [
    {
      "id": 1
    }
  ],
  "page": 1,
  "size": 20,
  "total": 1,
  "totalPages": 1
}
```

### action 값

| action                 | 의미             |
| ---------------------- | -------------- |
| `USER_BLOCK`           | 회원 차단          |
| `USER_UNBLOCK`         | 회원 차단 해제       |
| `REPORT_STATUS_CHANGE` | 신고 상태 또는 메모 변경 |
| `PROMPT_HIDE`          | 게시물 숨김         |
| `PROMPT_RESTORE`       | 게시물 복구         |
| `COMMENT_HIDE`         | 댓글 숨김           |
| `COMMENT_RESTORE`      | 댓글 숨김 해제       |
| `COMMENT_DELETE`                       | 관리자 댓글 삭제           |
| `AUTHOR_REVISION_REQUEST_CREATE`       | 관리자 수정 요청 생성      |
| `AUTHOR_REVISION_REQUEST_UPDATE`       | 관리자 수정 요청 내용 변경 |
| `REVISION_REQUEST_STATUS_CHANGE`       | 사용자 제출 수정 요청 상태 변경 |
| `TAG_STATUS_CHANGE`    | 태그 상태 변경       |

### targetType 값

```text
USER
REPORT
PROMPT
COMMENT
AUTHOR_REVISION_REQUEST
REVISION_REQUEST
TAG
```

### detail 기록 기준

`detail`에는 관리자가 로그만 확인해도 작업 대상을 식별할 수 있도록 다음과 같은 맥락 정보를 함께 기록합니다.

* 회원 차단·해제: 대상 닉네임, 회원 ID, 차단 사유
* 신고 처리: 신고 대상 종류와 ID, 신고 사유 미리보기, 상태 변경 전후, 관리자 메모
* 게시물 숨김·복구: 게시물 제목, 작성자 닉네임
* 댓글 숨김·복구·삭제: 게시물 ID, 댓글 작성자 닉네임, 댓글 내용 미리보기
* 태그 상태 변경: 태그명, 상태 변경 전후
* 사용자 제출 수정 요청 처리: 수정 요청 ID, 게시물 ID와 제목, 요청자 닉네임, 상태 변경 전후, 관리자 메모

긴 댓글·신고 사유·관리자 메모는 전체 원문 대신 제한된 길이의 미리보기로 기록하며, 감사 목적에 불필요한 개인정보는 추가로 저장하지 않습니다.

감사 로그와 실제 데이터 변경은 하나의 트랜잭션으로 처리됩니다. 따라서 실제 데이터 변경 또는 감사 로그 저장 중 하나라도 실패하면 전체 작업이 롤백됩니다.

---

## 15. 회원탈퇴 데이터 정책

회원탈퇴 시 회원 계정은 비활성화 및 개인정보 비식별 처리를 합니다.

기존 프롬프트와 댓글은 삭제하지 않고 유지합니다.

작성자 닉네임은 다음 값으로 변경됩니다.

```text
탈퇴한 사용자
```

따라서 기존 게시물·댓글·답글 구조와 커뮤니티 기록은 유지되지만, 탈퇴한 회원의 기존 닉네임은 노출되지 않습니다.

회원탈퇴 시 처리되는 주요 항목은 다음과 같습니다.

* 회원 계정 비활성화
* 회원 개인정보 비식별화
* 기존 프롬프트 작성자 닉네임 익명화
* 기존 댓글 및 답글 작성자 닉네임 익명화
* 기존 게시물과 댓글 데이터 유지

---

## 16. 프론트엔드 처리 권장 사항

프론트에서는 HTTP 상태만으로 처리하지 않고 `code`를 함께 확인하는 것을 권장합니다.

예시:

```javascript
if (error.code === "LOGIN_REQUIRED") {
  // 로그인 화면 또는 로그인 안내 표시
}

if (error.code === "OWNER_ONLY") {
  // 작성자 전용 기능 안내
}

if (error.code === "ADMIN_ONLY") {
  // 관리자 권한 필요 안내
}

if (error.code === "ACCOUNT_BLOCKED") {
  // 차단 계정 안내 및 로그아웃 처리
}
```

차단 계정의 기존 JWT 요청도 `ACCOUNT_BLOCKED`가 반환되므로, 해당 코드를 받으면 저장된 토큰을 삭제하고 로그인 화면으로 이동하는 처리를 권장합니다.

---

## 17. 관리자 태그별 프롬프트 조회

관리자 태그 관리 화면에서 특정 태그가 실제로 사용된 프롬프트를 조회하기 위한 API입니다.

관리자 전용 API이며 비로그인 사용자와 일반 사용자는 접근할 수 없습니다.

```text
GET /api/admin/tags/{tagId}/prompts
```

### Path Parameters

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `tagId` | 예 | 조회할 태그 ID |

### Query Parameters

| 이름 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `page` | 아니요 | `1` | 페이지 번호. 1부터 시작 |
| `size` | 아니요 | 서버 기본값 | 페이지 크기. 최대 100 |
| `pageSize` | 아니요 | 서버 기본값 | `size`가 없을 경우 사용 |

요청 예시:

```text
GET /api/admin/tags/7/prompts?page=1&size=5
```

응답 예시:

```json
{
  "items": [
    {
      "id": 10,
      "title": "글쓰기 첨삭 프롬프트",
      "text": "본문 미리보기용 내용",
      "preview": "본문 미리보기용 내용",
      "author": {
        "id": 2,
        "nickname": "카피메이커"
      },
      "createdAt": "2026-07-14T12:00:00",
      "isShared": true,
      "isHidden": false,
      "status": "active"
    }
  ],
  "content": [
    {
      "id": 10,
      "title": "글쓰기 첨삭 프롬프트"
    }
  ],
  "page": 1,
  "size": 5,
  "total": 12,
  "totalPages": 3
}
```

`items`와 `content`에는 동일한 프롬프트 목록이 포함됩니다.

조회 결과에는 공개·비공개·삭제된 프롬프트가 모두 포함될 수 있습니다. 관리자가 태그의 실제 사용 현황을 검토하기 위한 API이기 때문입니다.

`status` 값은 다음과 같습니다.

```text
active
private
deleted
```

현재 프롬프트에는 별도의 관리자 숨김 필드가 없으므로 `isHidden`은 삭제 상태를 기준으로 반환합니다.

```text
isHidden = deleted
```

존재하지 않는 태그 ID를 요청하면 다음 오류를 반환합니다.

```text
404 Not Found
```