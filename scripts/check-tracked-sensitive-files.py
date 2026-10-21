"""Fail CI when credentials or private config artifacts are tracked by Git.

This is a filename policy, not a replacement for history/content secret scanning.
Only prints filenames, never file contents or secret values.
"""
from pathlib import PurePosixPath
import subprocess
import sys

PRIVATE_FILENAMES = {
    ".npmrc", ".pypirc", ".netrc", "id_rsa", "id_ed25519",
    "credentials.json", "service-account.json", "service_account.json",
    "kubeconfig", "known_hosts_private",
}
PRIVATE_SUFFIXES = (".pem", ".p12", ".pfx", ".jks", ".keystore")


def is_sensitive_path(path: str) -> bool:
    name = PurePosixPath(path.replace("\\", "/")).name.lower()
    if name.startswith(".env"):
        # Existing public templates and the URLs-only extension development config.
        # Everything else (.env, .env.local, .env.production, backups, etc.) is private.
        return not (name.endswith(".example") or name == ".env.development")
    if name in PRIVATE_FILENAMES or name.endswith(PRIVATE_SUFFIXES):
        return True
    if name.endswith(".key") and name != "public.key":
        return True
    return False


def find_sensitive_paths(paths: list[str]) -> list[str]:
    return sorted({path for path in paths if is_sensitive_path(path)})


def main() -> int:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        check=True,
        capture_output=True,
    )
    paths = [p.decode("utf-8", errors="replace") for p in result.stdout.split(b"\x00") if p]
    rejected = find_sensitive_paths(paths)
    if rejected:
        print("FAIL: sensitive configuration or credential filenames are tracked:")
        for path in rejected:
            print("  " + path)
        print("Remove them from Git tracking, rotate exposed credentials if needed, and review history.")
        return 1
    print("PASS: tracked filename security policy; no private configuration artifacts found.")
    print("NOTE: This does not scan file contents or Git history for leaked secrets.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
