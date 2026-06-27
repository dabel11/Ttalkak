# Ttalkak Backend

AI 프롬프트 개선 서비스 Ttalkak의 Spring Boot 백엔드입니다.

## 기술 스택

- Spring Boot 3.x
- Java 17
- MySQL 8
- Spring Data JPA
- Spring Security
- JWT
- Google OAuth2
- WebClient
- Gradle
- Docker / docker-compose

## 백엔드 역할

Spring Boot 서버는 다음 역할을 담당합니다.

- 회원가입 / 로그인 / JWT 발급
- Google OAuth2 토큰 검증 후 자체 JWT 발급
- 비로그인 사용자 3회/24시간 체험 제한
- 프롬프트 개선 요청을 rag-server로 프록시
- 개선 결과 및 대화 기록 저장
- 커뮤니티 게시글, 좋아요, 댓글, 태그 관리

## 실행 방법

### Docker 실행

```bash
cd backend
docker compose up --build