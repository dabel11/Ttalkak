"""Regression tests for the tracked-secret filename policy."""
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).with_name("check-tracked-sensitive-files.py")
spec = importlib.util.spec_from_file_location("tracked_sensitive", path)
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class TrackedSecretPolicyTest(unittest.TestCase):
    def test_denies_private_environment_files(self):
        examples = [
            ".env", "backend/.env", "rag-server/.env.local",
            "extension/.env.production", "backend/.env.bak2026",
            "nested/.env.staging", "web/.env.production.local",
        ]
        self.assertEqual(policy.find_sensitive_paths(examples), sorted(examples))

    def test_allows_existing_public_templates(self):
        examples = [
            "backend/.env.example", ".env.merchant-review.example",
            "extension/.env.production.example", "extension/.env.development",
            "backend/src/main/resources/application.yml",
        ]
        self.assertEqual([], policy.find_sensitive_paths(examples))

    def test_denies_key_material_and_credentials(self):
        examples = [
            "secrets/key.pem", "certs/client.p12", "certs/store.jks",
            ".npmrc", "secrets/id_ed25519", "auth/credentials.json",
            "app/secret.key",
        ]
        self.assertEqual(policy.find_sensitive_paths(examples), sorted(examples))

    def test_does_not_leak_values_or_flag_regular_source_files(self):
        examples = [
            "backend/src/main/java/com/ttalkak/auth/JwtTokenService.java",
            "rag-server/tests/test_token_budget.py",
            "prompt-hub-web-frontend/src/styles/tokens.css",
            "docs/README.md",
        ]
        self.assertEqual([], policy.find_sensitive_paths(examples))


if __name__ == "__main__":
    unittest.main()
