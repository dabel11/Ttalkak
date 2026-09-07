"""
app — RAG 서버 런타임 패키지.

프로젝트 공용 경로(PROJECT_ROOT/DATA_DIR)를 정의하고, .env를 한 번만 로드한다.
db.py가 import 시점에 환경변수로 DB 엔진을 만들므로, 이 로드가 가장 먼저 일어나야 한다
(어떤 하위 모듈을 import하든 패키지 __init__ 가 선실행된다).
"""

import pathlib

from dotenv import load_dotenv

PROJECT_ROOT = pathlib.Path(__file__).resolve().parent.parent  # rag-server/
DATA_DIR = PROJECT_ROOT / "data"

load_dotenv(dotenv_path=PROJECT_ROOT / ".env")
