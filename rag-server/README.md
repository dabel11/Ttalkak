# RAG Service — bge-m3 + ChromaDB + FastAPI + Spring Boot

## 전체 구조

```
Spring Boot (8080)
    │
    │  POST /api/rag/index   → 청크 인덱싱
    │  POST /api/rag/query   → 검색 + 응답
    ▼
FastAPI RAG Server (8000)
    ├── indexer.py   : bge-m3 임베딩 → ChromaDB 저장
    ├── retriever.py : 쿼리 임베딩 → 유사도 검색
    └── generator.py : 검색 결과 + Claude API → 응답 생성
```

## 실행 순서

### 1. FastAPI 서버 실행

```bash
cd python-rag-server

pip install -r requirements.txt

export ANTHROPIC_API_KEY=sk-ant-...

python main.py
# → http://localhost:8000 에서 실행
# → http://localhost:8000/docs 에서 Swagger UI 확인
```

### 2. Spring Boot 설정

`application.yml`에 추가:
```yaml
rag:
  server:
    url: http://localhost:8000
```

`build.gradle`에 WebFlux 의존성 추가:
```groovy
implementation 'org.springframework.boot:spring-boot-starter-webflux'
```

---

## API 사용 예시

### 인덱싱 (논문 청크 저장)

```bash
curl -X POST http://localhost:8080/api/rag/index \
  -H "Content-Type: application/json" \
  -d '{
    "chunks": [
      "Chain-of-thought prompting enables complex reasoning...",
      "Few-shot prompting improves model performance..."
    ],
    "metadata": [
      {"source": "Wei et al. 2022", "page": 1},
      {"source": "Brown et al. 2020", "page": 3}
    ]
  }'
```

### 질의 응답

```bash
curl -X POST http://localhost:8080/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query": "chain-of-thought 프롬프팅이란 무엇인가요?"}'
```

응답:
```json
{
  "answer": "Chain-of-thought prompting은 모델이 복잡한 추론 과정을...",
  "sources": [
    {
      "text": "Chain-of-thought prompting enables...",
      "metadata": {"source": "Wei et al. 2022", "page": 1},
      "score": 0.923
    }
  ]
}
```

---

## 파일 구조

```
rag-service/
├── python-rag-server/
│   ├── main.py          # FastAPI 앱 진입점
│   ├── indexer.py       # bge-m3 임베딩 + ChromaDB 저장
│   ├── retriever.py     # 유사도 검색
│   ├── generator.py     # LLM 응답 생성
│   └── requirements.txt
│
└── spring-integration/
    ├── RagDto.java          # 요청/응답 DTO
    ├── RagService.java      # WebClient 호출 서비스
    ├── RagController.java   # REST 컨트롤러
    └── application-rag.yml  # 설정
```

## 배포 (Railway)

FastAPI 서버를 Railway에 올릴 경우:
1. `python-rag-server/` 폴더를 별도 Railway 서비스로 배포
2. 환경변수 `ANTHROPIC_API_KEY` 설정
3. Spring Boot `application.yml`의 `rag.server.url`을 Railway URL로 변경

> ChromaDB는 Railway의 볼륨(Persistent Disk)에 `./chroma_db` 경로로 저장됨
