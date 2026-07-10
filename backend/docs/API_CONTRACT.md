# Ttalkak Backend API Contract

프론트엔드와 백엔드 연동 시 유지해야 하는 응답 필드 계약입니다.

## 공통 인증 정책

로그인이 필요한 API는 아래 헤더를 요구합니다.

Authorization: Bearer demo-token-{memberId}

토큰이 없거나 잘못된 경우:

401 Unauthorized

권한이 없는 사용자가 수정, 삭제, 관리자 API를 호출한 경우:

403 Forbidden

---

## Prompt 목록 응답

GET /api/prompts

프론트는 아래 필드를 사용합니다.

{
  "items": [],
  "content": [],
  "page": 1,
  "size": 16,
  "total": 0,
  "totalPages": 0
}

각 prompt item은 아래 필드를 유지해야 합니다.

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
  "isShared": true
}

---

## Make thread 응답

Make thread는 서버 숫자 id를 기준으로 관리합니다.

프론트 임시 id 예시:

thread-1783608277086

위와 같은 임시 id는 백엔드 폴더 이동 API에 보내면 안 됩니다.

정상 폴더 이동 API:

PATCH /api/make/threads/{numberId}/folder

Make thread 응답은 아래 필드를 유지합니다.

{
  "id": 1,
  "threadId": 1,
  "title": "string",
  "folderId": 1,
  "messages": [],
  "createdAt": "2026-07-10T00:00:00",
  "updatedAt": "2026-07-10T00:00:00"
}

---

## Account withdrawal

회원탈퇴 API:

DELETE /api/auth/withdraw

요청:

{
  "password": "user password"
}

정책:

- 로그인한 사용자 본인만 탈퇴할 수 있습니다.
- 비밀번호가 일치해야 합니다.
- 탈퇴 시 active=false 처리합니다.
- 탈퇴 이후 같은 demo token은 더 이상 인증되지 않습니다.
- 탈퇴 계정은 재로그인할 수 없습니다.
- 현재 정책상 기존 프롬프트, 댓글, Make 데이터는 즉시 삭제하지 않고 보존합니다.
- 화면 표시 정책은 프론트와 협의 후 추가 조정합니다.

---

## Report

신고 생성 API는 로그인 사용자만 호출할 수 있습니다.

POST /api/reports/prompts/{promptId}
POST /api/reports/comments/{commentId}

비로그인 요청은 401 Unauthorized를 반환합니다.

---

## 주의

프론트에서 사용하는 필드명을 임의로 변경하면 화면이 깨질 수 있습니다.

특히 아래 필드는 유지해야 합니다.

items
content
total
totalPages
author.nickname
isSaved
isLiked
isMine
isShared
createdAt
threadId
folderId
messages