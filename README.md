# Segmentiva

**Turn customer data into personalized shopping.**

Segmentiva is a Shopify-native customer preference and segmentation platform. It helps merchants ask shoppers what they care about, store those declared preferences safely in Shopify, and turn the answers into actionable customer tags and native Shopify segments.

> [!NOTE]
> Segmentiva is in **early development**. **Phase 0** (official Shopify app scaffold) is complete. **Phase 1** (tenant model, installation lifecycle, overview checklist, settings diagnostics, and explicit pilot seed) is in progress. Questionnaire builder, customer account extensions, and segment activation have not started yet.

## The idea

Most stores collect orders, clicks, and sessions but still know very little about what each customer actually wants.

Segmentiva closes that gap with a simple loop:

1. The merchant publishes a short preference questionnaire.
2. The customer completes it after accessing their Shopify account.
3. Segmentiva stores the answers as app-owned customer metafields.
4. Selected answers become namespaced customer tags.
5. Segmentiva creates native Shopify customer segments from those tags.
6. The merchant can use the segments to build more relevant shopping experiences.

```mermaid
flowchart TD
    A[Merchant publishes questionnaire] --> B[Customer shares preferences]
    B --> C[Shopify customer metafields]
    C --> D[Segmentiva tag mappings]
    D --> E[Native Shopify segments]
    E --> F[Personalized shopping]
```

## Why Segmentiva

- **Declared preferences:** learn directly from customers instead of relying only on inferred behavior.
- **Shopify-native activation:** use customer metafields, tags, and saved segments that fit existing merchant workflows.
- **No theme-code dependency:** the primary experience uses Shopify Customer Account UI extensions.
- **Privacy by design:** keep customer-level preference data in Shopify and minimize replicated personal data.
- **Built for every merchant:** Kliquea is the first pilot, but the application is multi-tenant and store-agnostic.
- **Expandable foundation:** later releases can add behavioral signals, recommendations, Shopify Flow, and approved marketing integrations.

## MVP

The first release delivers one complete, testable journey.

### Merchant experience

- Embedded Shopify Admin application.
- Guided installation and setup checklist.
- Versioned questionnaire builder.
- Single-select, multi-select, and boolean questions.
- English and Spanish customer-facing labels.
- Mapping from questionnaire options to Segmentiva-owned tags.
- Native Shopify saved-segment creation and synchronization.
- Completion, synchronization, and diagnostic status.
- Privacy, uninstall, and mandatory compliance handling.

### Customer experience

- An invitation on the Shopify customer account order-index page.
- A dedicated customer account preferences page.
- Mobile-first questionnaire with progress and validation.
- Safe editing of previously saved preferences.
- Clear explanation of how preferences improve the shopping experience.
- No forced or preselected marketing consent.

### Initial Kliquea pilot

The default pilot questionnaire covers:

- shopping interests;
- who the customer usually shops for;
- price and quality preferences.

The pilot is seeded through configuration. Kliquea-specific IDs, domains, credentials, categories, or theme details must never be hard-coded.

## Important Shopify limitation

Shopify does not provide a documented extension target inside its native passwordless login or account-creation form.

Segmentiva therefore collects preferences **immediately after the customer's first authenticated account access**. It does not replace Shopify authentication, intercept OTP codes, request passwords, or imitate the native registration screen.

The MVP targets **new Shopify customer accounts**. Classic customer account support is planned for a later storefront-extension phase.

## Planned architecture

Segmentiva begins as a modular monolith: one deployable Shopify application with clear internal domain boundaries.

| Layer | Planned implementation |
| --- | --- |
| Application | Official Shopify React Router template |
| Language | TypeScript in strict mode |
| Merchant UI | Embedded App Home with App Bridge and Shopify web components |
| Customer UI | Two Customer Account UI extensions |
| Shopify APIs | GraphQL Admin API and Customer Account API |
| API baseline | Stable Shopify version `2026-07` |
| Customer data | App-owned Shopify customer metafields |
| Activation | Namespaced customer tags and native saved segments |
| Application data | Prisma with PostgreSQL in shared environments |
| Testing | Vitest, integration tests, and Shopify dev-store validation |
| Delivery model | Provider-neutral Node container with managed PostgreSQL |

### Customer account extensions

Two independent extensions are planned:

- **`segmentiva-preferences-prompt`**  
  Uses `customer-account.order-index.announcement.render` to invite incomplete customers.

- **`segmentiva-preferences-page`**  
  Uses `customer-account.page.render` to display and edit the questionnaire.

### Data flow

Customer preference answers are stored in app-owned metafields using stable internal keys. Segmentiva mirrors only actionable mappings into tags such as:

```text
segmentiva:interests:beauty
segmentiva:shopping_for:gifts
segmentiva:shopping_style:price_quality_balance
segmentiva:profile:complete
```

Those tags power ShopifyQL saved segments such as:

