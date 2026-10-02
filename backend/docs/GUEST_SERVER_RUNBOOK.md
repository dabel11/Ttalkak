# 비로그인 3회 정책 및 통합 서버 실행

## 완료 기준

- Spring이 비로그인 성공 요청을 식별자별로 3회 제한하고, 4번째는 RAG 호출 전에 `429 / FREE_TRIAL_LIMIT_EXCEEDED`를 반환한다.
- AI 실패는 차감하지 않는다. 같은 식별자의 동시 요청은 예약을 포함해 3회를 넘지 않는다.
- 서버 중단으로 남은 예약은 RAG 제한 시간 + 2분 뒤 같은 식별자의 다음 요청에서 회수한다.
- 로그인 요청은 JWT를 사용하고 guest UUID를 보내지 않는다. 로그인 후 history 저장, requestId 중복 방지, 만료 토큰 복구를 확인한다.
- 서버/컨테이너 재시작 뒤에도 동일한 DB 볼륨과 식별자로 제한이 유지된다.

정책의 단위는 사람이 아니라 브라우저/확장의 `X-Session-UUID`이다. 저장소 삭제나 새 식별자로 다시 체험할 수 있다. 이를 막으려면 별도의 남용 방지 정책을 합의해야 한다. 웹과 확장은 각자 식별자를 저장한다.

## 통합 실행

저장소 루트에서 실행한다. Docker Desktop 또는 Docker Engine과 Compose가 필요하다.

1. `backend/.env`에 고정 JWT 서명키를 설정한다. Base64 디코딩 기준 최소 32바이트여야 한다.
2. `rag-server/.env`에 AI 담당자가 사용하는 공급자 키와 RAG 설정을 준비한다. 키를 Git에 커밋하지 않는다.
3. 기존 MySQL 비밀번호를 사용하는 경우 루트 `.env`의 `MYSQL_ROOT_PASSWORD`를 동일하게 지정한다. 기존 볼륨의 비밀번호는 환경변수만 바꿔도 변경되지 않는다.
4. 다음 명령으로 빌드하고 실행한다.

```powershell
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail 100 backend rag-server web
```

웹 접속: `http://localhost:4173/`. 다른 컴퓨터에서는 `http://서버주소:4173/`로 접속한다. 브라우저는 웹과 같은 origin의 `/api/...`를 호출하고 nginx가 Spring으로 전달한다. Spring만 RAG를 호출한다.

첫 RAG 실행은 모델 다운로드 때문에 오래 걸릴 수 있다. `rag-server`가 healthy인지 확인한 후 AI 기능을 검증한다. `/healthz`는 nginx 생존 확인용이며 Spring/DB/RAG 준비 상태를 보장하지 않는다.

웹 소스 변경 후에는 `docker compose up -d --build web`으로 다시 빌드한다. 정적 운영 빌드만 제공하며 소스 전체를 웹 루트에 마운트하지 않는다. 로컬 개발 프리뷰 서버는 기존대로 `node preview-server.cjs`를 사용한다.

## 배포 후 확인

1. 새 비로그인 브라우저에서 Make 성공 3회, 4번째 차단을 확인한다.
2. 다른 새 식별자로 AI 실패 후에도 성공 3회가 가능한지 확인한다.
3. 두 탭에서 동일 식별자로 동시에 요청해 성공/예약 합계가 3회를 넘지 않는지 확인한다.
4. 로그인 후 체험 history가 저장되는지, 같은 requestId 재시도가 중복 메시지를 만들지 않는지 확인한다.
5. 토큰 만료 시 로그인으로 복구되고 실패한 프롬프트가 유지되는지 확인한다.
6. `docker compose restart backend` 후 기존 비로그인 식별자의 4번째 요청이 계속 차단되는지 확인한다.

확인 중 `docker compose down -v`는 실행하지 않는다. 이 명령은 체험 횟수를 포함한 DB 볼륨을 삭제한다.

## 인터넷 공개 전에 필요한 설정

현재 Compose는 개발/팀 시연용 포트 구성을 유지한다. 인터넷 공개 시 HTTPS 진입점과 도메인을 정하고 Spring(8080), RAG(8000), MySQL(3306)의 외부 접근을 방화벽이나 Compose 설정으로 차단한다. 확장 프로그램은 해당 HTTPS API 주소 및 실제 확장 origin의 CORS 설정이 필요하다.

`RAG_RESPONSE_TIMEOUT`을 기본 75초보다 늘리면 nginx `proxy_read_timeout`과 프론트 `TTALKAK_IMPROVE_TIMEOUT_MS`도 함께 조정한다. MySQL 데이터 백업과 고정 JWT 키 보관 후 배포한다.
