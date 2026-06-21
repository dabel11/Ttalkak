# rag-server (FastAPI + bge-m3 + MySQL)
FROM python:3.11-slim

# MySQL 클라이언트 빌드/런타임 의존성 최소화 (PyMySQL은 순수 파이썬이라 컴파일 불필요)
WORKDIR /app

# 의존성 먼저 설치 (레이어 캐시)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 앱 코드 복사
COPY . .

EXPOSE 8000

# 모델은 첫 기동 시 다운로드되어 /root/.cache/huggingface 볼륨에 캐시됨
CMD ["python", "main.py"]
