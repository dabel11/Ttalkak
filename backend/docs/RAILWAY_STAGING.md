# Railway staging 배포 및 인수인계

로컬 Docker/Java/Node 설치나 빌드는 필요하지 않다. GitHub 소스에서 Railway가 이미지를 빌드하고, GitHub Actions가 컨테이너 통합 검증을 실행한다. 실제 RAG/LLM 검증은 별도 단계다.

## 서비스 설정

같은 Railway 프로젝트/환경에 아래 서비스를 만든다. 예시 서비스명은 대소문자를 포함해 정확히 `MySQL`, `backend`, `rag-server`, `web`이다. 다른 이름을 쓰면 참조 변수도 수정한다.

| 서비스 | 소스/Root Directory | Config File | PORT | Healthcheck |
|---|---|---|---|---|
| MySQL | Railway MySQL 템플릿 | 템플릿 기본값 | 템플릿 기본값 | 템플릿 기본값 |
| backend | GitHub 저장소, `/backend` | `/backend/railway.json` | `8080` | `/api/tags/popular` |
| rag-server | GitHub 저장소, `/rag-server` | `/rag-server/railway.json` | `8000` | `/health` |
| web | GitHub 저장소, `/` | `/docker/railway-web.json` | `8080` | `/healthz` |

각 서비스의 Config File 경로는 저장소 루트 기준이다. web은 `shared`와 `scripts`를 함께 빌드하므로 Root Directory를 프론트 폴더로 좁히지 않는다. 배포 브랜치는 리뷰/CI를 통과한 커밋이 포함된 `develop`으로 지정한다. Start Command는 Dockerfile 기본값을 사용한다.

backend healthcheck는 공개 태그 조회 API를 사용해 실제 DB 조회까지 확인한다. RAG `/health`와 web `/healthz`만으로는 인덱싱, 실제 AI 응답, 전체 연결이 검증되지 않는다.

## backend Variables

MySQL 서비스의 비공개 변수에 참조를 연결한다. JDBC URL은 MySQL의 `MYSQL_URL`을 그대로 붙여 넣지 않고 JDBC 형식으로 만든다.

```text
PORT=8080
FORWARD_HEADERS_STRATEGY=framework
DB_URL=jdbc:mysql://${{MySQL.MYSQLHOST}}:${{MySQL.MYSQLPORT}}/${{MySQL.MYSQLDATABASE}}?serverTimezone=Asia/Seoul&characterEncoding=UTF-8&useSSL=false&allowPublicKeyRetrieval=true
DB_USERNAME=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
RAG_SERVER_URL=http://${{rag-server.RAILWAY_PRIVATE_DOMAIN}}:8000
RAG_RESPONSE_TIMEOUT=75s
JPA_SHOW_SQL=false
JPA_DDL_AUTO=update
ADMIN_SEED_ENABLED=false
```

`JWT_SECRET_BASE64`는 별도로 생성한 고정 비밀키를 설정한다. Base64 디코딩 기준 최소 32바이트다. 테스트 코드/CI의 고정 키를 staging에 재사용하지 않는다. 키를 바꾸면 기존 로그인 토큰은 무효화된다.

