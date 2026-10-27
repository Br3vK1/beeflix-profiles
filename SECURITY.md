# Security notes

- Profile API routes require Jellyfin authentication.
- The current prototype returns only reviews authored by the requested profile member.
- Hidden/disabled author filtering is intentionally conservative and fails closed if the Enhanced configuration cannot be evaluated.
- This is **not production-ready** until visibility behavior is validated against the exact installed Jellyfin Enhanced version, including hidden/disabled users, orphaned accounts, private reviews, and admin/self-view behavior.
- Keep the repository private if you do not want the source publicly visible.
- Do not expose the endpoint unauthenticated or install it on the live BeeFlix server before test-instance validation.
