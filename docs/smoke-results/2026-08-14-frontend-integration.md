# Frontend integration and accessibility smoke — 2026-08-14

Environment: local Docker Compose stack and disposable generated accounts. No credentials, tokens, prompt contents, or personal data were recorded.

## Backend integration

- PASS — administrator user search and activity summary
- PASS — block, immediate activity refresh, and unblock
- PASS — prompt and comment report submission
- PASS — My Page report listing
- PASS — My Page revision-request empty-list contract
- PASS — failed administrator mutation preserves the pre-request UI state (fixture E2E)

## Accessibility

- PASS — login modal receives focus and returns it to its opener when closed
- PASS — Make question required-field focus and answer submission
- PASS — request cancellation restores composer focus
- PASS — cancellation uses `role="status"`; actionable failures retain `role="alert"`
- PASS — confirmation modal focus and Escape restoration
- PASS — 200% zoom-equivalent viewport has no horizontal document overflow and keeps composer controls reachable
- PASS — keyboard-only activation opens/closes authentication, restores focus, enters Make, and edits the composer
- PASS — keyboard submission covers required ask answers and explicit request cancellation

NVDA listening remains a release-candidate human acceptance check because NVDA is not installed in this verification environment. Automated ARIA-role assertions protect its structural prerequisites but are not recorded as a substitute for listening with assistive technology.

Automated WCAG A/AA, Chromium fixture, Firefox smoke, and production E2E remain the repeatable regression gates for these checks.
