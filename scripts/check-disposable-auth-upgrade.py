#!/usr/bin/env python3
"""Upgrade from the observed live commit in disposable CI, never production."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

BASE_SHA = "95c1f1cb79ac1fbc817f43e5a6183df8dbf54a01"
ROOT = Path(__file__).resolve().parent.parent
COMPOSE = ["docker", "compose", "-p", "ttalkak-auth-upgrade-ci", "-f", str(ROOT / "docker/compose.auth-upgrade-ci.yml")]
WEB = "http://127.0.0.1:18174"
DIRECT = "http://127.0.0.1:18175"
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def run(command, **kwargs):
    return subprocess.run(command, check=True, cwd=ROOT, **kwargs)


def request(path, data=None, token=None, base=WEB):
    headers = {"Origin": WEB, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(base + path, headers=headers,
                                 data=None if data is None else json.dumps(data).encode())
    try:
        response = HTTP.open(req, timeout=10)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        raw = response.read().decode()
        return response.code, json.loads(raw) if raw.startswith(("{", "[")) else raw


def ready():
    for _ in range(100):
        try:
            status, body = request("/api/tags/popular")
            if status == 200 and isinstance(body, list) and body:
                return
        except (OSError, ValueError):
            pass
        time.sleep(2)
    raise AssertionError("Disposable upgrade backend did not become ready")


def mysql(sql):
    command = COMPOSE + ["exec", "-T", "mysql", "sh", "-c",
                        'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B ttalkak_upgrade -e "$1"', "probe", sql]
    return run(command, capture_output=True, text=True).stdout


def tables():
    names = mysql("SHOW TABLES").split()
    assert names and all(re.fullmatch(r"[a-z][a-z0-9_]*", name) for name in names)
    return sorted(names)


def digest(names):
    # Only a digest is printed/retained; synthetic account rows never enter logs.
    command = COMPOSE + ["exec", "-T", "mysql", "sh", "-c",
                        'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction '
                        '--no-create-info --skip-comments --skip-add-locks --skip-disable-keys '
                        '--skip-triggers --skip-extended-insert --complete-insert --order-by-primary '
                        '--hex-blob --set-gtid-purged=OFF ttalkak_upgrade "$@"', "snapshot"] + names
    return hashlib.sha256(run(command, capture_output=True).stdout).hexdigest()


def switch(image, strategy="framework"):
    env = dict(os.environ, AUTH_UPGRADE_BACKEND_IMAGE=image, AUTH_UPGRADE_FORWARD_STRATEGY=strategy,
               AUTH_UPGRADE_ADMIN_SEED_ENABLED="false", AUTH_UPGRADE_REVIEW_SEED_ENABLED="false")
    run(COMPOSE + ["up", "-d", "--force-recreate", "--no-deps", "backend"], env=env)
    ready()


def main():
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("TTALKAK_AUTH_UPGRADE_CI") != "1":
        raise SystemExit("Refusing upgrade rehearsal outside explicitly gated disposable CI")
    # Inherited production URLs cannot affect the literal compose fixture.
    for key in ("DB_URL", "DB_USERNAME", "DB_PASSWORD", "DATABASE_URL", "MYSQL_URL"):
        os.environ.pop(key, None)
    old = Path(tempfile.mkdtemp(prefix="ttalkak-auth-upgrade-")) / "old"
    try:
        run(["git", "worktree", "add", "--detach", str(old), BASE_SHA])
        run(["docker", "build", "-t", "ttalkak-auth-upgrade-old-backend", str(old / "backend")])
        run(["docker", "build", "-t", "ttalkak-auth-upgrade-old-web", "-f", str(old / "docker/web.Dockerfile"), str(old)])
        run(["docker", "build", "-t", "ttalkak-auth-upgrade-new-backend", str(ROOT / "backend")])
        run(COMPOSE + ["up", "-d"])
        ready()
        for _ in range(50):
            if mysql("SELECT COUNT(*) FROM members WHERE user_id IN ('ci_upgrade_admin','ttalkak_review')").strip() == "2":
                break
            time.sleep(0.2)
        else:
            raise AssertionError("baseline seeded fixture accounts did not become ready")
        user = "upg_" + uuid.uuid4().hex[:10]
        password = "CI-upgrade-123!"
        code, signup = request("/api/auth/signup", {"userId": user, "nickname": user,
            "name": "Upgrade fixture", "email": user + "@example.test", "password": password,
            "passwordConfirm": password, "agreeTerms": True, "agreePrivacy": True})
        assert code == 200, ("old signup", code)
        token = signup["accessToken"]
        protected_tokens = [token]
        for account, credential in [("ci_upgrade_admin", "CI-admin-upgrade-123!"),
                                    ("ttalkak_review", "CI-review-upgrade-456!")]:
            code, login = request("/api/auth/login", {"userId": account, "password": credential})
            assert code == 200, ("old seeded fixture login", account, code)
            protected_tokens.append(login["accessToken"])
        legacy = tables()
        assert "auth_rate_limit_state" not in legacy, "baseline unexpectedly already contains new schema"
        before = digest(legacy)
        switch("ttalkak-auth-upgrade-new-backend")
        startup = run(COMPOSE + ["logs", "--no-color", "backend"], capture_output=True, text=True).stdout
        assert "AUTH_RATE_LIMIT_STORE_READY schema=true expiry_index=true write_probe=rolled_back" in startup
        assert "AUTH_INGRESS_CONFIG strategy=FRAMEWORK strict=false proxy_attestation=false" in startup
        assert set(tables()) == set(legacy) | {"auth_rate_limit_state"}
        assert digest(legacy) == before, "upgrade changed legacy rows"
        for existing_token in protected_tokens:
            assert request("/api/auth/me", token=existing_token)[0] == 200, "existing token lost after upgrade"
        for base in (WEB, DIRECT):
            code, login = request("/api/auth/login", {"userId": user, "password": password}, base=base)
            assert code == 200 and login["user"]["userId"] == user, ("compatible login", base, code)
        assert request("/api/auth/id-recovery/request", {"name": "Nobody", "email": "nobody@example.invalid"})[0] == 503
        before_rollback = digest(legacy)
        switch("ttalkak-auth-upgrade-old-backend", "none")
        assert digest(legacy) == before_rollback, "rollback changed legacy rows"
        assert "auth_rate_limit_state" in tables(), "rollback must leave additive schema intact"
        for existing_token in protected_tokens:
            assert request("/api/auth/me", token=existing_token)[0] == 200
        assert request("/api/auth/login", {"userId": user, "password": password})[0] == 200
        print("PASS: observed live baseline -> candidate -> baseline; legacy row digests preserved; "
              "ordinary/admin/review accounts and old JWTs survive disabled seeders; old web/direct clients work; "
              "no mail; additive table retained")
    finally:
        subprocess.run(COMPOSE + ["down", "--volumes", "--remove-orphans"], cwd=ROOT, check=False)
        subprocess.run(["git", "worktree", "remove", "--force", str(old)], cwd=ROOT, check=False)


if __name__ == "__main__":
    main()
