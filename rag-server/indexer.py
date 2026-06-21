"""
indexer.py
────────────────────────────────────────────────────────────
청크를 임베딩해 MySQL(rag_chunk 테이블)에 저장한다. (ChromaDB 대체)

저장 단위는 (collection_name, chunk_id) — chunk_id가 있으면 같은 키로
upsert(있으면 갱신, 없으면 삽입)하고, chunk_id가 없으면 매번 새 행으로 삽입한다.
"""

from sqlalchemy import delete, select

from db import SessionLocal, RagChunk, init_db
from embeddings import get_model


class Indexer:
    def __init__(self, model_name: str = "BAAI/bge-m3", **_ignore):
        # **_ignore: 기존 chroma_path 인자 호출과의 하위호환용 (무시)
        self.model = get_model(model_name)
        init_db()  # rag_chunk 테이블 보장
        print("[Indexer] 준비 완료 (MySQL)")

    def index(
        self,
        chunks: list[str],
        metadata: list[dict] | None,
        collection_name: str,
    ) -> int:
        if not chunks:
            return 0

        raw_meta = metadata if metadata else [{} for _ in chunks]
        if len(raw_meta) != len(chunks):
            raw_meta = [{} for _ in chunks]
        metas = [self._sanitize(m) for m in raw_meta]

        print(f"[Indexer] {len(chunks)}개 청크 임베딩 중...")
        vectors = self.model.encode(chunks, batch_size=32, show_progress_bar=True)

        count = 0
        with SessionLocal() as session:
            for doc, meta, vec in zip(chunks, metas, vectors.tolist()):
                cid = meta.get("chunk_id")
                row = None
                if cid:
                    row = session.scalar(
                        select(RagChunk).where(
                            RagChunk.collection_name == collection_name,
                            RagChunk.chunk_id == cid,
                        )
                    )
                if row:  # upsert: 갱신
                    row.document       = doc
                    row.chunk_metadata = meta
                    row.embedding      = vec
                else:    # 삽입
                    session.add(RagChunk(
                        collection_name=collection_name,
                        chunk_id=cid,
                        document=doc,
                        chunk_metadata=meta,
                        embedding=vec,
                    ))
                count += 1
            session.commit()

        print(f"[Indexer] 저장 완료: {count}개 → '{collection_name}' (MySQL)")
        return count

    def clear_collection(self, collection_name: str) -> int:
        """컬렉션 전체 삭제 (재인덱싱·정리용)."""
        with SessionLocal() as session:
            result = session.execute(
                delete(RagChunk).where(RagChunk.collection_name == collection_name)
            )
            session.commit()
            return result.rowcount or 0

    def _sanitize(self, meta: dict) -> dict:
        """
        JSON 컬럼에 저장하므로 중첩 dict/list도 가능하지만,
        ChromaDB 시절 동작과 동일하게 스칼라/None 외에는 문자열로 평탄화한다.
        (Spring·기존 소비자가 기대하는 형태 유지)
        """
        result = {}
        for k, v in meta.items():
            if v is None or isinstance(v, (str, int, float, bool)):
                result[k] = v
            else:
                result[k] = str(v)
        return result
