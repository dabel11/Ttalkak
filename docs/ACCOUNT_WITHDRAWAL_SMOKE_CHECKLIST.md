# Account Withdrawal Integration Smoke Checklist

Use this checklist only with a disposable test account in a local or explicitly approved test environment. Account withdrawal is destructive. Never run it against a real user or production data.

Do not place passwords, access tokens, database credentials, personal information, or raw API payloads in this document, screenshots, commit messages, or CI logs. Record only pass/fail evidence and non-sensitive identifiers such as a test run date.

## Preconditions

- The web or Extension client, Spring Boot backend, and test database are running.
- The environment contains no important user data and is approved for destructive testing.
- A unique disposable user ID and nickname are generated for this run.
- Browser developer tools are configured not to persist or export sensitive request headers.

## Test flow

1. Sign up with the disposable ID and nickname, then sign in successfully.
2. Create representative account-scoped frontend state, such as a saved prompt or authenticated draft.
3. Create a local-only Make conversation so its post-withdrawal behavior can be distinguished from account-scoped data.
4. Complete account withdrawal through the supported UI.
5. Confirm the client clears the access token, authenticated user, sensitive authentication drafts, and account-scoped caches.
6. Confirm the client returns to a signed-out state and protected actions require authentication.
7. Attempt to sign in again with the withdrawn account and confirm it is rejected.
8. Run the ID availability check and confirm the withdrawn ID cannot be reused.
9. Run the nickname availability check and confirm the released nickname can be reused.
10. Create a second disposable account with that nickname to verify the full signup boundary, then withdraw it during cleanup.
11. Confirm historical content renders the author as `탈퇴한 사용자` and does not expose an internal anonymized nickname.
12. Confirm administrator views hide actions that cannot be performed on a withdrawn member.
13. Confirm account-scoped client data is gone while local-only Make conversations remain on the device according to the current frontend policy.

## Expected backend state

Inspect only the disposable test record and avoid copying raw database rows into logs.

- The member is inactive and has a withdrawal timestamp.
- The original ID remains reserved.
- The nickname is replaced internally so the original nickname can be reused.
- Email and phone fields are cleared.
- The display boundary presents the member as `탈퇴한 사용자` without exposing the internal anonymized value.

## Result record

Copy the result template below into a dated file under `smoke-results/`. Do not overwrite this reusable checklist with a specific run.

- Environment:
- Date:
- Web result:
- Extension result:
- Backend policy result:
- Cleanup complete:
- Non-sensitive notes:

If any step fails, stop before using another account. File the failure with the affected step, HTTP status and public error code only; exclude credentials and request bodies.
