"""
tests/test_gen_eval_cache.py
────────────────────────────────────────────────────────────
gen_eval 생성 캐시 키 계약 — **생성 입력을 바꾸는 것은 전부 키에 들어가야 한다.**

2026-09-20: 1단계 분석 결과가 빠져 있었다. 같은 질의라도 분석기가 원문을 required 로
잡았는지 fact 로 잡았는지에 따라 생성기의 mode 가 갈리는데, 키가 같아 **이전 생성이
재사용**될 수 있었다(층 필터 A/B 처럼 분석기 비결정성이 결과를 흔드는 측정에서 특히 위험).

app.main 을 불러오면 DB·모델이 따라오므로, 키 함수만 소스에서 떼어 단위 테스트한다.
"""

import hashlib
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

_SRC = (Path(__file__).resolve().parents[1] / "eval" / "gen_eval.py").read_text(encoding="utf-8")


def _load_key_funcs():
    """_analysis_sig / _cache_key 만 격리해 실행(무거운 import 회피)."""
    start = _SRC.index("def _analysis_sig(")
    end = _SRC.index("def _load_cache(")
    ns = {"hashlib": hashlib, "SYSTEM_PROMPT": "SYS"}
    exec(compile(_SRC[start:end], "gen_eval_keys", "exec"), ns)
    return types.SimpleNamespace(sig=ns["_analysis_sig"], key=ns["_cache_key"])


K = _load_key_funcs()
_TECHS = ["Role Prompting"]
_REQUIRED = {"taskType": "번역", "templateRequest": False,
             "fields": [{"name": "원문", "role": "required", "status": "empty", "value": None}]}
_FACT = {"taskType": "번역", "templateRequest": True,
         "fields": [{"name": "원문", "role": "fact", "status": "empty", "value": None}]}


def test_role_change_changes_key():
    """required ↔ fact 는 생성기의 mode 를 가르는 차이다 — 키가 달라야 한다."""
    assert K.key("q", _TECHS, analysis=_REQUIRED) != K.key("q", _TECHS, analysis=_FACT)


def test_missing_analysis_differs_from_present():
    assert K.key("q", _TECHS, analysis=None) != K.key("q", _TECHS, analysis=_REQUIRED)


def test_same_analysis_same_key():
    import copy
    assert K.key("q", _TECHS, analysis=_REQUIRED) == K.key("q", _TECHS, analysis=copy.deepcopy(_REQUIRED))


def test_field_order_does_not_matter():
    a = {"taskType": "번역", "fields": [{"name": "원문", "role": "fact", "status": "empty"},
                                      {"name": "목표 언어", "role": "required", "status": "filled", "value": "한국어"}]}
    b = {"taskType": "번역", "fields": list(reversed(a["fields"]))}
    assert K.key("q", _TECHS, analysis=a) == K.key("q", _TECHS, analysis=b)


def test_filled_value_changes_key():
    """같은 필드라도 값이 다르면 생성 입력이 다르다."""
    a = {"taskType": "번역", "fields": [{"name": "목표 언어", "role": "required", "status": "filled", "value": "한국어"}]}
    b = {"taskType": "번역", "fields": [{"name": "목표 언어", "role": "required", "status": "filled", "value": "영어"}]}
    assert K.key("q", _TECHS, analysis=a) != K.key("q", _TECHS, analysis=b)


def test_template_flag_changes_key():
    """templateRequest 는 분석 블록 렌더를 바꾼다(=생성 입력)."""
    a = dict(_FACT, templateRequest=False)
    assert K.key("q", _TECHS, analysis=_FACT) != K.key("q", _TECHS, analysis=a)


def test_gen_eval_passes_precomputed_analysis():
    """run_generation 을 부를 때 use_analyzer=False + analysis 를 넘겨야 한다 —
    안 그러면 분석기가 다시 돌아 키가 가정한 것과 다른 분석으로 생성된다."""
    call = _SRC[_SRC.index("gen = _retry(lambda: run_generation("):]
    call = call[:call.index("\n\n")]
    assert "use_analyzer=False" in call and "analysis=analysis" in call
