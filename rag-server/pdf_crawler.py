"""
pdf_crawler.py — 딸각 RAG 지식 수집기 (크롤링 → 점수화 → PDF 통합 다운로드)
────────────────────────────────────────────────────────────
기존 crawl.py(v4) + pdfDownloadBycrawled.py(v5) 를 하나로 통합하고 구조를 개선했다.

[구조 개선 포인트]
  • 소스 레지스트리(SOURCES) — 출처마다 함수를 따로 짜던 것을 4개 범용 핸들러
    (arxiv / semantic_scholar / github / html)로 통합. 새 출처는 코드가 아니라
    레지스트리 항목 한 줄로 추가한다.
  • robots.txt 캐싱 — 매 요청마다 robots.txt를 새로 받던 비효율 제거(도메인당 1회).
  • 요청별 Accept 헤더 — JSON API와 HTML 페이지를 구분.
  • 출처 교차 중복 제거 — 같은 arXiv 논문이 여러 출처에 잡혀도 1건으로.
  • 2단계 파이프라인 — crawl(메타데이터 수집→manifest.json) / download(실제 PDF).
    각 단계를 따로 돌릴 수 있어 재현·디버깅이 쉽다.
  • 산출물이 곧바로 ingest_knowledge.py 의 입력 — data/downloaded_pdfs/ 트리.

[전체 흐름 — 두 프로그램]
  1) python pdf_crawler.py                         # 수집+다운로드
  2) python ingest_knowledge.py --mode paper \\     # 파싱+청킹+적합도 큐레이션
       --pdf data/downloaded_pdfs/ --collection pe_auto

설치: pip install requests beautifulsoup4 tqdm reportlab
사용:
  python pdf_crawler.py                       # 전체(crawl→download)
  python pdf_crawler.py --stage crawl         # 메타데이터만 수집
  python pdf_crawler.py --stage download      # manifest 기반 PDF만
  python pdf_crawler.py --source arxiv_paper  # 특정 출처만
  python pdf_crawler.py --dry-run             # 계획만 출력
  python pdf_crawler.py --min-score 5         # 사전 필터 강화(최종 품질은 ingest가 LLM으로)
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import time
import xml.etree.ElementTree as ET
from urllib.parse import quote, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup
from tqdm import tqdm

# ════════════════════════════════════════════════════════════
# 설정 / 경로 (스크립트 기준 절대경로 → 어디서 실행해도 동일)
# ════════════════════════════════════════════════════════════
_BASE       = pathlib.Path(__file__).parent
CRAWL_DIR   = _BASE / "data" / "prompt_data"        # manifest.json
PDF_DIR     = _BASE / "data" / "downloaded_pdfs"    # 다운로드/생성된 PDF
MANIFEST    = CRAWL_DIR / "manifest.json"
GH_RAW      = "https://raw.githubusercontent.com"
DEFAULT_DELAY = 1.5
TIMEOUT     = 30

_SESSION = requests.Session()
_SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; TtalkakResearchBot/6.0; Academic Use)",
})

# 논문 원문 PDF를 직접 받는 출처(그 외는 수집 텍스트로 PDF 생성)
PAPER_SOURCES = {"arxiv_paper", "semantic_scholar"}


# ════════════════════════════════════════════════════════════
# 관련도 스코어링 (1차 거름 — 최종 적합도는 ingest_knowledge가 LLM으로 7점 게이트)
# ════════════════════════════════════════════════════════════
CORE_KEYWORDS = [
    "prompt engineering", "prompt design", "prompt optimization",
    "instruction tuning", "few-shot", "zero-shot", "chain-of-thought",
    "in-context learning", "system prompt", "prompt template",
    "chain of thought", "cot prompting", "role prompting",
    "self-consistency", "tree of thoughts", "react prompting",
    "retrieval augmented", "rag", "prompt injection", "jailbreak",
]
RELATED_KEYWORDS = [
    "llm", "large language model", "chatgpt", "gpt", "claude", "llama",
    "instruction", "natural language", "context window", "response quality",
    "reasoning", "output format", "role", "persona", "task performance",
    "benchmark", "evaluation", "alignment", "finetuning", "rlhf",
    "transformer", "attention", "language model", "generative",
]
IRRELEVANT_KEYWORDS = [
    "image generation", "diffusion model", "text-to-image",
    "speech recognition", "object detection", "robotics",
    "hardware acceleration", "graph neural", "computer vision",
    "autonomous driving", "medical imaging",
]


def score_relevance(item: dict, bonus: float) -> dict:
    combined = " ".join(str(item.get(k, "")) for k in
                        ("title", "summary", "content", "section", "abstract")).lower()
    core    = [kw for kw in CORE_KEYWORDS if kw in combined]
    related = [kw for kw in RELATED_KEYWORDS if kw in combined]
    irrel   = [kw for kw in IRRELEVANT_KEYWORDS if kw in combined]
    length  = 1.0 if len(combined) >= 500 else (0.5 if len(combined) >= 200 else 0.0)
    score = round(max(0.0, min(10.0,
        min(len(core) * 1.0, 4.0)
        + min(len(related) * 0.5, 3.0)
        + bonus
        + max(len(irrel) * -1.0, -3.0)
        + length)), 2)
    label = ("★★★ 매우 적합" if score >= 8 else "★★ 적합" if score >= 6 else
             "★ 보통" if score >= 4 else "△ 낮음" if score >= 2 else "✕ 부적합")
    return {**item, "relevance_score": score, "relevance_label": label}


# ════════════════════════════════════════════════════════════
# HTTP 유틸 (robots 캐시 + 재시도)
# ════════════════════════════════════════════════════════════
_robots_cache: dict[str, RobotFileParser | None] = {}


def _allowed(url: str) -> bool:
    netloc = urlparse(url).netloc
    if netloc not in _robots_cache:
        rp = RobotFileParser()
        try:
            rp.set_url(f"{urlparse(url).scheme}://{netloc}/robots.txt")
            rp.read()
            _robots_cache[netloc] = rp
        except Exception:
            _robots_cache[netloc] = None  # robots 못 읽으면 허용으로 간주
    rp = _robots_cache[netloc]
    if rp is None:
        return True
    try:
        return rp.can_fetch("*", url)
    except Exception:
        return True


def safe_get(url: str, *, skip_robots: bool = False, accept: str = "*/*",
             delay: float = DEFAULT_DELAY, stream: bool = False, retries: int = 2):
    if not skip_robots and not _allowed(url):
        tqdm.write(f"  [BLOCKED] {url[:60]}")
        return None
    for attempt in range(retries + 1):
        try:
            r = _SESSION.get(url, headers={"Accept": accept}, timeout=TIMEOUT,
                             allow_redirects=True, stream=stream)
            time.sleep(delay)
            if r.status_code == 200:
                return r
            if r.status_code in (429, 500, 502, 503) and attempt < retries:
                time.sleep(delay * (attempt + 2))
                continue
            tqdm.write(f"  [HTTP {r.status_code}] {url[:64]}")
            return r if stream else None  # stream은 호출부가 상태코드 확인
        except Exception as e:
            if attempt < retries:
                time.sleep(delay * (attempt + 2))
                continue
            tqdm.write(f"  [ERROR] {url[:56]} → {e}")
            return None
    return None


def clean_text(t: str) -> str:
    return re.sub(r"\s+", " ", t or "").strip()


def sanitize_filename(text: str, max_len: int = 60) -> str:
    text = re.sub(r'[\\/:*?"<>|]', "_", text or "")
    text = re.sub(r"\s+", "_", text.strip())
    return text[:max_len] or "untitled"


def split_markdown_sections(md: str, min_len: int = 80) -> list[dict]:
    out = []
    for sec in (md or "").split("\n## "):
        lines = sec.strip().split("\n")
        title = lines[0].lstrip("#").strip()
        if not title:
            continue
        content = clean_text("\n".join(lines[1:]))
        if len(content) < min_len:
            continue
        out.append({"section": title, "content": content[:2000]})
    return out


def extract_ipynb_markdown(raw: str) -> list[str]:
    out = []
    try:
        nb = json.loads(raw)
        for cell in nb.get("cells", []):
            if cell.get("cell_type") == "markdown":
                txt = clean_text("".join(cell.get("source", [])))
                if len(txt) >= 60:
                    out.append(txt[:1500])
    except Exception:
        pass
    return out


# ════════════════════════════════════════════════════════════
# 크롤 핸들러 — 타입별 1개씩 (레지스트리가 dispatch)
# ════════════════════════════════════════════════════════════
def crawl_arxiv(entry: dict, delay: float) -> list[dict]:
    results, seen = [], set()
    for q in tqdm(entry["queries"], desc=f"  {entry['key']}", leave=False):
        url = ("http://export.arxiv.org/api/query"
               f"?search_query=all:{q}&sortBy=relevance&sortOrder=descending"
               f"&max_results={entry.get('max_results', 8)}")
        r = safe_get(url, skip_robots=True, accept="application/atom+xml", delay=max(delay, 3.0))
        if r is None:
            continue
        try:
            root = ET.fromstring(r.text)
        except Exception as e:
            tqdm.write(f"    [WARN] arXiv 파싱: {e}")
            continue
        ns = {"a": "http://www.w3.org/2005/Atom"}
        for e in root.findall("a:entry", ns):
            idn = e.find("a:id", ns)
            if idn is None:
                continue
            aid = idn.text.split("/abs/")[-1].strip()
            if aid in seen:
                continue
            seen.add(aid)
            abstract = clean_text((e.find("a:summary", ns).text if e.find("a:summary", ns) is not None else ""))
            if not abstract:
                continue
            authors = [a.find("a:name", ns).text for a in e.findall("a:author", ns)[:3]]
            results.append({
                "source": "arxiv_paper",
                "title": clean_text((e.find("a:title", ns).text if e.find("a:title", ns) is not None else "")),
                "abstract": abstract[:1500],
                "arxiv_id": aid,
                "authors": ", ".join(a for a in authors if a),
                "url": f"https://arxiv.org/abs/{aid}",
                "query": q,
            })
    return results


def crawl_semantic_scholar(entry: dict, delay: float) -> list[dict]:
    results, seen = [], set()
    for q in tqdm(entry["queries"], desc=f"  {entry['key']}", leave=False):
        url = ("https://api.semanticscholar.org/graph/v1/paper/search"
               f"?query={quote(q)}"
               "&fields=paperId,title,abstract,year,authors,externalIds"
               f"&limit={entry.get('max_results', 10)}")
        r = safe_get(url, skip_robots=True, accept="application/json", delay=max(delay, 1.0))
        if r is None:
            continue
        try:
            data = r.json()
        except Exception:
            continue
        for p in data.get("data", []):
            pid = p.get("paperId", "")
            if pid in seen or not p.get("abstract"):
                continue
            seen.add(pid)
            aid = (p.get("externalIds") or {}).get("ArXiv", "")
            results.append({
                "source": "semantic_scholar",
                "title": p.get("title", ""),
                "abstract": p.get("abstract", "")[:1500],
                "year": p.get("year", ""),
                "authors": ", ".join(a.get("name", "") for a in (p.get("authors") or [])[:3]),
                "arxiv_id": aid,
                "url": f"https://arxiv.org/abs/{aid}" if aid else f"https://www.semanticscholar.org/paper/{pid}",
                "query": q,
            })
    return results


def crawl_github(entry: dict, delay: float) -> list[dict]:
    repo, branch = entry["repo"], entry.get("branch", "main")
    min_len = entry.get("min_len", 80)
    results = []
    for fpath in tqdm(entry.get("md_files", []), desc=f"  {entry['key']}", leave=False):
        r = safe_get(f"{GH_RAW}/{repo}/{branch}/{fpath}", skip_robots=True, delay=delay)
        if r is None:
            continue
        text = re.sub(r"^---.*?---\n", "", r.text, flags=re.DOTALL)  # YAML 프론트매터 제거
        secs = split_markdown_sections(text, min_len=min_len)
        if not secs:  # 섹션 구분 없으면 통째로
            whole = clean_text(text)[:2000]
            if len(whole) >= 200:
                secs = [{"section": fpath.split("/")[-1], "content": whole}]
        for sec in secs:
            results.append({
                "source": entry["key"], "file": fpath,
                "section": sec["section"], "content": sec["content"],
                "url": f"https://github.com/{repo}/blob/{branch}/{fpath}",
            })
    for fpath in tqdm(entry.get("ipynb_files", []), desc=f"  {entry['key']}-nb", leave=False):
        r = safe_get(f"{GH_RAW}/{repo}/{branch}/{fpath}", skip_robots=True, delay=delay)
        if r is None:
            continue
        name = fpath.split("/")[-1].replace(".ipynb", "")
        for i, txt in enumerate(extract_ipynb_markdown(r.text)):
            results.append({
                "source": entry["key"], "file": fpath,
                "section": f"{name} (셀 {i+1})", "content": txt,
                "url": f"https://github.com/{repo}/blob/{branch}/{fpath}",
            })
    return results


def crawl_html(entry: dict, delay: float) -> list[dict]:
    parse = entry.get("parse", "sections")
    results = []
    for url in tqdm(entry["urls"], desc=f"  {entry['key']}", leave=False):
        r = safe_get(url, accept="text/html", delay=delay)
        if r is None:
            continue
        soup = BeautifulSoup(r.text, "html.parser")
        title_el = soup.find("h1") or soup.find("title")
        title = clean_text(title_el.text) if title_el else url.split("/")[-1]

        if parse == "pwc":  # Papers With Code 태스크 페이지
            for card in soup.find_all("div", class_=re.compile(r"paper-card|item-content"))[:10]:
                t_el = card.find(["h1", "h2", "h3", "h4", "a"])
                if not t_el:
                    continue
                abs = card.find("p", class_=re.compile(r"abstract|desc"))
                results.append({
                    "source": entry["key"], "title": clean_text(t_el.text),
                    "section": clean_text(t_el.text),
                    "content": clean_text(abs.text)[:1000] if abs else "",
                    "url": url,
                })
            continue

        article = (soup.find("article") or soup.find("main")
                   or soup.find("div", class_=re.compile(r"post|content|entry|blog")))
        if not article:
            continue
        secs = []
        if parse == "sections":
            for h in article.find_all(["h2", "h3"]):
                parts = []
                for sib in h.find_next_siblings():
                    if sib.name in ("h2", "h3"):
                        break
                    txt = clean_text(sib.get_text())
                    if txt:
                        parts.append(txt)
                content = " ".join(parts)[:1500]
                if len(content) >= 100:
                    secs.append({"section": f"{title} — {clean_text(h.text)}", "content": content})
        if not secs:  # article 모드 또는 섹션 추출 실패 → 전체
            full = clean_text(article.get_text())[:2500]
            if len(full) >= 200:
                secs = [{"section": title, "content": full}]
        for sec in secs:
            results.append({
                "source": entry["key"], "title": title,
                "section": sec["section"], "content": sec["content"], "url": url,
            })
    return results


HANDLERS = {
    "arxiv": crawl_arxiv,
    "semantic_scholar": crawl_semantic_scholar,
    "github": crawl_github,
    "html": crawl_html,
}


# ════════════════════════════════════════════════════════════
# 소스 레지스트리 — 새 출처는 여기 한 항목만 추가하면 된다
# ════════════════════════════════════════════════════════════
SOURCES: list[dict] = [
    {"key": "semantic_scholar", "type": "semantic_scholar", "bonus": 2.0,
     "display": "Semantic Scholar 논문", "queries": [
        "prompt engineering large language models", "chain-of-thought prompting",
        "few-shot learning prompting", "in-context learning", "instruction tuning LLM",
        "zero-shot prompting", "retrieval augmented generation",
        "prompt optimization automatic", "self-consistency prompting",
        "tree of thoughts reasoning", "react reasoning acting LLM",
        "system prompt design", "jailbreak prompt injection",
        "alignment RLHF instruction following"]},

    {"key": "arxiv_paper", "type": "arxiv", "bonus": 2.0, "display": "arXiv 논문",
     "queries": [
        "prompt+engineering+LLM", "chain-of-thought+prompting", "few-shot+prompting+GPT",
        "instruction+tuning+language+model", "in-context+learning+transformers",
        "zero-shot+reasoning+LLM", "retrieval+augmented+generation",
        "automatic+prompt+optimization", "self-consistency+language+model",
        "tree+of+thoughts+prompting"]},

    {"key": "learn_prompting", "type": "github", "bonus": 1.5, "display": "Learn Prompting",
     "repo": "trigaten/Learn_Prompting", "min_len": 100, "md_files": [
        "docs/basics/prompt_engineering.md", "docs/basics/instructions.md",
        "docs/basics/few_shot.md", "docs/basics/combining_techniques.md",
        "docs/intermediate/chain_of_thought.md", "docs/intermediate/zero_shot_cot.md",
        "docs/intermediate/self_consistency.md", "docs/intermediate/generated_knowledge.md",
        "docs/intermediate/least_to_most.md", "docs/advanced/prompt_chaining.md",
        "docs/advanced/tree_of_thoughts.md", "docs/advanced/react.md",
        "docs/advanced/automatic_prompt_engineer.md", "docs/reliability/intro.md",
        "docs/reliability/calibration.md", "docs/reliability/debiasing.md",
        "docs/prompt_hacking/prompt_injection.md", "docs/prompt_hacking/jailbreaking.md"]},

    {"key": "dair_prompt_guide", "type": "github", "bonus": 1.5,
     "display": "DAIR — Prompt Engineering Guide",
     "repo": "dair-ai/Prompt-Engineering-Guide", "md_files": [
        "README.md", "guides/prompts-intro.md", "guides/prompts-basic-usage.md",
        "guides/prompts-advanced-usage.md", "guides/prompts-applications.md",
        "guides/prompts-chatgpt.md", "guides/prompts-adversarial.md",
        "guides/prompts-reliability.md", "guides/prompts-miscellaneous.md"]},

    {"key": "brex_prompt_guide", "type": "github", "bonus": 1.5,
     "display": "Brex — Prompt Engineering Guide",
     "repo": "brexhq/prompt-engineering", "md_files": ["README.md"]},

    {"key": "anthropic_cookbook", "type": "github", "bonus": 1.2,
     "display": "Anthropic Cookbook", "repo": "anthropics/anthropic-cookbook",
     "min_len": 50, "md_files": ["README.md"], "ipynb_files": [
        "tool_use/customer_service_agent.ipynb", "misc/how_to_make_sql_queries.ipynb",
        "misc/how_to_enable_json_mode.ipynb", "misc/building_evals.ipynb",
        "misc/prompt_caching.ipynb"]},

    {"key": "openai_cookbook", "type": "github", "bonus": 1.2, "display": "OpenAI Cookbook",
     "repo": "openai/openai-cookbook", "md_files": [
        "articles/techniques_to_improve_reliability.md",
        "articles/how_to_work_with_large_language_models.md",
        "articles/related_resources.md"]},

    {"key": "github_prompt_repo", "type": "github", "bonus": 0.5,
     "display": "Awesome ChatGPT Prompts", "repo": "f/awesome-chatgpt-prompts",
     "min_len": 50, "md_files": ["README.md"]},

    {"key": "huggingface_blog", "type": "html", "bonus": 1.3, "display": "HuggingFace Blog",
     "parse": "sections", "urls": [
        "https://huggingface.co/blog/llm-prompting-guide",
        "https://huggingface.co/blog/few-shot-learning-gpt-neo-and-inference-api",
        "https://huggingface.co/blog/instruction-tuning-vol-1",
        "https://huggingface.co/blog/rlhf",
        "https://huggingface.co/blog/rag-series-part-1"]},

    {"key": "microsoft_research", "type": "html", "bonus": 1.5,
     "display": "Microsoft Research Blog", "parse": "article", "urls": [
        "https://www.microsoft.com/en-us/research/blog/the-power-of-prompting/"]},

    {"key": "papers_with_code", "type": "html", "bonus": 1.8,
     "display": "Papers With Code", "parse": "pwc", "urls": [
        f"https://paperswithcode.com/task/{t}" for t in (
            "prompt-engineering", "few-shot-learning", "chain-of-thought-reasoning",
            "in-context-learning", "instruction-following", "zero-shot-learning")]},
]

BONUS = {s["key"]: s["bonus"] for s in SOURCES}
DISPLAY = {s["key"]: s["display"] for s in SOURCES}


# ════════════════════════════════════════════════════════════
# STAGE 1 — CRAWL
# ════════════════════════════════════════════════════════════
def _dedup_key(item: dict) -> str:
    return (item.get("arxiv_id")
            or re.sub(r"\s+", " ", (item.get("title") or item.get("section") or "").lower()).strip()
            or item.get("url", ""))


def run_crawl(source_filter: str, delay: float) -> list[dict]:
    CRAWL_DIR.mkdir(parents=True, exist_ok=True)
    sources = [s for s in SOURCES if not source_filter or s["key"] == source_filter]
    print(f"▶ CRAWL: {len(sources)}개 출처 수집")

    items: list[dict] = []
    for s in sources:
        handler = HANDLERS[s["type"]]
        try:
            raw = handler(s, delay)
        except Exception as e:
            print(f"  [ERROR] {s['key']} 수집 실패: {e}")
            raw = []
        scored = [score_relevance(i, BONUS.get(s["key"], 0.0)) for i in raw]
        avg = sum(i["relevance_score"] for i in scored) / len(scored) if scored else 0
        print(f"  ✓ {s['display']:<34} {len(scored):>4}건 | 평균 {avg:.1f}")
        items += scored

    # 출처 교차 중복 제거 — 같은 키는 점수 높은 쪽 유지
    best: dict[str, dict] = {}
    for it in items:
        k = _dedup_key(it)
        if not k:
            continue
        if k not in best or it["relevance_score"] > best[k]["relevance_score"]:
            best[k] = it
    deduped = sorted(best.values(), key=lambda x: x["relevance_score"], reverse=True)

    MANIFEST.write_text(json.dumps(deduped, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  📦 manifest: {MANIFEST}  (중복 제거 {len(items)}→{len(deduped)}건)")
    return deduped


# ════════════════════════════════════════════════════════════
# STAGE 2 — DOWNLOAD (논문 PDF 직접 다운로드 / 텍스트 → PDF 생성)
# ════════════════════════════════════════════════════════════
def build_pdf(items: list[dict], title: str, out_path: pathlib.Path,
              combined: bool = False) -> bool:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable

    doc = SimpleDocTemplate(str(out_path), pagesize=A4,
                            leftMargin=22*mm, rightMargin=22*mm,
                            topMargin=20*mm, bottomMargin=20*mm, title=title)
    ss = getSampleStyleSheet()
    S = {
        "title": ParagraphStyle("DT", parent=ss["Title"], fontSize=17, spaceAfter=10,
                                fontName="Helvetica-Bold", textColor=colors.HexColor("#1a1a2e")),
        "sec": ParagraphStyle("ST", parent=ss["Heading1"], fontSize=13, spaceBefore=16,
                              spaceAfter=6, fontName="Helvetica-Bold", textColor=colors.HexColor("#16213e")),
        "meta": ParagraphStyle("MT", parent=ss["Normal"], fontSize=9, spaceAfter=4,
                               textColor=colors.HexColor("#888"), fontName="Helvetica-Oblique"),
        "body": ParagraphStyle("BD", parent=ss["Normal"], fontSize=10, leading=16,
                               spaceAfter=5, textColor=colors.HexColor("#333")),
        "badge": ParagraphStyle("SB", parent=ss["Normal"], fontSize=9, spaceAfter=8,
                                fontName="Helvetica-Bold", textColor=colors.HexColor("#2d6a2d")),
    }
    story = [Paragraph(title, S["title"]),
             HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#1a1a2e"), spaceAfter=12)]

    def para(text: str, style):
        try:
            text = re.sub(r"!\[.*?\]\(.*?\)", "[이미지]", text)
            text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
            text = re.sub(r"<(?!/?(?:b|i|br|font)[/> ])[^>]+>", "", text)
            text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            text = re.sub(r"&lt;b&gt;(.+?)&lt;/b&gt;", r"<b>\1</b>", text)
            text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
            text = re.sub(r"`([^`]+)`", r'<font name="Courier" size="8">\1</font>', text)
            story.append(Paragraph(text, style))
        except Exception:
            story.append(Paragraph(re.sub(r"<[^>]+>", "", text).replace("&amp;", "&"), style))

    for it in items:
        para((it.get("section") or it.get("title") or "(제목 없음)")[:120], S["sec"])
        meta = []
        for k, fmt in (("authors", "저자: {}"), ("year", "연도: {}"),
                       ("arxiv_id", "arXiv: {}"), ("url", "URL: {}")):
            if it.get(k):
                meta.append(fmt.format(str(it[k])[:80]))
        if meta:
            para(" | ".join(meta), S["meta"])
        para(f"★ 적합도: {it.get('relevance_score', 0)}/10  {it.get('relevance_label','')}", S["badge"])
        body = it.get("abstract") or it.get("content") or it.get("summary") or ""
        for p in body.split("\n\n"):
            p = p.strip()
            if len(p) > 2:
                para(p[:1500], S["body"])
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#ddd"),
                                spaceBefore=10, spaceAfter=10) if combined else Spacer(1, 8))
    try:
        doc.build(story)
        return True
    except Exception as e:
        tqdm.write(f"  [PDF ERROR] {title}: {e}")
        return False


def _download_arxiv_pdf(item: dict, out_dir: pathlib.Path, delay: float) -> dict:
    aid = item["arxiv_id"]
    clean_id = re.sub(r"v\d+$", "", aid)
    out_path = out_dir / (sanitize_filename(item.get("title", "paper")) + f"__{clean_id}.pdf")
    if out_path.exists() and out_path.stat().st_size > 1000:
        return {"status": "skip", "path": str(out_path)}
    r = safe_get(f"https://arxiv.org/pdf/{aid}", skip_robots=True, delay=max(delay, 2.0), stream=True)
    if r is not None and r.status_code == 200:
        size = 0
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
                size += len(chunk)
        if size < 1000:
            out_path.unlink(missing_ok=True)
            return {"status": "error", "title": item.get("title"), "reason": "파일 너무 작음"}
        return {"status": "ok", "path": str(out_path), "size": size}
    # 차단/실패 → abstract PDF로 대체
    ok = build_pdf([item], item.get("title", "paper"), out_path)
    return {"status": "fallback_abstract" if ok else "error",
            "title": item.get("title"), "path": str(out_path)}


def run_download(manifest: list[dict], min_score: float, source_filter: str,
                 per_section: bool, delay: float) -> None:
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    groups: dict[str, list[dict]] = {}
    for it in manifest:
        if it.get("relevance_score", 0) < min_score:
            continue
        if source_filter and it.get("source") != source_filter:
            continue
        groups.setdefault(it.get("source", "unknown"), []).append(it)

    if not groups:
        print("  (조건에 맞는 항목이 없습니다)")
        return

    print(f"▶ DOWNLOAD: min-score {min_score}↑")
    results = []
    total = sum(len(v) + (0 if k in PAPER_SOURCES else 1) for k, v in groups.items())
    with tqdm(total=total, ncols=72, desc="다운로드") as pbar:
        for src, items in sorted(groups.items()):
            if src in PAPER_SOURCES:
                sub = PDF_DIR / src
                sub.mkdir(exist_ok=True)
                seen = set()
                for it in items:
                    pbar.set_description(f"[{src[:10]}] {it.get('title','')[:24]}")
                    if it.get("arxiv_id"):
                        if it["arxiv_id"] in seen:
                            pbar.update(1); continue
                        seen.add(it["arxiv_id"])
                        results.append(_download_arxiv_pdf(it, sub, delay))
                    else:  # arXiv id 없는 S2 → abstract PDF
                        op = sub / (sanitize_filename(it.get("title", "paper")) + ".pdf")
                        if not (op.exists() and op.stat().st_size > 500):
                            build_pdf([it], it.get("title", "paper"), op)
                        results.append({"status": "ok", "path": str(op)})
                    pbar.update(1)
            else:
                # 텍스트 출처 → 통합 PDF 1개 (+옵션: 섹션별 개별 PDF)
                display = DISPLAY.get(src, src)
                if per_section:
                    sdir = PDF_DIR / src / "sections"
                    sdir.mkdir(parents=True, exist_ok=True)
                    for i, it in enumerate(items):
                        op = sdir / f"{i+1:03d}_{sanitize_filename(it.get('section') or it.get('title') or str(i))}.pdf"
                        if not (op.exists() and op.stat().st_size > 300):
                            build_pdf([it], f"{display} — {it.get('section','')}", op)
                        results.append({"status": "ok", "path": str(op)})
                op = PDF_DIR / f"{sanitize_filename(display)}.pdf"
                pbar.set_description(f"[{src[:10]}] 통합본")
                if not (op.exists() and op.stat().st_size > 500):
                    ok = build_pdf(items, display, op, combined=True)
                    results.append({"status": "ok" if ok else "error", "path": str(op),
                                    "size": op.stat().st_size if op.exists() else 0})
                    if ok:
                        tqdm.write(f"  ✓ [통합] {display} ({len(items)}섹션)")
                else:
                    results.append({"status": "skip", "path": str(op)})
                pbar.update(1)

    ok = [r for r in results if r["status"] in ("ok", "fallback_abstract")]
    skip = [r for r in results if r["status"] == "skip"]
    err = [r for r in results if r["status"] == "error"]
    print(f"\n  ✓ 성공 {len(ok)} / ↷ 스킵 {len(skip)} / ✗ 오류 {len(err)}")
    print(f"  저장 위치: {PDF_DIR}/  → 다음 단계:")
    print(f"    python ingest_knowledge.py --mode paper --pdf {PDF_DIR}/ --collection pe_auto")
    (PDF_DIR / "download_log.json").write_text(
        json.dumps({"ok": ok, "skip": skip, "errors": err}, ensure_ascii=False, indent=2),
        encoding="utf-8")


# ════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════
def main() -> None:
    ap = argparse.ArgumentParser(
        description="딸각 RAG 지식 수집기 — 크롤링→점수화→PDF 통합 다운로드(2단계 통합본)")
    ap.add_argument("--stage", choices=["all", "crawl", "download"], default="all")
    ap.add_argument("--min-score", type=float, default=4.0,
                    help="다운로드 사전 필터(기본 4.0). 최종 적합도는 ingest_knowledge가 LLM으로 7점 게이트")
    ap.add_argument("--source", default="", help="특정 출처만 (예: arxiv_paper)")
    ap.add_argument("--per-section", action="store_true",
                    help="텍스트 출처를 섹션별 개별 PDF로도 생성(기본은 통합본 1개)")
    ap.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="요청 간 대기(초)")
    ap.add_argument("--dry-run", action="store_true", help="계획만 출력")
    args = ap.parse_args()

    print("=" * 64)
    print("  딸각 RAG 지식 수집기 (pdf_crawler)")
    print(f"  stage={args.stage} | min-score={args.min_score} | source={args.source or '전체'}")
    print("=" * 64)

    if args.dry_run:
        srcs = [s for s in SOURCES if not args.source or s["key"] == args.source]
        print(f"\n[DRY RUN] 대상 출처 {len(srcs)}개:")
        for s in srcs:
            n = len(s.get("queries") or s.get("md_files") or s.get("urls") or [1]) \
                + len(s.get("ipynb_files", []))
            kind = "논문 PDF 직접" if s["key"] in PAPER_SOURCES else "텍스트→PDF 통합본"
            print(f"  • {s['display']:<34} [{s['type']:>16}] ~{n}개 입력 → {kind}")
        print(f"\n  manifest → {MANIFEST}\n  PDF      → {PDF_DIR}/")
        return

    manifest = []
    if args.stage in ("all", "crawl"):
        manifest = run_crawl(args.source, args.delay)
    if args.stage in ("all", "download"):
        if not manifest:
            if not MANIFEST.exists():
                print("❌ manifest가 없습니다. 먼저 --stage crawl 을 실행하세요.")
                return
            manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        run_download(manifest, args.min_score, args.source, args.per_section, args.delay)


if __name__ == "__main__":
    main()
