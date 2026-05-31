import uuid
import sys
import chromadb
import torch
from sentence_transformers import SentenceTransformer


def _select_device() -> str:
    """
    실행 환경에 맞는 디바이스 자동 선택
    - Mac (MPS) → cpu  (MPS는 메모리 OOM 위험)
    - CUDA GPU 있음 → cuda
    - 그 외 → cpu
    """
    if sys.platform == "darwin":
        # Apple Silicon MPS는 메모리 초과 위험 → CPU 사용
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


class Indexer:
    def __init__(
        self,
        model_name: str = "BAAI/bge-m3",
        chroma_path: str = "./chroma_db",
    ):
        device = _select_device()
        print(f"[Indexer] 임베딩 모델 로드 중: {model_name} (device={device})")
        self.model = SentenceTransformer(model_name, device=device)
        self.client = chromadb.PersistentClient(path=chroma_path)
        print("[Indexer] 준비 완료")

    def index(
        self,
        chunks: list[str],
        metadata: list[dict] | None,
        collection_name: str,
    ) -> int:
        if not chunks:
            return 0

        # metadata 정규화 + ChromaDB 허용 타입으로 평탄화
        raw_meta = metadata if metadata else [{} for _ in chunks]
        if len(raw_meta) != len(chunks):
            raw_meta = [{} for _ in chunks]

        meta = [self._sanitize(m) for m in raw_meta]

        print(f"[Indexer] {len(chunks)}개 청크 임베딩 중...")
        vectors = self.model.encode(chunks, batch_size=32, show_progress_bar=True)

        collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

        ids = [str(uuid.uuid4()) for _ in chunks]

        collection.upsert(
            ids=ids,
            documents=chunks,
            embeddings=vectors.tolist(),
            metadatas=meta,
        )

        print(f"[Indexer] 저장 완료: {len(chunks)}개 → '{collection_name}'")
        return len(chunks)

    def _sanitize(self, meta: dict) -> dict:
        """
        ChromaDB는 str, int, float, bool, None만 허용.
        dict/list 등 중첩 타입은 str로 변환.
        빈 dict {}는 None으로 변환.
        """
        result = {}
        for k, v in meta.items():
            if v is None or isinstance(v, (str, int, float, bool)):
                result[k] = v
            else:
                result[k] = str(v)  # dict, list 등 → 문자열로 변환
        return result if result else {"_empty": "true"}