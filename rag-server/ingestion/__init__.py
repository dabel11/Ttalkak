"""
ingestion — 오프라인 데이터 적재 파이프라인 (서버와 별개로 실행).

app 패키지에서 공용 경로를 가져온다. 이때 app.__init__ 이 .env 를 로드하므로
적재 스크립트의 LLM/DB 호출에 필요한 환경변수도 함께 준비된다.
"""

from app import PROJECT_ROOT, DATA_DIR  # noqa: F401  (.env 로드 부수효과 포함)
