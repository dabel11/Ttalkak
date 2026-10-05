# rag-server (FastAPI + bge-m3 + MySQL)
FROM python:3.11-slim

# MySQL 클라이언트 빌드/런타임 의존성 최소화 (PyMySQL은 순수 파이썬이라 컴파일 불필요)
# (WORKDIR 을 /code 로 둬 코드 패키지 app/ 와 경로 혼동 방지)
WORKDIR /code

# HF 캐시를 이미지 내 고정 경로에 둬, 빌드 때 받은 모델을 런타임이 그대로 읽게 한다.
# HF_HUB_DISABLE_XET=1: xet 백엔드를 끈다. xet 은 다운로드 청크를 $HF_HOME/xet 에 **따로 캐시**해
# 모델(~4.3GB)을 이미지 안에 한 벌 더 복제한다(이미지 13.2GB의 주범). 끄면 blob 한 벌만 남는다.
ENV HF_HOME=/opt/hf-cache \
    HF_HUB_DISABLE_TELEMETRY=1 \
    HF_HUB_DISABLE_XET=1

# CPU 전용 torch 먼저 설치. 기본 torch 는 Linux 에서 CUDA 라이브러리(cudnn·cublas 등 ~3GB+)를
# 끌어오지만 Railway 는 CPU 전용이라 전부 사장(실측: 이미지 20.9GB). CPU 휠로 고정하면
# sentence-transformers 의 torch>=2.2 를 이게 먼저 만족시켜, 이후 requirements 설치가 CUDA
# torch 를 다시 당기지 않는다 → 이미지·빌드시간 대폭 감소, 추론 동작은 CPU 라 동일.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# 나머지 의존성 설치 (레이어 캐시)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── 모델 번들링 (bge-m3 임베딩 + bge-reranker-v2-m3 리랭커) ──
# Railway FS는 재배포마다 초기화되므로 런타임 다운로드 대신 **빌드 때 받아 이미지에 굽는다**.
# 런타임은 네트워크 없이 HF_HOME 캐시에서 바로 로드 → 콜드스타트 재다운로드 제거.
#
# ⚠️ 이미지 비대화 방지(13.2GB→~6GB, 같은 레이어에서 삭제해야 실제로 줄어듦):
#   - bge-m3 저장소 원본 가중치는 pytorch_model.bin(2.2G) 하나뿐인데, transformers 가 로드 시
#     model.safetensors(2.2G) 로 자동 변환해 캐시에 **추가**한다 → 둘 다 들어가 중복.
#   - 원본 .bin 을 남기고 **자동 변환된 safetensors 를 제거**한다(저장소에 없는 파일이라 .bin 을
#     지우면 오프라인 로드가 깨진다 — 실측). .bin 은 런타임에 그대로 로드된다.
#   - xet 청크 캐시도 제거.
# (heredoc 대신 python -c 단일행 — 빌더(BuildKit/classic) 호환성 확보)
RUN python -c "from sentence_transformers import SentenceTransformer, CrossEncoder; SentenceTransformer('BAAI/bge-m3'); CrossEncoder('BAAI/bge-reranker-v2-m3'); print('[build] model cache warmed')" \
    && python -c "import glob,os; bins=glob.glob('/opt/hf-cache/hub/models--BAAI--bge-m3/snapshots/*/pytorch_model.bin'); sts=glob.glob('/opt/hf-cache/hub/models--BAAI--bge-m3/snapshots/*/model.safetensors'); [ (os.remove(os.path.realpath(s)), os.remove(s)) for s in sts ] if bins else None; print('[build] removed duplicate safetensors, kept .bin' if bins else '[build] WARN .bin missing; kept safetensors')" \
    && rm -rf /opt/hf-cache/xet /root/.cache/huggingface/xet

# 앱 코드 복사 (data/ 등은 .dockerignore 로 제외)
COPY . .

EXPOSE 8000

# 모델이 이미지에 포함됨 → 기동 시 다운로드 없이 HF_HOME 캐시에서 로드
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
