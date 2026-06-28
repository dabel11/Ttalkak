# TTALKAK Web Frontend Prototype

프롬프트 첨삭 Chrome Extension의 흐름을 웹 커뮤니티로 확장한 프론트엔드 프로토타입입니다.

현재 버전은 백엔드 없이도 전체 UX를 확인할 수 있도록 `src/app.js`의 로컬 상태와 브라우저 `localStorage`를 사용합니다. 실제 백엔드 연동 시에는 `src/api.js`와 `docs/API_SPEC.md`를 기준으로 API 호출로 교체하면 됩니다.

## 실행 방법

```powershell
cd C:\Users\com\OneDrive\문서\prompt\prompt-hub-web-frontend
node preview-server.cjs
```

브라우저에서 아래 주소로 확인합니다.

```text
http://127.0.0.1:4173/
```

Windows에서 백그라운드로 서버를 띄우려면:

```powershell
Start-Process -FilePath "node.exe" -ArgumentList "preview-server.cjs" -WorkingDirectory "C:\Users\com\OneDrive\문서\prompt\prompt-hub-web-frontend" -WindowStyle Hidden
```

## 주요 화면

- `Home`: 인기 프롬프트, 해시태그 검색, 복수 태그 안내, 정렬 드롭다운, 추천 태그, 상세 팝업
- `Make`: 프롬프트 첨삭 채팅, 분야 버튼, 최근 대화, Copy/Save/Execute
- `Saved`: 내 보관함 화면. 저장한 프롬프트, 내 프롬프트, 저장 취소 보류, 공유/공유 취소
- `Share`: 로그인 기반 프롬프트 공유
- `Auth`: 로그인, 회원가입, 아이디 찾기, 비밀번호 찾기

## 구현된 커뮤니티 기능

- 프롬프트 공유/공유 취소
- 최종 프롬프트만 공유, Make 개인 대화 기록 비공개
- 프롬프트 저장/저장 취소
- 프롬프트 좋아요/신고/삭제
- 조회수 증가
- 정렬: 인기, 저장, 댓글, 좋아요, 최신
- 쉼표 기반 복수 해시태그 검색
- 댓글/대댓글 작성
- 댓글/대댓글 수정/삭제
- 댓글/대댓글 좋아요/신고
- 댓글/대댓글 좋아요 수 기준 정렬
- Saved의 좋아요만 보기 필터
- Make 대화 기록이 있는 내 프롬프트의 별도 대화 보기 버튼

## 주요 파일

- `index.html`: 앱 진입점
- `src/app.js`: 화면 렌더링, 상태, 로컬 데모 동작
- `src/styles.css`: 전체 UI 스타일
- `src/demo-data.js`: 데모 텍스트 보정 데이터
- `src/api.js`: 백엔드 연동용 API wrapper 초안
- `preview-server.cjs`: 정적 미리보기 서버

## 백엔드 전달 문서

- `docs/API_SPEC.md`: API 명세 초안
- `docs/FRONTEND_HANDOFF.md`: 프론트 상태/정책 문서
- `docs/BACKEND_INTEGRATION_NOTES.md`: 백엔드 연동 메모
- `docs/BACKEND_HANDOFF_MESSAGE.md`: 백엔드 전달용 요약 메시지
- `docs/SCREEN_MAP.md`: 화면별 기능/API 맵

## 백엔드 연동 시 교체할 부분

- 인증: 로그인, 회원가입, 아이디 찾기, 비밀번호 찾기
- 프롬프트 목록, 상세, 검색, 정렬, 태그 랭킹
- 저장, 좋아요, 신고, 조회수
- 공유, 공유 취소, 삭제
- 댓글/대댓글 CRUD, 좋아요, 신고
- Make 첨삭 API
- Make 최근 대화 저장/불러오기

## 참고 정책

- Home에는 공유된 프롬프트만 노출합니다.
- 다른 사용자 프롬프트에는 `공유됨` 배지를 표시하지 않습니다.
- 내 공유 프롬프트는 공유 아이콘을 짙은 녹색 채움 상태로 표시합니다.
- Share 직후 내 프롬프트는 Home에 노출되지만 저장 상태는 아닙니다.
- `내 프롬프트`와 `내가 저장한 프롬프트`는 별도 상태입니다.
- `saves`는 전체 저장 수, `isSaved`는 현재 사용자의 저장 여부입니다. 저장 아이콘 활성화는 `isSaved`를 기준으로 해야 합니다.
- Saved에서 저장 취소를 누르면 즉시 사라지지 않고, 다른 화면으로 이동할 때 확정됩니다.
- 본인 댓글/대댓글은 수정/삭제만 가능하고, 다른 사용자 댓글/대댓글은 좋아요/신고가 가능합니다.
- 외부 AI 사이트 입력란에 직접 자동 입력하려면 Chrome Extension content script 또는 공식 API 연동이 필요합니다.
