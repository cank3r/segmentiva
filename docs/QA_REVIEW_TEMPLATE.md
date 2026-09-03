# QA review — `<phase or change>`

## Review identity

| Field | Value |
| --- | --- |
| Date | `<YYYY-MM-DD>` |
| Reviewer/orchestrator | `<agent or person>` |
| MVP phase | `<0-5 or N/A>` |
| Base | `<branch/SHA>` |
| Head | `<branch/SHA>` |
| Diff | `<command or PR URL>` |
| Gate requested | `<phase / release / specialist>` |

## Scope

- Changed files:
- Requirements affected:
- Explicit exclusions:
- Risk areas:

## Executive summary

1. `<result>`
2. `<result>`
3. `<result>`

## Validation commands

| Command | Status | Exit code | Evidence/notes |
| --- | --- | ---: | --- |
| `<command>` | `PASS / FAIL / NOT RUN / N/A` | `<code>` | `<summary>` |

## Acceptance-criteria coverage

| Requirement | Status | Evidence | Gap/owner |
| --- | --- | --- | --- |
| `<criterion>` | `COVERED / PARTIAL / MISSING / N/A` | `<test, file, or manual result>` | `<gap>` |

## Specialist results

| Area | Verdict | Findings | Notes |
| --- | --- | ---: | --- |
| Product requirements | `<verdict>` | `<count>` | `<notes>` |
| Shopify platform | `<verdict>` | `<count>` | `<notes>` |
| Security and privacy | `<verdict>` | `<count>` | `<notes>` |
| Backend and data | `<verdict>` | `<count>` | `<notes>` |
| Frontend and accessibility | `<verdict>` | `<count>` | `<notes>` |
| Test automation | `<verdict>` | `<count>` | `<notes>` |

## Findings

### `<ID>` — `<short title>`

- Severity: `<P0/P1/P2/P3>`
- Location: `<path:line, route, object, or config key>`
- Evidence: `<observed fact>`
- Impact: `<concrete consequence>`
- Reproduction: `<minimal steps>`
- Recommendation: `<smallest safe corrective direction>`
- Regression test: `<test/check>`
- Confidence: `<high/medium/low and uncertainty>`
- Status: `<OPEN/CLOSED/REOPENED/RISK ACCEPTED>`
- Owner: `<required for accepted risk>`
- Due date/follow-up: `<required for accepted P2>`

## Manual Shopify validation

| Scenario | Environment | Status | Sanitized evidence |
| --- | --- | --- | --- |
| `<scenario>` | `<development store>` | `PASS / FAIL / NOT RUN / N/A` | `<evidence>` |

Never include credentials, customer PII, access tokens, raw webhook bodies, or raw GraphQL payloads.

## Accepted risks

| Finding | Rationale | Owner | Due date/follow-up |
| --- | --- | --- | --- |
| `<P2 ID>` | `<why>` | `<person>` | `<date or milestone>` |

## Final gate

`GATE: PASS | PASS_WITH_RISK | FAIL`

- Approved scope/SHA:
- Blocking conditions:
- Rollback/recovery note:
- Conditions for retest:
- Human approvals still required:
