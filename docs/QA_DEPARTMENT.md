# Segmentiva QA Department

This repository includes a project-level QA department implemented as Cursor subagents. The system separates implementation from verification, assigns each risk area to a specialist, and ends with an evidence-based release gate.

## Team

| Role | Cursor subagent | Responsibility | Finding prefix |
| --- | --- | --- | --- |
| QA Director | `qa-director` | Scope, delegation, deduplication, consolidated report | — |
| Product QA Analyst | `qa-product-requirements` | Functional scope and acceptance-criteria traceability | `REQ` |
| Shopify Platform QA | `qa-shopify-platform` | APIs, extensions, scopes, metafields, tags, segments, platform rules | `SHP` |
| Security & Privacy QA | `qa-security-privacy` | Auth, authorization, tenant isolation, PII, HMAC, compliance | `SEC` |
| Backend & Data QA | `qa-backend-data` | Domain logic, Prisma, migrations, idempotency, resilience | `DAT` |
| Frontend & Accessibility QA | `qa-frontend-accessibility` | UX states, keyboard access, i18n, consent and safe copy | `UI` |
| Test Automation | `qa-test-automation` | Executable checks, test quality and regression coverage | `TST` |
| Release Quality Manager | `qa-release-manager` | Independent final gate tied to an exact diff/SHA | `REL` |

All reviewers are configured with `readonly: true`. Their job is to find and prove defects, not to repair the same code they approve.

## How to use it in Cursor

Cursor loads project subagents from `.cursor/agents/`. Invoke a full departmental review from Agent chat:

```text
/qa-director Revisa todos los cambios actuales contra la fase 0 de SEGMENTIVA_MVP_BUILD_PLAN.md. Ejecuta el departamento completo, exige evidencia y emite el gate final. No modifiques archivos.
```

For a commit or branch, state the exact base and head:

```text
/qa-director Audita main...HEAD contra los criterios de la fase 2. Revisa el diff exacto, ejecuta checks aplicables y entrega un gate de release.
```

Invoke one specialist for an early review when useful:

```text
/qa-security-privacy Revisa las nuevas rutas de customer account y busca cruces entre shops o customers. No modifiques código.
```

The full gate should use `qa-director`. It launches the six domain specialists, consolidates their evidence, and then delegates the final decision to `qa-release-manager`.

## Review lifecycle

| Stage | Owner | Required output |
| --- | --- | --- |
| Intake | QA Director | Phase, base/head, changed files, affected requirements and risk map |
| Specialist review | Six domain reviewers | Independent verdict, evidence and structured findings |
| Consolidation | QA Director | Deduplicated findings and acceptance-criteria coverage |
| Release gate | Release Manager | `PASS`, `PASS_WITH_RISK`, or `FAIL` for the exact scope/SHA |
| Remediation | Implementation agent | Fixes in a new diff plus updated tests/evidence |
| Retest | Relevant specialists + Test Automation | Closed/reopened findings and regression results |
| Promotion | Human owner | Deployment or phase-completion decision |

## Review modes

### Early specialist review

Use during implementation for one high-risk area. It does not authorize release.

### Phase gate

Run at the end of every phase in `SEGMENTIVA_MVP_BUILD_PLAN.md`. All six specialists participate; an unaffected area may return `N/A` with evidence.

### Release gate

Run on a stable commit after all automated checks and required Shopify dev-store scenarios. The gate is invalidated by any later code or configuration change.

### Incident review

Start with `qa-security-privacy` for suspected exposure or tenant crossover, preserve evidence, and do not run destructive reproduction against real stores or customers.

## Severity and service expectations

| Severity | Meaning | Release treatment | Triage target |
| --- | --- | --- | --- |
| `P0` | Incident-level security, privacy, tenant isolation or data-loss risk | Immediate `FAIL`; stop promotion | Immediate |
| `P1` | Core flow, mandatory compliance, platform contract or migration failure | `FAIL` until fixed and retested | Same work session |
| `P2` | Significant bounded defect or risk | Fix, or explicitly accept with owner and due date | Before phase closes |
| `P3` | Minor usability, quality, observability or documentation issue | May enter backlog with owner | Normal backlog |

These are triage targets, not guarantees. Severity is based on impact and exploitability, not estimated effort.

## Evidence standard

A valid finding includes the fields defined in `AGENTS.md`. Acceptable evidence includes:

- a file and line showing the faulty branch or missing guard;
- a reproducible command and its exit status;
- a focused failing test;
- a deterministic request/response using synthetic data;
- an official Shopify source proving a platform mismatch;
- a dev-store scenario with sanitized screenshots or logs.

The following are not evidence:

- “looks good”;
- a claimed command without output/status;
- HTTP `200` without checking GraphQL `userErrors`;
- a snapshot updated to hide a behavior change;
- manual testing with a production customer;
- assumptions about Shopify APIs based only on memory.

## Minimum gates by phase

| Phase | Mandatory QA emphasis |
| --- | --- |
| 0 — Scaffold | Clean root, official template, pinned API, reproducible install, lint/typecheck/test baseline, no secrets |
| 1 — Tenant | Cross-shop negative tests, session persistence, install/uninstall, diagnostics and seed isolation |
| 2 — Questionnaire | Validation, immutable publish, stable keys, archive semantics, bilingual data structure |
| 3 — Customer account | Token verification, customer/shop binding, metafields, persistence, accessibility and error recovery |
| 4 — Activation | Owned-tag safety, idempotency, ShopifyQL segments, `userErrors`, throttling and partial failure |
| 5 — Hardening | Compliance webhooks, deletion, log redaction, dependency checks, CI, clean checkout and dev-store journey |

## Gate policy

`qa-release-manager` applies the policy in `AGENTS.md` and binds the decision to the exact reviewed base/head or SHA.

- `PASS` means required evidence exists and no blocking risk is open.
- `PASS_WITH_RISK` is not a casual approval. Every accepted `P2` needs a named owner, rationale, and due date or explicit follow-up milestone.
- `FAIL` requires remediation and retest. It cannot be overridden by changing wording in the report.

Human approval remains mandatory for production deployment, migrations affecting retained data, protected-customer-data requests, and App Store submission.

## Retest protocol

For each resolved finding:

1. Keep the original ID.
2. Record the fix commit.
3. Reproduce the original failure and show that it no longer occurs.
4. Run the stated regression test.
5. Run adjacent high-risk tests selected by `qa-test-automation`.
6. Mark `CLOSED`, `REOPENED`, or `RISK ACCEPTED` with evidence.
7. Ask `qa-release-manager` for a new gate on the new SHA.

Use `docs/QA_REVIEW_TEMPLATE.md` for saved reports and the pull-request template for every implementation PR.
