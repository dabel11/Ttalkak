# 인증 요청 제한의 프록시 IP 신뢰 경계 — 배포 전 차단 점검

## 확인된 코드 (develop 기준)
- `docker/nginx-server.conf`는 `X-Forwarded-For $proxy_add_x_forwarded_for`를 사용하므로 요청에 이미 포함된 XFF 값에 Nginx가 관측한 주소를 덧붙인다.
- `backend/src/main/resources/application.yml`은 `FORWARD_HEADERS_STRATEGY`를 환경변수로 설정하며, 기본값은 `none`이다.
- `AuthRateLimitFilter`는 `request.getRemoteAddr()`와 경로를 결합해 60초 요청 횟수를 제한한다. 키 10,000개 상한에 도달하면 새 키는 429로 거부한다.
- `AuthRateLimitFilterTest.spoofedForwardedForHeaderDoesNotResetDirectFilterRateLimit`는 필터만 직접 테스트하며, 프레임워크의 ForwardedHeaderFilter·실제 Nginx·Railway 엣지 조합을 테스트하지 않는다.

## 위험 가설
신뢰되지 않은 클라이언트 XFF를 Spring이 실사용 클라이언트 주소로 채택한다면, 공격자가 XFF를 바꾸면서 IP별 인증 제한을 회피하거나 다수의 키를 만들어 10,000개 상한을 고갈시킬 수 있다. 현재 파일만으로 **실제 Railway에서 우회가 재현되었다고 단정할 수 없다.** 운영 프록시의 원본 헤더 덮어쓰기 및 실제 전달 체인 확인이 필요하다.

## 반드시 필요한 격리 검증
1. 비운영 Nginx → Spring 전체 요청 경로에서 동일한 테스트 클라이언트가 임의의 XFF 값을 매번 바꿔도 **정확히 같은 신뢰된 클라이언트 키**로 제한되는지 확인
2. Railway 프록시/앱 직접 도달 가능성 및 신뢰 프록시 CIDR 확인; 신뢰하지 않는 네트워크가 헤더를 주입해도 IP로 채택하지 않도록 구성
3. 여러 실제 클라이언트가 하나의 프록시 IP로 합쳐져 정상 요청이 잘못 차단되지 않는지 확인
4. 가짜 주소 10,000개 생성으로 제한 상태를 고갈시키는 경우, 기존/신규 정상 사용자 보호 정책 확인
5. 서버 재시작·다중 인스턴스에서는 인메모리 윈도가 공유되지 않으므로 분산 제한 또는 엣지 제한을 별도 검증
6. 테스트에 계정정보·복구코드·개인 IP 기록을 남기지 말고 예약된 문서용 IP 및 가짜 계정만 사용

## 수정 시 유의사항
- 무조건 `$remote_addr`로 XFF를 덮어쓰면 헤더 위조는 방어할 수 있어도 Railway 엣지/다른 프록시의 주소만 나타나 실제 사용자 전원이 같은 요청 제한에 걸릴 수 있다.
- `FORWARD_HEADERS_STRATEGY=none`으로 단순 변경하면 CORS, TLS 스킴 및 리디렉션 호환성을 손상시킬 수 있다.
- 원격 주소 추출과 `X-Forwarded-Proto`, `X-Forwarded-Host`의 신뢰 정책을 하나의 위협 모델로 검토해야 한다.
- 10,000개 상한에서의 조기 퇴거는 다른 키를 반복 생성해 기존 쿨다운을 무력화할 수 있으므로 충분한 트래픽·악성 요청 혼합 시험 없이 적용하지 않는다.

## 상태 및 소유
**운영 배포 보류.** 이 문서는 현재 코드의 위험과 검증 계획만 다루며, 우회 재현이나 보안 수정의 완료를 주장하지 않는다. 사용자의 승인 전 Railway 설정/변수/운영 DB·실서비스를 건드리지 않는다. Nginx 서버 프록시 설정이 팀원 담당 파일이라면 담당자 협의 후 별도 보안 수정 PR에서 변경한다.

## 격리된 단위 회귀 검증
- `AuthRateLimitFilterTest.keyCapacityExhaustionRejectsNewClientsUntilTheWindowExpires`는 테스트 시간 기준으로 키 10,000개를 채우고 신규 주소가 거부되는 현재 동작과 윈도 만료 후 회복을 확인한다.
- 이는 정상 사용자 429 위험을 **재현하는 성격의 테스트**이며, 이 위험을 수정한 테스트가 아니다. 프록시/forwarded-header 경로의 위조 성공 여부 역시 별도 비운영 통합 재현이 필요하다.
