#!/usr/bin/env python3
"""Strict auth proxy checks against disposable Docker Compose (never production).

No accounts are created; every lookup uses nonexistent fixture identity data.
The host-supplied X-Real-IP intentionally simulates Railway's trusted public edge.
This does NOT establish whether actual Railway private ingress is isolated.
"""
import json
import subprocess
import time
import urllib.error
import urllib.request

URL = "http://127.0.0.1:18173"
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
COMPOSE = ["docker", "compose", "-p", "ttalkak-ci",
           "-f", "docker/compose.ci.yml", "-f", "docker/compose.auth-proxy-ci.yml"]
PAYLOAD = json.dumps({"method": "email", "name": "Nobody Fixture",
                      "email": "nobody@example.invalid"}).encode()


def send(ip, spoof_index, path="/api/auth/find-id"):
    headers = {
        "Content-Type": "application/json",
        "X-Real-IP": ip,  # Simulated verified Railway edge, NOT attacker-controlled in public ingress.
        "X-Forwarded-For": "203.0.113." + str(spoof_index % 200),
        "Forwarded": 'for="198.51.100.' + str(spoof_index % 200) + '";proto=http',
        "X-Forwarded-Prefix": "/attacker-" + str(spoof_index),
        "X-Ttalkak-Proxy-Secret": "forged-untrusted-client-header",
        "X-Ttalkak-Client-IP": "192.0.2.250",
    }
    request = urllib.request.Request(URL + path, data=PAYLOAD,
                                     method="POST", headers=headers)
    try:
        response = HTTP.open(request, timeout=15)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        body = response.read().decode("utf-8", "replace")
        return response.code, json.loads(body) if body.startswith("{") else body


def wait_ready():
    for _ in range(80):
        try:
            with HTTP.open(URL + "/api/tags/popular", timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.HTTPError):
            pass
        time.sleep(2)
    raise AssertionError("Disposable strict proxy stack did not become ready")


def direct_untrusted_cannot_bypass():
    js = """
const req = async () => {
  for (const path of ['/api/auth/find-id', '/api/auth/%66ind-id']) {
  const r = await fetch('http://backend:18080' + path, {
    method: 'POST', headers: {
      'Content-Type': 'application/json',
      'X-Real-IP': '198.51.100.99',
      'X-Forwarded-Prefix': '/attacker',
      'X-Forwarded-For': '203.0.113.44',
      'X-Ttalkak-Client-IP': '203.0.113.44',
      'X-Ttalkak-Proxy-Secret': 'invalid'
    }, body: JSON.stringify({method:'email',name:'Nobody Fixture',email:'nobody@example.invalid'})
  });
  const body = await r.json();
  if (r.status !== 503 || body.code !== 'AUTH_PROXY_REQUIRED') {
    throw new Error('direct authentication bypass ' + path + ': ' + r.status + ':' + JSON.stringify(body));
  }
  }
};
req().catch(err => { console.error(err.message); process.exit(1); });
"""
    subprocess.run(COMPOSE + ["exec", "-T", "rag-stub", "node", "-e", js], check=True)


def main():
    # Recreate only the disposable services, leaving the fixture MySQL and RAG stub intact.
    subprocess.run(COMPOSE + ["up", "-d", "--force-recreate", "--no-deps",
                              "backend", "web"], check=True)
    wait_ready()
    subprocess.run(COMPOSE + ["exec", "-T", "web", "nginx", "-t"], check=True)

    for i in range(10):
        route = "/api/auth/%66ind-id" if i % 2 else "/api/auth/find-id"
        code, body = send("198.51.100.21", i, route)
        assert code == 200, ("expected valid authenticated proxy route", i, code, body)
    code, body = send("198.51.100.21", 99, "/api/auth/%66ind-id")
    assert code == 429 and body["code"] == "AUTH_RATE_LIMITED", (
        "forwarded headers or encoded routes must not reset verified client-IP quota", code, body)

    code, body = send("198.51.100.22", 99)
    assert code == 200, ("independent attested client must retain quota", code, body)
    # Mapped IPv6 emitted by a trusted edge is the same client as plain IPv4.
    # Alternate dotted and hexadecimal tails to verify canonical quota identity.
    mapped = ("198.51.100.23", "::ffff:198.51.100.23", "::FFFF:C633:6417")
    for i in range(10):
        code, body = send(mapped[i % len(mapped)], i)
        assert code == 200, ("valid mapped IPv6 must not be rejected", i, code, body)
    code, body = send(mapped[1], 99)
    assert code == 429 and body["code"] == "AUTH_RATE_LIMITED", (
        "mapped IPv6 must share the plain IPv4 allowance", code, body)
    # Persisted quota must survive an actual backend process restart, not merely
    # construction of another Java limiter object in the same process.
    for i in range(10):
        code, body = send("198.51.100.24", i)
        assert code == 200, ("restart fixture must initially have quota", i, code, body)
    restart_started = time.monotonic()
    subprocess.run(COMPOSE + ["restart", "backend"], check=True)
    wait_ready()
    assert time.monotonic() - restart_started < 55, "restart exceeded the useful 60s quota observation window"
    code, body = send("198.51.100.24", 99)
    assert code == 429 and body["code"] == "AUTH_RATE_LIMITED", (
        "backend process restart must not replenish persisted client quota", code, body)
    direct_untrusted_cannot_bypass()
    print("PASS: real nginx/Spring strict proxy attestation, per-client quotas, "
          "forged XFF ignored, encoded routes normalized, quota survives backend restart, direct backend denied (disposable only)")


if __name__ == "__main__":
    main()
