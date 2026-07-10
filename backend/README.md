# Ttalkak Backend

Ttalkak 프로젝트의 Spring Boot 백엔드 서버입니다.

프론트엔드 연동을 위한 프롬프트 커뮤니티, Make 대화, 댓글, 태그, 신고, 관리자 API를 제공합니다.

---

## 기술 스택

- Java 17
- Spring Boot 3
- Gradle
- Spring Data JPA
- MySQL
- Spring Security
- WebClient

---

## 실행 환경

- JDK 17 이상이 필요합니다.
- Spring Boot 3.x 기반이므로 Java 8에서는 실행되지 않습니다.
- 실행 전 `java -version`으로 Java 17 이상인지 확인합니다.
- Windows에서는 `JAVA_HOME`이 JDK 17 경로를 바라보는지 확인해야 합니다.

확인 명령어:

```powershell
java -version
echo $env:JAVA_HOME
```

정상 예시:

```text
17.x.x
```

---

## 실행 방법

### 1. MySQL DB 생성

MySQL Workbench에서 아래 SQL을 실행합니다.

```sql
CREATE DATABASE IF NOT EXISTS ttalkak
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
```

### 2. application.yml 확인

기본 로컬 설정은 다음과 같습니다.

```yml
spring:
  datasource:
    url: ${DB_URL:jdbc:mysql://127.0.0.1:3306/ttalkak?serverTimezone=Asia/Seoul&characterEncoding=UTF-8&useSSL=false&allowPublicKeyRetrieval=true}
    username: ${DB_USERNAME:root}
    password: ${DB_PASSWORD:root}
```

본인 MySQL 계정이 다르면 환경변수 또는 `application.yml` 기본값을 수정해야 합니다.

### 3. 서버 실행

Windows PowerShell 기준:

```powershell
cd backend
.\gradlew.bat bootRun
```

### 4. 빌드 확인

```powershell
cd backend
.\gradlew.bat clean build
```

성공 시 `BUILD SUCCESSFUL`이 출력됩니다.

---

## API 확인

브라우저 또는 Postman에서 아래 주소를 확인합니다.

```text
http://localhost:8080/api/prompts
http://localhost:8080/api/tags/popular
http://localhost:8080/api/make/threads
http://localhost:8080/api/make/folders
```

---

## 인증 정책

현재 백엔드는 프론트 연동 테스트를 위해 demo token 기반 인증을 사용합니다.

로그인 성공 시 `demo-token-{memberId}` 형태의 accessToken이 발급됩니다.

프론트는 로그인 이후 주요 변경 API 요청에 아래 헤더를 포함해야 합니다.

```text
Authorization: Bearer demo-token-{memberId}
```

로그인이 필요한 API에서 토큰이 없거나 잘못된 경우 `401 Unauthorized`를 반환합니다.

---

## 로그인 필요 API

다음 기능은 비로그인 사용자가 호출할 수 없습니다.

- 프롬프트 작성, 수정, 삭제
- 프롬프트 공유 상태 변경
- 프롬프트 좋아요, 저장
- 댓글, 대댓글 작성
- 댓글, 대댓글 수정/삭제
- 댓글 좋아요
- Make 폴더 생성, 수정, 삭제
- Make thread 저장
- Make thread 폴더 이동
- 관리자 API

---

## 현재 구현 상태

### 프롬프트 / 커뮤니티

- 프롬프트 목록 조회
- 프롬프트 상세 조회
- 프롬프트 작성, 수정, 삭제
- 프롬프트 공개/비공개 상태 변경
- 프롬프트 조회수 증가
- 프롬프트 좋아요, 좋아요 취소
- 프롬프트 저장, 저장 취소
- 댓글, 대댓글 작성
- 댓글, 대댓글 수정/삭제
- 답글이 있는 댓글 삭제 시 soft delete 처리
- 신고 생성 API

### 태그

- 인기 태그 조회
- 태그 목록 조회
- 태그 제안 API

### Make

- Make thread 목록 조회
- Make folder 목록 조회
- Make thread 생성
- Make thread 업데이트 / upsert
- Make messages JSON 직렬화 저장
- Make folder 생성, 수정, 삭제
- Make thread 폴더 이동
- 프론트 임시 id(`thread-...`)가 폴더 이동 API에 들어올 경우 400 반환

### 프롬프트 개선

- `/api/prompts/improve` API 제공
- RAG 서버 연결 시 RAG 응답 사용
- RAG 서버 미연결 시 fallback 개선 응답 반환

### 검색

`/api/prompts`에서 아래 검색 파라미터를 지원합니다.

```text
scope=all
scope=tag
scope=author
scope=keyword
query=검색어
keyword=검색어
author=작성자
```

예시:

```text
/api/prompts?scope=all&query=글쓰기
/api/prompts?scope=tag&query=마케팅
/api/prompts?scope=author&query=테스터
/api/prompts?scope=keyword&query=식단
```

### 관리자 API

관리자 모드 연동을 위한 최소 API를 제공합니다.

- 신고 목록 조회
- 신고 상태 변경
- 프롬프트 숨김 / 복구
- 태그 목록 조회
- 태그 상태 변경

관리자 API는 `ADMIN` 권한이 필요합니다.

---

## 프론트 연동 확인 기준

프론트 실행 후 개발자도구 Network 탭에서 아래 요청이 확인되면 기본 연동이 정상입니다.

```text
GET    /api/prompts                         200
GET    /api/tags/popular                    200
GET    /api/make/threads                    200
GET    /api/make/folders                    200
POST   /api/prompts/improve                 200
POST   /api/make/threads                    200
PATCH  /api/make/threads/{숫자id}/folder    200
```

로그인 없이 저장, 좋아요, 댓글 작성, 폴더 생성 등을 호출하면 `401 Unauthorized`가 정상입니다.

---

## 추후 작업

- JWT 인증 고도화
- Google OAuth2 연동
- RAG 서버 실제 연결 안정화
- Admin API 세부 정책 보완
- 댓글 수 계산 정책 정교화
- API 응답 계약 문서화
- 배포 환경변수 설정