package com.ttalkak.common.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public enum ErrorCode {

    // Auth
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다."),
    INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "유효하지 않은 토큰입니다."),
    EXPIRED_TOKEN(HttpStatus.UNAUTHORIZED, "만료된 토큰입니다."),
    INVALID_GOOGLE_TOKEN(HttpStatus.UNAUTHORIZED, "유효하지 않은 Google 토큰입니다."),

    // Member
    MEMBER_NOT_FOUND(HttpStatus.NOT_FOUND, "회원을 찾을 수 없습니다."),
    EMAIL_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다."),
    NICKNAME_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 사용 중인 닉네임입니다."),

    // Prompt
    PROMPT_NOT_FOUND(HttpStatus.NOT_FOUND, "프롬프트를 찾을 수 없습니다."),
    CONVERSATION_NOT_FOUND(HttpStatus.NOT_FOUND, "대화를 찾을 수 없습니다."),
    TEMPLATE_NOT_FOUND(HttpStatus.NOT_FOUND, "템플릿을 찾을 수 없습니다."),
    PROMPT_ACCESS_DENIED(HttpStatus.FORBIDDEN, "해당 프롬프트에 접근 권한이 없습니다."),

    // Community
    POST_NOT_FOUND(HttpStatus.NOT_FOUND, "게시글을 찾을 수 없습니다."),
    POST_ACCESS_DENIED(HttpStatus.FORBIDDEN, "해당 게시글에 접근 권한이 없습니다."),

    // Rate Limit
    RATE_LIMIT_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "요청 한도를 초과했습니다. 로그인 후 이용해 주세요."),

    // AI
    AI_API_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "AI 서비스 호출 중 오류가 발생했습니다."),
    AI_MODEL_NOT_SUPPORTED(HttpStatus.BAD_REQUEST, "지원하지 않는 AI 모델입니다."),

    // General
    INVALID_INPUT(HttpStatus.BAD_REQUEST, "잘못된 입력값입니다."),
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다.");

    private final HttpStatus status;
    private final String message;

    ErrorCode(HttpStatus status, String message) {
        this.status = status;
        this.message = message;
    }
}
