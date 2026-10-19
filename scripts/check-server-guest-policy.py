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


def request(path, payload=None, session=None, extra_headers=None, method=None):
    # Browser fetch sends Origin even though web and API share the public origin.
    headers = {"Content-Type": "application/json", "Origin": BASE}
    if session:
        headers["X-Session-UUID"] = session
    headers.update(extra_headers or {})
    data = None if payload is None else json.dumps(payload).encode()
    try:
        response = HTTP.open(urllib.request.Request(BASE + path, data=data, headers=headers, method=method), timeout=10)
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
    policy_status, policy_headers, policy_body = request_headers("/refund-policy.html")
    assert policy_status == 200
    assert "text/html" in policy_headers.get("content-type", "")
    assert "구독 해지·환불 정책" in policy_body.decode()
    for page, title in [("/service.html", "AI 프롬프트 개선 웹서비스"), ("/terms.html", "이용약관")]:
        public_status, public_headers, public_body = request_headers(page)
        assert public_status == 200, (page, public_status)
        assert "text/html" in public_headers.get("content-type", "")
        assert title in public_body.decode()
        assert 'aria-label="사업자 정보"' in public_body.decode()
    assert 'aria-label="사업자 정보"' in index_html
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
    # Validate community post persistence, save idempotency and ownership
    # only inside the disposable ttalkak-ci database (never staging/production).
    post_title = "CI-persistence-" + suffix
    status, post = request("/api/prompts", {
        "title": post_title, "text": "CI fixture: no real user content", "tags": ["ci"],
    }, extra_headers=headers(token))
    assert status == 200 and post["title"] == post_title, ("community create", status)
    post_id = post["id"]
    status, detail = request("/api/prompts/" + str(post_id), extra_headers=headers(token))
    assert status == 200 and detail["isMine"] is True, ("community detail", status)
    assert detail["text"] == "CI fixture: no real user content"
    status, saved = request("/api/prompts/" + str(post_id) + "/save",
                            {}, extra_headers=headers(token))
    assert status == 200 and saved["isSaved"] is True
    status, saved_again = request("/api/prompts/" + str(post_id) + "/save",
                                  {}, extra_headers=headers(token))
    assert status == 200 and saved_again["saves"] == saved["saves"], "Save must be idempotent"
    status, mine = request("/api/prompts/my?filter=mine", extra_headers=headers(token))
    assert status == 200 and any(item["id"] == post_id for item in mine["items"])
    status, detail = request("/api/prompts/" + str(post_id), extra_headers=headers(token))
    assert status == 200 and detail["isSaved"] is True
    print("PASS: community create, detail, saved lookup, idempotent save")

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
    # Security regression: another account may view a shared prompt but cannot
    # modify, delete, or change its visibility in the disposable CI database.
    foreign_headers = headers(unknown_token)
    status, rejection = request("/api/prompts/" + str(post_id), {
        "title": "attempted overwrite", "text": "unauthorized fixture", "tags": ["ci"],
    }, extra_headers=foreign_headers, method="PATCH")
    assert status == 403 and rejection["code"] == "OWNER_ONLY", ("foreign edit", status)
    status, rejection = request("/api/prompts/" + str(post_id),
                                extra_headers=foreign_headers, method="DELETE")
    assert status == 403 and rejection["code"] == "OWNER_ONLY", ("foreign delete", status)
    status, rejection = request("/api/prompts/" + str(post_id) + "/visibility", {
        "isShared": False,
    }, extra_headers=foreign_headers, method="PATCH")
    assert status == 403 and rejection["code"] == "OWNER_ONLY", ("foreign visibility", status)
    status, unchanged = request("/api/prompts/" + str(post_id), extra_headers=headers(token))
    assert status == 200 and unchanged["title"] == post_title
    assert unchanged["isShared"] is True
    print("PASS: shared prompt cannot be edited, deleted, or hidden by another account")

    # A previous public comment also creates a member-history reference.
    status, foreign_comment = request("/api/prompts/" + str(post_id) + "/comments",
                                      {"text": "CI foreign comment"}, extra_headers=foreign_headers)
    assert status == 200, ("foreign comment create", status)
    status, before_comment_history = request("/api/me/comments", extra_headers=foreign_headers)
    assert status == 200 and any(item["promptId"] == post_id
                                 and item["prompt"]["text"] == "CI fixture: no real user content"
                                 for item in before_comment_history["items"])

    # A previously public prompt can be saved/liked by another member.
    # After the author makes it private, it must disappear from that member's
    # saved, liked and aggregate lists as well as from the direct detail API.
    status, foreign_saved = request("/api/prompts/" + str(post_id) + "/save",
                                    {}, extra_headers=foreign_headers)
    assert status == 200 and foreign_saved["isSaved"] is True
    status, foreign_liked = request("/api/prompts/" + str(post_id) + "/like",
                                    {}, extra_headers=foreign_headers)
    assert status == 200 and foreign_liked["isLiked"] is True
    for selected_filter in ("all", "community", "liked"):
        status, visible_before = request("/api/prompts/my?filter=" + selected_filter,
                                          extra_headers=foreign_headers)
        assert status == 200 and any(item["id"] == post_id for item in visible_before["items"])

    for selected_filter in ("all", "community", "liked"):
        status, visible_library = request("/api/me/library?filter=" + selected_filter,
                                           extra_headers=foreign_headers)
        assert status == 200 and any(item["id"] == post_id for item in visible_library["items"]), (
            "Public saved/liked prompt not in legacy library", selected_filter
        )

    # A different member cannot read a post that the author made private.
    owner_token = login(changed)[1]["accessToken"]
    status, visibility = request("/api/prompts/" + str(post_id) + "/visibility",
                                 {"isShared": False}, extra_headers=headers(owner_token), method="PATCH")
    assert status == 200 and visibility["isShared"] is False, ("visibility", status)
    assert request("/api/prompts/" + str(post_id))[0] == 404, "Private prompt leaked publicly"
    assert request("/api/prompts/" + str(post_id),
                   extra_headers=headers(unknown_token))[0] == 404, "Private prompt leaked to another member"
    status, owner_detail = request("/api/prompts/" + str(post_id), extra_headers=headers(owner_token))
    assert status == 200 and owner_detail["isMine"] is True
    for selected_filter in ("all", "community", "liked"):
        status, hidden_after = request("/api/prompts/my?filter=" + selected_filter,
                                       extra_headers=foreign_headers)
        assert status == 200 and all(item["id"] != post_id for item in hidden_after["items"]), (
            "Private saved/liked prompt leaked through /my", selected_filter
        )
    status, owner_list = request("/api/prompts/my?filter=mine",
                                 extra_headers=headers(owner_token))
    assert status == 200 and any(item["id"] == post_id for item in owner_list["items"])
    for selected_filter in ("all", "community", "liked"):
        status, private_library = request("/api/me/library?filter=" + selected_filter,
                                           extra_headers=foreign_headers)
        assert status == 200 and all(item["id"] != post_id for item in private_library["items"]), (
            "Private prompt leaked in legacy library", selected_filter
        )
    status, foreign_comments = request("/api/me/comments", extra_headers=foreign_headers)
    assert status == 200
    foreign_history = [item for item in foreign_comments["items"] if item["promptId"] == post_id]
    assert foreign_history and all(item["prompt"] is None
                                   and item["promptTitle"] is None
                                   for item in foreign_history), "Private prompt leaked through comment history"
    status, owner_library = request("/api/me/library?filter=mine",
                                     extra_headers=headers(owner_token))
    assert status == 200 and any(item["id"] == post_id for item in owner_library["items"])
    print("PASS: legacy library and comments redact private post content")

    print("PASS: private prompt disappears from other members' saved/liked lists")

    print("PASS: private prompt is hidden from anonymous and other members")

    # Verify private Make conversation and folder ownership with two existing
    # disposable CI members; no real user account or production DB is touched.
    status, owner_folder = request("/api/make/folders",
                                   {"name": "CI-private-folder-" + suffix},
                                   extra_headers=headers(owner_token))
    assert status == 200, ("owner folder create", status, owner_folder)
    folder_id = owner_folder["id"]
    private_message = "CI confidential fixture " + suffix
    status, owner_thread = request("/api/make/threads", {
        "title": "CI private conversation",
        "messages": [{"role": "user", "content": private_message}],
        "folderId": folder_id,
    }, extra_headers=headers(owner_token))
    assert status == 200, ("owner thread create", status, owner_thread)
    thread_id = owner_thread["id"]
    assert owner_thread["folderId"] == folder_id
    status, owned_detail = request("/api/make/threads/" + str(thread_id),
                                   extra_headers=headers(owner_token))
    assert status == 200 and owned_detail["messages"][0]["content"] == private_message

    status, stranger_threads = request("/api/make/threads", extra_headers=foreign_headers)
    assert status == 200 and all(item["id"] != thread_id for item in stranger_threads["items"])
    status, stranger_folders = request("/api/make/folders", extra_headers=foreign_headers)
    assert status == 200 and all(item["id"] != folder_id for item in stranger_folders["items"])
    assert request("/api/make/threads/" + str(thread_id),
                   extra_headers=foreign_headers)[0] == 404, "Cross-member thread read"
    assert request("/api/make/threads/" + str(thread_id),
                   {"title": "foreign overwrite"}, extra_headers=foreign_headers,
                   method="PATCH")[0] == 404, "Cross-member thread update"
    assert request("/api/make/threads/" + str(thread_id),
                   extra_headers=foreign_headers, method="DELETE")[0] == 404, "Cross-member thread delete"
    assert request("/api/make/threads/" + str(thread_id) + "/folder",
                   {"folderId": None}, extra_headers=foreign_headers,
                   method="PATCH")[0] == 404, "Cross-member thread move"
    assert request("/api/make/folders/" + str(folder_id),
                   {"name": "foreign rename"}, extra_headers=foreign_headers,
                   method="PATCH")[0] == 404, "Cross-member folder update"
    assert request("/api/make/folders/" + str(folder_id),
                   extra_headers=foreign_headers, method="DELETE")[0] == 404, "Cross-member folder delete"
    # Even the legitimate owner cannot assign another member's folder to a thread.
    status, other_folder = request("/api/make/folders",
                                   {"name": "CI-stranger-folder-" + suffix},
                                   extra_headers=foreign_headers)
    assert status == 200
    assert request("/api/make/threads/" + str(thread_id) + "/folder",
                   {"folderId": other_folder["id"]}, extra_headers=headers(owner_token),
                   method="PATCH")[0] == 400, "Cross-member folder assignment"
    status, still_owned = request("/api/make/threads/" + str(thread_id),
                                  extra_headers=headers(owner_token))
    assert status == 200 and still_owned["folderId"] == folder_id
    assert still_owned["messages"][0]["content"] == private_message
    print("PASS: Make thread and folder ownership across read/list/write/delete/move")


    print("PASS: member metering, replay, quota, restart persistence, missing accounting, individual/all logout, password change")


if __name__ == "__main__":
    main()
