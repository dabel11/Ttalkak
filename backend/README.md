# Ttalkak Backend

Ttalkak 프로젝트의 Spring Boot 백엔드 서버입니다.

## 기술 스택

- Java 17
- Spring Boot 3
- Gradle
- Spring Data JPA
- MySQL
- Spring Security
- WebClient

## 실행 방법

### 1. MySQL DB 생성

MySQL Workbench에서 아래 SQL을 실행합니다.

CREATE DATABASE IF NOT EXISTS ttalkak
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

### 2. application.yml 확인

기본 로컬 설정은 다음과 같습니다.

spring:
  datasource:
    url: ${DB_URL:jdbc:mysql://127.0.0.1:3306/ttalkak?serverTimezone=Asia/Seoul&characterEncoding=UTF-8&useSSL=false&allowPublicKeyRetrieval=true}
    username: ${DB_USERNAME:root}
    password: ${DB_PASSWORD:root}

본인 MySQL 계정이 다르면 환경변수 또는 application.yml 기본값을 수정해야 합니다.

### 3. 서버 실행

Windows PowerShell 기준:

cd backend
.\gradlew.bat bootRun

### 4. API 확인

브라우저에서 아래 주소를 확인합니다.

http://localhost:8080/api/prompts
http://localhost:8080/api/tags/popular
http://localhost:8080/api/make/threads

## 현재 구현 상태

- 프롬프트 목록 조회
- 프롬프트 상세 조회
- 프롬프트 작성, 수정, 삭제
- 프롬프트 조회수, 좋아요, 저장 API
- 댓글, 대댓글 API
- 태그 API
- 신고 API
- Make 스레드, 폴더 API
- RAG 서버 fallback 응답

## 추후 작업

- JWT 인증 고도화
- Google OAuth2 연동
- RAG 서버 실제 연결
- 프론트 localStorage 로직을 API 호출로 교체
- 배포 환경변수 설정