Windows PowerShell에서 키만 생성하려면 다음 경량 명령을 사용할 수 있다. 출력은 Railway Variables에만 입력하고 채팅/GitHub에 공유하지 않는다.

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
[Convert]::ToBase64String($bytes)
```

staging의 초기 스키마 생성에는 `update`를 사용한다. 이후 운영 데이터가 생기면 DB 백업과 스키마 변경 검토를 거쳐 배포한다. 회원/게시글/Make/guest 사용량은 DB에 남으므로 DB 서비스를 삭제하거나 초기화하지 않는다.

## rag-server Variables 및 AI 담당 작업

```text
PORT=8000
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
```

Dockerfile이 현재 8000에 바인딩하므로 이 서비스의 PORT는 8000으로 지정한다. AI 담당자가 사용하는 공급자 키, 인덱싱 인증키 및 모델 설정은 해당 담당자가 Railway Variables에 직접 설정한다. 잘못된 공급자 설정을 임의의 데모 응답으로 대체하지 않는다.

현재 코드의 지식 벡터는 MySQL `rag_chunk`에 저장된다. 새 DB에는 기존 지식 데이터가 자동 복사되지 않으므로 AI 담당자가 적재/인덱싱하고 샘플 질의로 검색 결과를 확인한다. Hugging Face 모델 캐시를 유지하려면 RAG 서비스 Volume을 `/root/.cache/huggingface`에 연결한다. 모델 메모리와 저장 공간은 실제 사용량으로 확인한다.

RAG는 backend가 내부 주소로 호출하므로 공개 도메인이 필요하지 않다. 외부 공개 없이 실행 환경에서 인덱싱할 방법은 AI 담당자가 선택한다.

## web 및 확장 연결

```text
PORT=8080
BACKEND_UPSTREAM=${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080
PROXY_READ_TIMEOUT=90s
```

web의 공개 도메인을 생성하고 target port를 8080으로 맞춘다. 웹은 접속한 HTTPS origin으로 API를 호출하고 nginx가 backend의 내부 주소로 전달한다. nginx가 원래 Host/HTTPS 정보를 전달하고 Spring의 `FORWARD_HEADERS_STRATEGY=framework`가 이를 복원하므로, 정상 웹 POST를 다른 origin으로 오인해 차단하지 않는다. DNS를 주기적으로 다시 조회해 backend 재배포 시 주소 변경에 대응한다.

확장 프로그램이 직접 호출하려면 backend에도 공개 HTTPS 도메인을 생성한다. 프론트 담당자가 확장의 운영 API URL과 manifest host_permissions를 반영하고, backend의 `CORS_ALLOWED_ORIGIN_PATTERNS`에 실제 `chrome-extension://확장ID`를 설정한다. 운영에서 임의 origin 전체를 허용하지 않는다. 같은 origin의 웹 프록시는 별도의 웹 CORS 주소 설정이 필요하지 않다.

RAG 제한 시간을 늘리면 web의 프록시 제한과 프론트 `TTALKAK_IMPROVE_TIMEOUT_MS`도 함께 맞춘다.

## 오늘부터 실행할 순서

1. Railway 계정을 만들고 GitHub 저장소 접근 권한을 연결한다. 프로젝트 생성/배포 전에 표시되는 플랜·과금과 사용량 제한을 확인한다.
2. staging 프로젝트와 MySQL을 생성한다. 템플릿의 DB 영속 Volume이 연결돼 있는지 확인한다.
3. backend를 연결하고 위 변수와 고정 JWT 키를 설정한다. 태그 조회 API의 200 응답과 DB 테이블 생성을 확인한다. 이 단계는 RAG 인덱싱 전에 진행할 수 있다.
4. AI 담당자가 RAG를 연결하고 키·DB·모델 캐시를 설정한다. 모델 로딩 후 인덱싱과 검색 결과를 확인한다.
5. web을 연결하고 내부 backend 주소를 설정한다. 공개 HTTPS URL에서 회원/홈/Make를 확인한다. 확장 HTTPS/CORS 설정은 프론트 담당자가 진행한다.
6. 비로그인 3회/4번째 429, 실패 미차감, 로그인 history 저장/멱등, 만료 토큰 복구, backend 재배포 뒤 사용량 유지를 실제 환경에서 확인한다.

## CI와 리뷰

`Server container smoke`는 MySQL·Spring·nginx를 실제 컨테이너로 빌드/실행한다. AI는 결정적 테스트 fixture다. 기본값과 다른 포트/주소에서 호출해 PORT/프록시 설정을 검증하고, UUID 누락, 3회 제한, AI 실패 미차감, backend 재시작 후 DB 사용량 유지를 확인한다.

CI cleanup의 `down -v`는 일회용 CI DB만 지운다. 로컬/배포 DB에 해당 명령을 실행하지 않는다. CI 통과를 실제 RAG 품질/성능/인덱싱 완료로 해석하지 않는다.

미완료 항목은 Railway 계정/프로젝트 생성, 실제 배포와 공급자 설정, RAG 인덱싱, 실서비스 HTTPS 검증이다. 코드 작성 완료와 배포 완료를 분리해 기록한다.

## 공식 참고 자료

- https://docs.railway.com/deployments/monorepo
- https://docs.railway.com/config-as-code/reference
- https://docs.railway.com/databases/mysql
- https://docs.railway.com/networking/private-networking/how-it-works
- https://docs.railway.com/deployments/healthchecks
