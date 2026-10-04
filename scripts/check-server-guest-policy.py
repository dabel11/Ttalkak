"""Check the real MySQL/Spring/nginx stack using a deterministic AI fixture."""
import json
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
    assert "window.TTALKAK_API_BASE_URL = window.location.origin" in request("/")[1]
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
    print("PASS: nondefault ports, HTTP/HTTPS origin, nginx, missing UUID, 3/4 limit, failure refund, restart persistence")


if __name__ == "__main__":
    main()
