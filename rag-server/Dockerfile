# rag-server (FastAPI + bge-m3 + MySQL)
FROM python:3.11-slim

# MySQL 클라이언트 빌드/런타임 의존성 최소화 (PyMySQL은 순수 파이썬이라 컴파일 불필요)
# (WORKDIR 을 /code 로 둬 코드 패키지 app/ 와 경로 혼동 방지)
WORKDIR /code

# HF 캐시를 이미지 내 고정 경로에 둬, 빌드 때 받은 모델을 런타임이 그대로 읽게 한다.
ENV HF_HOME=/opt/hf-cache \
    HF_HUB_DISABLE_TELEMETRY=1

# 의존성 먼저 설치 (레이어 캐시)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── 모델 번들링 (bge-m3 임베딩 + bge-reranker-v2-m3 리랭커) ──
# Railway FS는 재배포마다 초기화 + Hobby 볼륨 상한(5GB) < 모델 캐시(~6.4GB) 라,
# 런타임 다운로드/볼륨 대신 **빌드 단계에서 미리 받아 이미지에 굽는다**. 런타임은 네트워크
# 없이 HF_HOME 캐시에서 바로 로드 → 콜드스타트에서 6.4GB 재다운로드를 제거한다.
# (heredoc 대신 python -c 단일행 — 빌더(BuildKit/classic) 호환성 확보)
RUN python -c "from sentence_transformers import SentenceTransformer, CrossEncoder; SentenceTransformer('BAAI/bge-m3'); CrossEncoder('BAAI/bge-reranker-v2-m3'); print('[build] model cache warmed')"

# 앱 코드 복사 (data/ 등은 .dockerignore 로 제외)
COPY . .

EXPOSE 8000

# 모델이 이미지에 포함됨 → 기동 시 다운로드 없이 HF_HOME 캐시에서 로드
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
