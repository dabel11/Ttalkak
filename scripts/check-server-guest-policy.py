"""Check the real MySQL/Spring/nginx stack using a deterministic AI fixture."""
import json
import re
import subprocess
import time
import urllib.error
import urllib.request
import uuid

BASE = "http://127.0.0.1:18173"
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def request(path, payload=None, session=None, extra_headers=None):
    # Browser fetch sends Origin even though web and API share the public origin.
    headers = {"Content-Type": "application/json", "Origin": BASE}
    if session:
        headers["X-Session-UUID"] = session
    headers.update(extra_headers or {})
    data = None if payload is None else json.dumps(payload).encode()
    try:
        response = HTTP.open(urllib.request.Request(BASE + path, data=data, headers=headers), timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read().decode()
        return response.code, json.loads(body) if body.startswith(("{", "[")) else body


def request_headers(path, extra_headers=None):
    headers = {"Origin": BASE}
    headers.update(extra_headers or {})
    response = HTTP.open(urllib.request.Request(BASE + path, headers=headers), timeout=10)
    with response:
        return response.code, {key.lower(): value for key, value in response.headers.items()}, response.read()


def wait_ready():
    for _ in range(120):
        try:
            if request("/api/tags/popular")[0] == 200:
                return
        except (OSError, ValueError):
            pass
        time.sleep(2)
    raise AssertionError("nginx/Spring/MySQL did not become ready")


def improve(session, prompt="CI guest request"):
    return request("/api/prompts/improve", {"prompt": prompt, "history": []}, session)


def main():
    wait_ready()
    assert request("/healthz") == (200, "ok\n")
    index_status, index_headers, index_body = request_headers("/")
    index_html = index_body.decode()
    assert index_status == 200
    assert index_headers.get("cache-control") == "no-cache"
    assert "window.TTALKAK_API_BASE_URL = window.location.origin" in index_html
    app_match = re.search(r'src="\./(assets/app-[^"]+\.js)"', index_html)
    assert app_match, "Production HTML must reference a hashed application bundle"
    asset_status, asset_headers, _ = request_headers("/" + app_match.group(1), {"Accept-Encoding": "gzip"})
    assert asset_status == 200
    assert asset_headers.get("content-encoding") == "gzip"
    assert asset_headers.get("cache-control") == "public, max-age=31536000, immutable"
    css_status, css_headers, _ = request_headers("/assets/styles.css", {"Accept-Encoding": "gzip"})
    assert css_status == 200
    assert css_headers.get("content-encoding") == "gzip"
    assert css_headers.get("cache-control") == "no-cache"
    assert "immutable" not in css_headers.get("cache-control", "")
    font_status, font_headers, _ = request_headers("/assets/fonts/pretendard/PretendardVariable.subset.2.woff2")
    assert font_status == 200
    assert font_headers.get("cache-control") == "public, max-age=86400"
    assert "immutable" not in font_headers.get("cache-control", "")
    assert "content-encoding" not in font_headers, "WOFF2 should not be compressed a second time"
    api_status, api_headers, _ = request_headers("/api/tags/popular")
    assert api_status == 200
    assert "no-store" in api_headers.get("cache-control", "")
    status, body = request("/api/prompts/improve", {"prompt": "HTTPS proxy check", "history": []}, str(uuid.uuid4()), {
        "Host": "staging.example.test",
        "Origin": "https://staging.example.test",
        "X-Forwarded-Proto": "https",
    })
    assert status == 200, ("HTTPS forwarded origin rejected", status, body)
    status, body = improve(None)
    assert status == 400 and body["code"] == "SESSION_UUID_REQUIRED", (status, body)
    session = str(uuid.uuid4())
    for _ in range(3):
        assert improve(session)[0] == 200
    status, body = improve(session)
    assert status == 429 and body["code"] == "FREE_TRIAL_LIMIT_EXCEEDED", (status, body)
    failed_session = str(uuid.uuid4())
    assert improve(failed_session, "__CI_RAG_FAIL__")[0] >= 500
    for _ in range(3):
        assert improve(failed_session)[0] == 200
    assert improve(failed_session)[0] == 429
    subprocess.run(["docker", "compose", "-p", "ttalkak-ci", "-f", "docker/compose.ci.yml", "restart", "backend"], check=True)
    wait_ready()
    assert improve(session)[0] == 429, "Restart must preserve guest usage in MySQL"
    check_member_policy()
    print("PASS: nondefault ports, HTTP/HTTPS origin, nginx, missing UUID, 3/4 limit, failure refund, restart persistence")


def check_member_policy():
    suffix = uuid.uuid4().hex[:12]
    user = "ci_" + suffix
    password, changed = "CI-fixture-123!", "CI-changed-456!"
    status, body = request("/api/auth/signup", {
        "userId": user, "nickname": user, "name": "CI fixture",
        "email": user + "@example.test", "password": password,
        "passwordConfirm": password, "agreeTerms": True, "agreePrivacy": True,
    })
    assert status == 200, ("signup", status)
    first = body["accessToken"]
    def headers(token):
        return {"Authorization": "Bearer " + token}
    def login(pwd):
        return request("/api/auth/login", {"userId": user, "password": pwd})
    second = login(password)[1]["accessToken"]
    assert request("/api/auth/logout", {}, extra_headers=headers(first))[0] == 200
    assert request("/api/auth/me", extra_headers=headers(first))[0] == 401
    assert request("/api/auth/me", extra_headers=headers(second))[0] == 200
    assert request("/api/auth/password/change", {
        "currentPassword": password, "newPassword": changed, "passwordConfirm": changed,
    }, extra_headers=headers(second))[0] == 200
    assert request("/api/auth/me", extra_headers=headers(second))[0] == 401
    assert login(password)[0] == 401
    token = login(changed)[1]["accessToken"]
    initial = {"prompt": "CI member request", "requestId": str(uuid.uuid4())}
    status, result = request("/api/prompts/improve", initial, extra_headers=headers(token))
    assert status == 200 and result["replayed"] is False, ("member improve", status)
    assert request("/api/prompts/improve", initial, extra_headers=headers(token))[1]["replayed"] is True
    usage = request("/api/me/usage", extra_headers=headers(token))[1]
    assert usage["used"] == 15 and usage["remaining"] == 15 and usage["quotaEnforced"] is True
    followup = {"prompt": "CI followup", "threadId": result["threadId"], "requestId": str(uuid.uuid4())}
    assert request("/api/prompts/improve", followup, extra_headers=headers(token))[0] == 200
    status, failure = request("/api/prompts/improve", {
        "prompt": "CI blocked", "requestId": str(uuid.uuid4()),
    }, extra_headers=headers(token))
    assert status == 429 and failure["code"] == "MEMBER_TOKEN_LIMIT_EXCEEDED", (status, failure)
    # A stored replay is still available even after quota exhaustion.
    assert request("/api/prompts/improve", initial, extra_headers=headers(token))[1]["replayed"] is True
    subprocess.run(["docker", "compose", "-p", "ttalkak-ci", "-f", "docker/compose.ci.yml", "restart", "backend"], check=True)
    wait_ready()
    usage = request("/api/me/usage", extra_headers=headers(token))[1]
    assert usage["used"] == 30 and usage["limitReached"] is True
    other = login(changed)[1]["accessToken"]
    assert request("/api/auth/logout-all", {}, extra_headers=headers(other))[0] == 200
    assert request("/api/auth/me", extra_headers=headers(token))[0] == 401
    assert request("/api/auth/me", extra_headers=headers(other))[0] == 401
    unknown_user = "unknown_" + uuid.uuid4().hex[:12]
    status, account = request("/api/auth/signup", {
        "userId": unknown_user, "nickname": unknown_user, "name": "Unknown usage fixture",
        "email": unknown_user + "@example.test", "password": password,
        "passwordConfirm": password, "agreeTerms": True, "agreePrivacy": True,
    })
    assert status == 200, ("unknown signup", status)
    unknown_token = account["accessToken"]
    missing = {"prompt": "__CI_USAGE_MISSING__", "requestId": str(uuid.uuid4())}
    assert request("/api/prompts/improve", missing, extra_headers=headers(unknown_token))[0] == 200
    unknown_usage = request("/api/me/usage", extra_headers=headers(unknown_token))[1]
    assert unknown_usage["usageAvailable"] is False and unknown_usage["usageBlocked"] is True
    status, error = request("/api/prompts/improve", {
        "prompt": "CI should block missing accounting", "requestId": str(uuid.uuid4()),
    }, extra_headers=headers(unknown_token))
    assert status == 503 and error["code"] == "MEMBER_USAGE_UNAVAILABLE", (status, error)
    assert request("/api/prompts/improve", missing, extra_headers=headers(unknown_token))[1]["replayed"] is True
    print("PASS: member metering, replay, quota, restart persistence, missing accounting, individual/all logout, password change")


if __name__ == "__main__":
    main()
