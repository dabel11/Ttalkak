"""Execute the real query endpoint with models/DB/providers and routing stubbed.
Run from rag-server: python -m unittest tests.test_query_fallback
"""
import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

class HTTPException(Exception):
    def __init__(self, status_code, detail):
        self.status_code, self.detail = status_code, detail

class App:
    def __init__(self, **kwargs): pass
    def add_middleware(self, *args, **kwargs): pass
    def get(self, *args, **kwargs): return lambda function: function
    def post(self, *args, **kwargs): return lambda function: function

def module(name, **values):
    result = ModuleType(name)
    result.__dict__.update(values)
    return result

def load_endpoint():
    stubs = {
        'uvicorn': module('uvicorn'),
        'dotenv': module('dotenv', load_dotenv=lambda **kwargs: None),
        'fastapi': module('fastapi', FastAPI=App, Header=lambda **kwargs: None, HTTPException=HTTPException),
        'fastapi.middleware': module('fastapi.middleware'),
        'fastapi.middleware.cors': module('fastapi.middleware.cors', CORSMiddleware=object),
        'app.rag.indexer': module('app.rag.indexer', Indexer=Mock),
        'app.rag.retriever': module('app.rag.retriever', Retriever=Mock),
        'app.rag.generator': module('app.rag.generator', Generator=Mock),
        'app.rag.query_transform': module('app.rag.query_transform'),
        'app.rag.analyzer': module('app.rag.analyzer'),
    }
    spec = importlib.util.spec_from_file_location('query_fallback_endpoint', Path(__file__).parents[1] / 'app' / 'main.py')
    endpoint = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, stubs): spec.loader.exec_module(endpoint)
    return endpoint

main = load_endpoint()
PROMPT = '대학교 팀 프로젝트 회의록을 작성하는 프롬프트를 만들어줘.'
IMPROVED = '너는 회의록 작성 전문가이다. 참석자, 결정 사항, 담당 업무와 마감일을 표로 정리하라.'
GENERATION = dict(mode='improve', answer=IMPROVED, improved_prompt=IMPROVED,
                  techniques_applied=['역할 지정'], changes=['출력 형식 명시'],
                  score=9, summary='회의록 작성 지시 개선', questions=[], fields=[])

class QueryFallbackTests(unittest.TestCase):
    def request(self, history=None, **kwargs):
        return main.QueryRequest(query=PROMPT, history=history, **kwargs)

    def test_no_evidence_generates_on_first_and_followup_turns(self):
        for history in ([], [{'role': 'user', 'content': PROMPT}]):
            with self.subTest(history=history), patch.object(main.retriever, 'search', return_value=[]), patch.object(main, 'run_generation', return_value=GENERATION) as generate:
                response = main.query(self.request(history))
                generate.assert_called_once_with(PROMPT, [], 'gemini-2.0-flash', history)
                self.assertEqual(IMPROVED, response.improved_prompt)
                self.assertEqual([], response.sources)

    def test_example_only_context_can_help_first_turn(self):
        example = dict(text='회의록 예시', metadata={}, score=0.8)
        with patch.object(main.retriever, 'search', side_effect=[[], [example]]), patch.object(main, 'run_generation', return_value=GENERATION) as generate:
            response = main.query(self.request())
            generate.assert_called_once_with(PROMPT, [example], 'gemini-2.0-flash', [])
            self.assertEqual([], response.sources)
            self.assertEqual(IMPROVED, response.improved_prompt)

    def test_evidence_is_preserved(self):
        evidence = dict(text='구조화 출력 기법', metadata={'id': 1}, score=0.9)
        with patch.object(main.retriever, 'search', return_value=[evidence]), patch.object(main, 'run_generation', return_value=GENERATION):
            self.assertEqual([evidence], main.query(self.request(use_examples=False)).sources)

    def test_example_search_failure_still_generates(self):
        with patch.object(main.retriever, 'search', side_effect=[[], RuntimeError('example lookup failed')]), patch.object(main, 'run_generation', return_value=GENERATION):
            self.assertEqual(IMPROVED, main.query(self.request()).improved_prompt)

    def test_generation_failure_remains_503(self):
        with patch.object(main.retriever, 'search', return_value=[]), patch.object(main, 'run_generation', side_effect=RuntimeError('generation unavailable')):
            with self.assertRaises(HTTPException) as error: main.query(self.request())
            self.assertEqual(503, error.exception.status_code)

    def test_technique_search_failure_is_not_hidden(self):
        with patch.object(main.retriever, 'search', side_effect=RuntimeError('DB unavailable')), patch.object(main, 'run_generation') as generate:
            with self.assertRaises(RuntimeError): main.query(self.request())
            generate.assert_not_called()

if __name__ == '__main__': unittest.main()
