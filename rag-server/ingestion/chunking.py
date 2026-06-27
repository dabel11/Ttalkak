"""
chunking.py
────────────────────────────────────────────────────────────
시맨틱 청킹 유틸 (신규/자유형식 문서용).

naive 고정길이 분할은 문장·문단·구조를 끊어 청크가 문맥을 잃는다. 여기서는
마크다운 헤더(#)와 문단(빈 줄) 경계를 우선 존중하면서 max_chars 한도로 묶고,
청크 간 소폭 오버랩으로 경계 손실을 줄인다.

※ 현재 'prompt_techniques' 100청크는 이미 기법 단위로 잘 분리돼 있어 재청킹이
   필요 없다. 이 유틸은 앞으로 논문·가이드 같은 자유형식 문서를 인덱싱할 때 쓴다.

사용 예:
    from ingestion.chunking import semantic_chunks
    from app.rag.indexer import Indexer
    chunks = semantic_chunks(open("guide.md").read())
    Indexer().index(chunks=chunks, metadata=None, collection_name="guides")
"""

import re

_HEADER_RE = re.compile(r"^#{1,6}\s+\S", re.MULTILINE)


def _split_blocks(text: str) -> list[str]:
    """헤더 시작 지점에서 섹션을 자르고, 각 섹션을 문단(빈 줄)으로 더 나눈다."""
    text = text.replace("\r\n", "\n").strip()
    if not text:
        return []

    # 헤더 위치로 섹션 경계 잡기
    starts = [m.start() for m in _HEADER_RE.finditer(text)]
    if not starts or starts[0] != 0:
        starts = [0] + starts
    sections = [text[starts[i]:(starts[i + 1] if i + 1 < len(starts) else len(text))].strip()
                for i in range(len(starts))]

    # 섹션을 문단 단위로 평탄화 (빈 청크 제거)
    blocks: list[str] = []
    for sec in sections:
        for para in re.split(r"\n\s*\n", sec):
            para = para.strip()
            if para:
                blocks.append(para)
    return blocks


def semantic_chunks(text: str, max_chars: int = 1200, overlap: int = 150) -> list[str]:
    """
    구조 경계(헤더·문단)를 존중하며 max_chars 이하 청크로 묶는다.
    - 한 문단이 max_chars를 넘으면 문장 경계로 추가 분할.
    - 청크 사이에 overlap 글자만큼 꼬리를 다음 청크 앞에 덧붙인다.
    """
    blocks = _split_blocks(text)
    if not blocks:
        return []

    # 너무 긴 문단은 문장 단위로 쪼개 블록 재구성
    norm: list[str] = []
    for b in blocks:
        if len(b) <= max_chars:
            norm.append(b)
        else:
            norm.extend(_split_long(b, max_chars))

    # 블록들을 max_chars 한도로 그리디하게 묶기
    chunks: list[str] = []
    cur = ""
    for b in norm:
        if cur and len(cur) + len(b) + 2 > max_chars:
            chunks.append(cur.strip())
            cur = (cur[-overlap:] + "\n\n" + b) if overlap else b   # 오버랩 꼬리
        else:
            cur = (cur + "\n\n" + b) if cur else b
    if cur.strip():
        chunks.append(cur.strip())
    return chunks


def _split_long(block: str, max_chars: int) -> list[str]:
    """max_chars를 넘는 단일 문단을 문장 경계로 분할."""
    sentences = re.split(r"(?<=[.!?。])\s+|(?<=다\.)\s+", block)
    out, cur = [], ""
    for s in sentences:
        if cur and len(cur) + len(s) + 1 > max_chars:
            out.append(cur.strip())
            cur = s
        else:
            cur = (cur + " " + s) if cur else s
    if cur.strip():
        out.append(cur.strip())
    return out
