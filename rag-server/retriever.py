import sys
import chromadb
import torch
from sentence_transformers import SentenceTransformer


def _select_device() -> str:
    if sys.platform == "darwin":
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


class Retriever:
    def __init__(
        self,
        model_name: str = "BAAI/bge-m3",
        chroma_path: str = "./chroma_db",
    ):
        device = _select_device()
        print(f"[Retriever] 임베딩 모델 로드 중: {model_name} (device={device})")
        self.model = SentenceTransformer(model_name, device=device)
        self.client = chromadb.PersistentClient(path=chroma_path)
        print("[Retriever] 준비 완료")

    def search(
        self,
        query: str,
        collection_name: str,
        top_k: int = 5,
    ) -> list[dict]:
        try:
            collection = self.client.get_collection(name=collection_name)
        except Exception:
            return []

        total = collection.count()
        if total == 0:  # 컬렉션이 비어있으면 빈 리스트 반환
            return []

        query_vector = self.model.encode([query])[0].tolist()

        results = collection.query(
            query_embeddings=[query_vector],
            n_results=min(top_k, total),  # total이 0이면 위에서 이미 return
            include=["documents", "metadatas", "distances"],
        )

        if not results["documents"] or not results["documents"][0]:
            return []

        retrieved = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            score = round(1 - dist, 4)
            retrieved.append({"text": doc, "metadata": meta or {}, "score": score})

        retrieved.sort(key=lambda x: x["score"], reverse=True)
        return retrieved