"""Read-only deployment checks. Never create accounts, charge cards, or print credentials."""
import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # A token must never be forwarded to another origin, including an accidental redirect.
        return None


def check_origin(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ValueError("Use an origin only, without credentials, paths, query, or fragment")
    if not parsed.hostname or parsed.scheme not in ("http", "https"):
        raise ValueError("Use an HTTP(S) origin")
    if parsed.scheme != "https" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise ValueError("Remote checks require HTTPS")
    return value.rstrip("/")


def security_checks(opener, origin):
    """Read-only anonymous authorization and rejected-origin checks (opt-in)."""
    failed = False
    protected_paths = (
        '/api/me/usage',
        '/api/me/billing',
        '/api/admin/billing/refunds',
        '/api/make/threads',
        '/api/make/folders',
        '/api/prompts/my',
    )
    for path in protected_paths:
        request = urllib.request.Request(origin + path, headers={'Accept': 'application/json'})
        try:
            with opener.open(request, timeout=15) as response:
                status = response.status
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
        except (OSError, ValueError):
            status = None
        passed = status == 401
        if not passed:
            failed = True
        print(json.dumps({'path': path, 'check': 'anonymous_access_denied',
                          'result': 'PASS' if passed else 'FAIL',
                          'httpStatus': status}))

    # Exercise both ordinary sites and unrecognized Chrome extensions.
    # Neither request contains credentials, user content, or write methods.
    untrusted_origins = (
        'https://untrusted-origin.example.invalid',
        'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    )
    for untrusted_origin in untrusted_origins:
        preflight = urllib.request.Request(
            origin + '/api/prompts/improve',
            method='OPTIONS',
            headers={'Origin': untrusted_origin, 'Access-Control-Request-Method': 'POST'},
        )
        try:
            with opener.open(preflight, timeout=15) as response:
                status = response.status
                allowed_origin = response.headers.get('Access-Control-Allow-Origin')
        except urllib.error.HTTPError as error:
            status = error.code
            allowed_origin = error.headers.get('Access-Control-Allow-Origin') if error.headers else None
            error.close()
        except (OSError, ValueError):
            status, allowed_origin = None, None
        passed = status is not None and status < 500 and allowed_origin not in (
            '*', untrusted_origin,
        )
        if not passed:
            failed = True
        print(json.dumps({'path': '/api/prompts/improve',
                          'check': 'untrusted_cors_origin_rejected',
                          'originType': 'chrome_extension' if untrusted_origin.startswith('chrome-extension:') else 'web',
                          'result': 'PASS' if passed else 'FAIL', 'httpStatus': status}))
    return not failed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="https://web-production-a82d94.up.railway.app")
    parser.add_argument("--authenticated", action="store_true", help="Explicitly send TTALKAK_CHECK_TOKEN to this origin")
    parser.add_argument("--security", action="store_true", help="Read-only anonymous authorization and CORS checks")
    args = parser.parse_args()
    try:
        origin = check_origin(args.origin)
    except ValueError as error:
        parser.error(str(error))
    token = os.environ.get("TTALKAK_CHECK_TOKEN", "") if args.authenticated else ""
    if args.authenticated and not token:
        parser.error("--authenticated requires TTALKAK_CHECK_TOKEN")
    opener = urllib.request.build_opener(NoRedirect())
    failed = False
    checks = [('/healthz', False), ('/api/tags/popular', False), ('/api/auth/config', False)]
    if token:
        checks.extend([('/api/auth/me', True), ('/api/me/usage', True), ('/api/me/billing', True)])
    for path, authenticated in checks:
        headers = {"Accept": "application/json", "Origin": origin}
        if authenticated:
            headers["Authorization"] = "Bearer " + token
        try:
            with opener.open(urllib.request.Request(origin + path, headers=headers), timeout=15) as response:
                body = response.read(1_048_577)
                status = response.status
            if len(body) > 1_048_576:
                raise ValueError("oversized response")
            data = json.loads(body) if path != '/healthz' else None
            if path == '/healthz' and body.strip() != b'ok':
                raise ValueError("invalid health response")
            if path == '/api/auth/config':
                if not isinstance(data.get('googleLoginEnabled'), bool) or not isinstance(data.get('passwordResetEnabled'), bool):
                    raise ValueError("invalid auth config")
                print(json.dumps({"path": path, "status": status,
                                  "googleLoginEnabled": data['googleLoginEnabled'],
                                  "passwordResetEnabled": data['passwordResetEnabled']}))
            elif path == '/api/me/usage':
                fields = ('plan', 'periodStart', 'periodEnd', 'totalTokens', 'limit', 'remaining',
                          'limitReached', 'quotaEnforced', 'usageAvailable', 'usageBlocked')
                missing = [key for key in fields if key not in data]
                if missing:
                    raise ValueError("quota API deployment is incomplete")
                print(json.dumps({"path": path, "status": status, **{key: data[key] for key in fields}}))
            elif path == '/api/me/billing':
                if data.get('paymentStatus') not in ('NOT_REGISTERED', 'PENDING', 'ACTIVE', 'FAILED', 'EXPIRED'):
                    raise ValueError("invalid billing state")
                print(json.dumps({"path": path, "status": status, "paymentStatus": data['paymentStatus']}))
            else:
                print(json.dumps({"path": path, "status": status}))
        except (OSError, ValueError) as error:
            failed = True
            # No response body, token, account identity, or provider error is emitted.
            print(json.dumps({"path": path, "status": "FAIL", "errorType": type(error).__name__}))
    if args.security and not security_checks(opener, origin):
        failed = True
    if not token:
        print("SKIP: authenticated checks; set TTALKAK_CHECK_TOKEN and explicitly pass --authenticated")
    print("Read-only checks do not prove RAG generation, email delivery, Google sign-in, or payment approval.")
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
