# rag-server (FastAPI + Gemini 임베딩 API + MySQL)
#
# 2026-10-07: 임베딩 백엔드를 로컬 bge-m3 → Gemini API 로 전환하면서 이미지에서 torch·
# sentence-transformers·번들 모델(bge-m3/reranker ~4.3GB)을 전부 제거했다.
#   - 이미지: ~9.5GB → ~1GB 미만 (torch·CUDA·모델 캐시 없음)
#   - 상주 RAM: ~2.6GB → 수백 MB (torch 미로드) → Railway free/trial(0.5~1GB) 기동 가능
# 로컬 bge-m3 로 돌리려면(개발/eval) EMBEDDING_BACKEND=local + requirements-local.txt.
FROM python:3.11-slim

WORKDIR /code

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# 의존성 설치 (레이어 캐시). PyMySQL 은 순수 파이썬이라 컴파일 불필요.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 앱 코드 복사 (data/·eval/·ingestion/ 등은 .dockerignore 로 제외)
COPY . .

EXPOSE 8000

# Railway 는 $PORT 를 주입한다 → 거기에 바인딩해야 라우팅이 닿는다(미사용 시 연결 끊김).
# 로컬/compose 는 PORT 미설정이라 8000 폴백.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