```text
customer_tags CONTAINS 'segmentiva:interests:beauty'
```

Segmentiva only reconciles tags using its own `segmentiva:` namespace and never removes merchant-created tags.

## Privacy and security principles

- Store customer-level preference data primarily in Shopify.
- Do not copy the merchant's customer directory into Segmentiva.
- Do not persist customer names, email addresses, phone numbers, or postal addresses for the MVP.
- Never place customer answers, credentials, access tokens, or raw Shopify payloads in logs.
- Use official Shopify authentication and session libraries.
- Verify customer extension session tokens and webhook HMAC signatures server-side.
- Enforce strict shop-level tenant isolation.
- Request only the minimum protected-customer-data access needed.
- Implement `customers/data_request`, `customers/redact`, and `shop/redact` before pilot completion.
- Never train models on customer answers in the MVP.

## Project status

| Area | Status |
| --- | --- |
| Product name and positioning | Complete |
| MVP product definition | Complete |
| Shopify platform feasibility | Validated |
| Technical architecture | Complete |
| Cursor implementation handoff | Complete |
| Shopify application scaffold | Complete (Phase 0) |
| Tenant model and merchant onboarding | In progress (Phase 1) |
| Customer account extensions | Not started |
| Kliquea development-store pilot | Not started |
| Shopify App Store submission | Future phase |

## Start here

The complete implementation specification is:

**[SEGMENTIVA_MVP_BUILD_PLAN.md](./SEGMENTIVA_MVP_BUILD_PLAN.md)**

It contains:

- the authoritative MVP scope;
- platform constraints;
- architecture and data ownership;
- database concepts;
- backend contracts;
- access scopes;
- privacy and security requirements;
- five gated implementation phases;
- acceptance criteria and test strategy;
- six copy-ready execution prompts for Cursor.

### Recommended Cursor workflow

1. Clone the repository.

   ```bash
   git clone https://github.com/cank3r/segmentiva.git
   cd segmentiva
   ```

2. Open the repository in Cursor.
3. Install Shopify's official AI Toolkit through Cursor's `/add-plugin` flow.
4. Read `SEGMENTIVA_MVP_BUILD_PLAN.md` completely.
5. Run **Prompt A — Repository audit and scaffold** from section 24.
6. Complete and verify one phase before starting the next.
7. Keep each phase in a small, reviewable commit.

> [!NOTE]
> Phase 0 is complete in this repository. Phase 1 adds tenant onboarding on top of that baseline. Running `shopify app dev` still requires linking the app to a Shopify app record and a development store.

## Local development

Phase 0 provides a runnable Shopify app baseline. Phase 1 adds the shop tenant model, install/uninstall lifecycle, overview checklist, settings diagnostics, and an explicit pilot-questionnaire seed. The commands below work from a clean clone.

### Prerequisites

- **Node.js 22.** `.nvmrc` pins `22` and the app enforces `>=22.12 <23`. With nvm, run `nvm use`.
- **npm** (bundled with Node).
- **[Shopify CLI](https://shopify.dev/docs/apps/tools/cli).** Needed for `shopify app dev` and app management. Install with `npm install -g @shopify/cli@latest` if `shopify version` is unavailable.
- **[Shopify AI Toolkit](https://shopify.dev/docs/apps/build/ai-toolkit).** Install in Cursor via `/add-plugin` (search "Shopify") and use it to verify Shopify APIs before implementing them.

### Install and set up

```bash
npm ci        # install exact locked dependencies
npm run setup  # generate the Prisma client and apply local SQLite migrations
```

`npm run setup` defaults `DATABASE_URL` to `file:dev.sqlite` when the variable is unset and uses the SQLite Prisma schema plus `prisma/migrations`.

Shared and production environments must use PostgreSQL **and** the PostgreSQL schema. Setting `DATABASE_URL=postgresql://...` is not enough if you run raw `npx prisma` against `prisma/schema.prisma` (Prisma error `P1012`). Always run Prisma through the helper:

```bash
# SQLite (local default)
npm run setup
npm run db:validate

# PostgreSQL (shared/production)
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/segmentiva npm run setup
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/segmentiva npm run db:validate
```

The helper (`scripts/prisma-with-db.mjs`) selects:

| `DATABASE_URL` | Schema | Migrations |
| --- | --- | --- |
| `file:...` or unset | `prisma/schema.prisma` | `prisma/migrations` |
| `postgresql://...` | `prisma/postgresql/schema.prisma` | `prisma/postgresql/migrations` |

Keep both schema files in sync when changing `Shop`, `Session`, or `ProcessedWebhook`.

### Environment variables

During normal development the Shopify CLI injects Shopify credentials automatically when you run `npm run dev`. Copy `.env.example` to `.env` only if you need to run the built server directly. Never commit real secrets, tokens, or customer data.

| Variable | Purpose |
| --- | --- |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | App credentials from the Shopify app record |
| `SHOPIFY_APP_URL` | Public URL (the CLI sets this to the dev tunnel) |
| `SCOPES` | Admin API scopes, kept in sync with `shopify.app.toml` (`read_customers,write_customers`) |
| `DATABASE_URL` | Local SQLite `file:dev.sqlite` via `prisma/schema.prisma`. PostgreSQL requires a `postgresql://` URL **and** `scripts/prisma-with-db.mjs` so `prisma/postgresql/schema.prisma` is used. Changing only the URL is not supported. |

### Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run the app locally through the Shopify CLI (`shopify app dev`) |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run setup` | Prisma client generation and migrations for the provider that matches `DATABASE_URL` |
| `npm run db:validate` | `prisma validate` against the selected schema |
| `npm run seed:pilot` | Explicitly import or reset the Kliquea pilot questionnaire for one shop |
| `npm run typecheck` | React Router typegen and `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit and integration tests |

### Pilot questionnaire seed

The pilot pack is merchant configuration, not a store identity. It never runs on install and is not bound to a Kliquea domain. The CLI is an operator action against the application database; it does not use a Shopify Admin session. Prefer the Settings confirmation form for a merchant-authenticated import.

```bash
npm run seed:pilot -- --shop=example.myshopify.com --pack=kliquea-pilot --confirm
npm run seed:pilot -- --shop=example.myshopify.com --pack=kliquea-pilot --reset --confirm
```

Without `--shop`, `--pack`, and `--confirm`, the command refuses to run. `--reset` clears the current shop's pilot import so it can be imported again (repair/reset). The same import and clear actions are available from Settings after an explicit checkbox confirmation for the currently authenticated shop. Reimporting an already-imported pack at the same version is idempotent.

### APP_UNINSTALLED and expiring offline tokens

Segmentiva keeps Shopify's official `authenticate.webhook()` and `future.expiringOfflineAccessTokens: true`. Current `@shopify/shopify-app-react-router` (1.2.x and current 2.x mainline) validates HMAC, then refreshes the offline session, and can throw HTTP 500 when that refresh fails after uninstall. There is no official patched release that skips refresh for `APP_UNINSTALLED`.

Segmentiva therefore recovers **only** `APP_UNINSTALLED` when the official authenticator throws 500 after HMAC has already succeeded. Invalid HMAC still returns 401 from the official library. This is not a custom HMAC implementation.

### Still pending for Shopify store validation

These steps require Shopify credentials and a store, so they happen outside this repository:

- link the app to its Shopify app record in the Dev Dashboard (`shopify app config link`);
- run `shopify app dev` against a Shopify development store;
- install, uninstall, and reinstall inside that development store;
- run the Settings diagnostic against the authenticated shop;
- import the pilot pack for a development shop only (never a production domain).

## Implementation phases

| Phase | Outcome |
| --- | --- |
| 0 | Official Shopify React Router scaffold and clean baseline |
| 1 | Tenant model, installation lifecycle, and merchant onboarding |
| 2 | Versioned questionnaire builder |
| 3 | Customer account preference collection |
| 4 | Shopify tags and native segment activation |
| 5 | Privacy, security hardening, CI, and Kliquea pilot readiness |

Work outside the current phase is intentionally deferred.

## Not in MVP 1.0

- custom authentication or OTP handling;
- fields inside Shopify's native sign-up form;
- classic customer account support;
- behavioral Web Pixel collection;
- predictive AI or ML scoring;
- product-ranking or recommendation engine;
- Klaviyo, Meta, Google, HubSpot, or external CDP activation;
- email, SMS, or WhatsApp campaign delivery;
- billing and usage metering;
- bulk customer backfills;
- microservices, queues, Redis, or a data warehouse.

## Roadmap

After the Kliquea MVP proves the core preference-to-segment loop:

1. **Storefront compatibility** — Theme App Extension and classic-account support.
2. **Behavioral signals** — consent-aware Web Pixel events and observed affinities.
3. **Personalization** — recommendation blocks and merchandising rules.
4. **Ecosystem activation** — Shopify Flow and approved marketing integrations.
5. **Commercial release** — billing, self-service onboarding, support tooling, and App Store review.

## Development principles

- Shopify-native before custom infrastructure.
- Stable APIs before release candidates.
- GraphQL Admin API before legacy REST.
- Customer privacy before growth features.
- Explicit preferences before inferred traits.
- Versioned configuration before mutable production state.
- Idempotent synchronization before background scale.
- Modular monolith before microservices.
- Evidence and tests before marking a phase complete.

## Repository

- **Owner:** [cank3r](https://github.com/cank3r)
- **Repository:** [cank3r/segmentiva](https://github.com/cank3r/segmentiva)
- **Primary branch:** `main`
- **Initial pilot:** Kliquea
- **Product direction:** Public Shopify app for any merchant

## License

No open-source license has been selected. Until a license is added, all rights are reserved.
