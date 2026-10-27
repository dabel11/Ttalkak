# 인증 요청 제한 — 신뢰 경계·검증·운영 게이트

## 취약 원인
- 기존 `AuthRateLimitFilter`는 `getRemoteAddr()`를 신뢰했다. `FORWARD_HEADERS_STRATEGY=framework`일 때 Spring `ForwardedHeaderFilter`가 감싼 요청의 원격 주소는 클라이언트가 전달한 `Forwarded` 또는 `X-Forwarded-For`의 영향을 받을 수 있다.
- 기존 nginx는 `$proxy_add_x_forwarded_for`로 기존 XFF에 값을 추가했다. 신뢰되지 않은 XFF를 백엔드 제한 키에 사용하는 것은 위험하다.
- 10,000개의 `IP:경로` 윈도가 포화되면 처음 보는 주소는 429를 받는다. 무분별한 퇴거나 전역 공유 제한은 기존 카운터 초기화·정상 사용자 차단이라는 새 문제를 만든다.

## 이 PR에서 적용한 코드 수정
1. 인증 필터는 ForwardedHeaderFilter의 바깥 래퍼가 제공한 주소 대신 **가장 안쪽 servlet 요청의 socket peer 주소**를 기본값으로 사용한다. 위조된 XFF만 바꿔서는 제한 키가 바뀌지 않는다.
2. 실제 사용자별 IP가 필요한 nginx 내부 경로는 `TTALKAK_AUTH_PROXY_SECRET`이라는 별도 무작위 32자 이상 비밀값으로 **내부 프록시의 전달을 인증할 때만** `X-Ttalkak-Client-IP` 주소를 사용한다. 인증 실패·비활성·잘못된 IP는 socket peer로 돌아간다.
3. nginx는 외부 XFF를 이어붙이지 않으며, Railway **공개 HTTP 엣지가 덮어쓰는** `X-Real-IP` 값을 XFF와 내부 인증 클라이언트 IP에 사용한다. 표준 `Forwarded` 헤더도 제거한다.
4. 기존 IP별 10/30회·60초 한도와 키 10,000개 상한을 유지한다. 허용되지 않는 공격성 전역 상한 및 공유 overflow 버킷은 되돌렸다. 전체 키 만료 정리는 최대 1초 주기, 개별 키 만료는 요청 시 즉시 적용한다.

## Railway 실제 구성에서 확인한 제약 (2026-10-27, 읽기 전용)
- 같은 `ttalkak-staging` Railway 프로젝트의 **web과 backend 양쪽에 각각 공개 도메인**이 있고, 서비스는 `develop` 브랜치 1개 복제본으로 동작한다.
- web→nginx→backend 사설 연결과 backend 공개 주소 직접 접근이 함께 가능하다. **backend 직접 접근은 내부 nginx의 프록시 비밀값을 받지 않으므로 socket peer fallback을 사용한다.** 이 경우 공개 엣지의 다수 사용자 요청이 같은 프록시 IP로 보이면 잘못된 429가 발생할 수 있다.
- Railway 공개 HTTP 엣지는 `X-Real-IP`를 덮어쓴다고 안내한다. 단, `*.railway.internal` 사설 네트워크 또는 TCP 프록시 경로에서는 해당 보장이 적용되지 않는다. **사설 네트워크를 통한 nginx 직접 접근이 가능하면 공격자가 X-Real-IP를 위조할 위험이 있으므로, 내부 서비스 호출자 신뢰 범위와 연결 경로를 검증해야 한다.**
- Railway 공개 도메인을 통한 backend 직접 경로와 웹·확장 프로그램의 기존 API 호출 의존성을 조사하고, **하나의 신뢰된 공개 ingress로 경로를 통합하기 전에는 보안을 완료 처리하지 않는다.** 공개 backend 도메인을 임의로 제거하면 확장 프로그램 호출이 깨질 수 있으므로 담당자와 통합 테스트 후 변경한다.

## 환경변수 설정 게이트 (현재 운영에 적용하지 않음)
- web nginx와 backend 양쪽에 동일한 긴 무작위 비밀값 `TTALKAK_AUTH_PROXY_SECRET`을 별도 주입한다. 저장소·PR·메신저에 실제 값을 남기지 않는다.
- nginx 템플릿의 환경변수 치환 방식이 `TTALKAK_AUTH_PROXY_SECRET`을 정상 치환하는지 격리 컨테이너에서 검증한다. 비밀값이 누락되면 백엔드는 socket peer를 사용하므로 헤더 위조를 신뢰하지 않는다.
- `FORWARD_HEADERS_STRATEGY`가 `framework`가 아닌 `native` 등으로 바뀌면 서블릿 원본 주소에도 영향을 줄 수 있으므로 **현재 확인된 설정의 변경을 별도 검토**한다.
- 비밀값이 적용된 상태의 nginx 직접 사설 경로는 신뢰된 서비스만 접근 가능한지 검증한다. 비밀값을 보유한 nginx가 신뢰되지 않은 X-Real-IP를 그대로 전달한다면 내부 인증만으로 사용자 IP 진위가 증명되지 않는다.

## 필수 회귀·격리 검증
- [ ] 최신 PR HEAD의 Java 테스트 및 서버 컨테이너 CI 성공
- [ ] `ForwardedHeaderFilter`가 있는 체인에서도 위조한 Forwarded/XFF가 IP 제한 카운터를 초기화하지 않는지 확인
- [ ] 정확한 비밀값·올바른 IP의 서로 다른 정상 사용자는 각자 10회 제한을 적용받고, 잘못된 비밀값·IP는 socket peer로 묶이는지 확인
- [ ] 격리된 nginx의 `nginx -t`, env 템플릿 치환, 요청 헤더 정규화 및 Spring 최종 제한 키 E2E 확인
- [ ] Railway 공개 backend 도메인 직통과 웹 경유 두 경로의 정상 사용자 429 오탐, 로그인·가입·아이디 찾기·비밀번호 초기화 비교
- [ ] 사설 네트워크·직접 백엔드 접근을 포함한 우회 경로 제거 또는 안전한 제한 방식 검증
- [ ] 10,000개 기록 한도·다중 인스턴스·재시작 동안 IP 분산 우회 및 정상 사용자 가용성 시험
- [ ] 배포 전 기존 extension API URL 의존성, CORS·TLS·Redirect·Google 로그인 흐름 회귀 검증

## 릴리스 판정
**Draft / 운영 배포 차단.** 본 PR은 코드 수준의 XFF 스푸핑 방어를 추가하지만, Railway 실제 ingress 통합·비운영 E2E·인증 비밀 설정·다중 인스턴스 문제까지 해결됐다는 의미는 아니다. 공개 도메인 삭제, 환경변수 변경, 실제 서비스 배포, DB 변경·병합은 별도 사용자 승인 없이 수행하지 않는다.
