## What changed

- MVP phase: `<0-5>`
- Problem/outcome:
- Explicitly out of scope:
- Related issue/spec:

## Acceptance criteria

- [ ] Each affected criterion in `SEGMENTIVA_MVP_BUILD_PLAN.md` is listed below.
- [ ] Evidence is attached for every criterion claimed complete.

| Criterion | Evidence |
| --- | --- |
| `<criterion>` | `<test, file, or sanitized manual result>` |

## Validation

| Command/check | Result |
| --- | --- |
| Install | `PASS / FAIL / NOT RUN / N/A` |
| Lint | `PASS / FAIL / NOT RUN / N/A` |
| Typecheck | `PASS / FAIL / NOT RUN / N/A` |
| Unit tests | `PASS / FAIL / NOT RUN / N/A` |
| Integration tests | `PASS / FAIL / NOT RUN / N/A` |
| Build | `PASS / FAIL / NOT RUN / N/A` |
| Migration validation | `PASS / FAIL / NOT RUN / N/A` |
| Shopify dev-store scenarios | `PASS / FAIL / NOT RUN / N/A` |

Commands and relevant output:

```text
<commands, exit status, and concise output>
```

## Risk checks

- [ ] Shop scoping and cross-tenant negative cases were reviewed.
- [ ] No secret, token, customer PII, raw webhook body, or raw GraphQL payload was added to code, fixtures, logs, screenshots, or docs.
- [ ] Shopify API version, targets, scopes, `userErrors`, and throttling behavior were checked where applicable.
- [ ] Only exact `segmentiva:` tags can be reconciled or removed.
- [ ] Accessibility, English/Spanish copy, loading/error/empty states, and double-submit behavior were checked where applicable.
- [ ] Data migration and rollback/roll-forward implications are documented where applicable.
- [ ] No post-MVP or later-phase scope was introduced.

## QA department

Run in Cursor before requesting approval:

```text
/qa-director Review this PR against its declared MVP phase and current base...HEAD. Run the full QA department, do not modify files, and issue the final release gate.
```

- QA report link/path:
- Reviewed base/head or SHA:
- Final gate: `PASS / PASS_WITH_RISK / FAIL / NOT RUN`
- Open `P0/P1` findings:
- Accepted `P2` risks, owner and due date:
- Manual Shopify validation still pending:

## Screenshots or recordings

Add sanitized evidence for UI changes. Do not include real customer data, store secrets, tokens, or production identifiers.

## Rollback / recovery

- Rollback or roll-forward plan:
- Data implications:
- Feature/config disable path:
