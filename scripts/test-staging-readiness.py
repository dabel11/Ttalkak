import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('readiness', Path(__file__).with_name('check-staging-readiness.py'))
readiness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(readiness)


class Response:
    status = 200
    def __init__(self, value):
        self.value = value
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self, size): return self.value


class Checks(unittest.TestCase):
    def test_origin_rejects_credentials_paths_and_cleartext_remote(self):
        for value in ('https://u:p@example.com', 'https://example.com/path', 'http://example.com',
                      'https://example.com?token=x', 'file:///tmp/x'):
            with self.assertRaises(ValueError): readiness.check_origin(value)
        self.assertEqual('https://example.com', readiness.check_origin('https://example.com/'))
        self.assertEqual('http://127.0.0.1:8080', readiness.check_origin('http://127.0.0.1:8080'))

    def test_token_is_not_sent_without_explicit_authentication(self):
        requests = []
        class Opener:
            def open(self, request, timeout):
                requests.append(request)
                value = b'ok\n' if request.full_url.endswith('/healthz') else json.dumps({
                    'googleLoginEnabled': False, 'passwordResetEnabled': False}).encode()
                return Response(value)
        with patch.object(sys, 'argv', ['check']), patch.dict(os.environ, {'TTALKAK_CHECK_TOKEN': 'fixture-secret'}), \
                patch.object(readiness.urllib.request, 'build_opener', return_value=Opener()), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(0, readiness.main())
        self.assertEqual(3, len(requests))
        self.assertTrue(all(not request.has_header('Authorization') for request in requests))
        self.assertNotIn('fixture-secret', output.getvalue())

    def test_failure_does_not_print_provider_body_or_exception_secret(self):
        class Opener:
            def open(self, request, timeout):
                raise OSError('private-token-and-provider-body')
        with patch.object(sys, 'argv', ['check']), \
                patch.object(readiness.urllib.request, 'build_opener', return_value=Opener()), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(1, readiness.main())
        self.assertNotIn('private-token', output.getvalue())

    def test_redirects_never_forward_tokens(self):
        self.assertIsNone(readiness.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.test'))


if __name__ == '__main__':
    unittest.main()
