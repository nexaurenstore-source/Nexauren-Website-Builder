# Nexauren Website Builder

Universal visual website creation platform. It is not limited to stores: users can create websites, blogs, stores, portfolios, landing pages, business sites, course sites, membership sites or blank projects.

## Builder
- Nested blocks, containers and columns
- Inline canvas editing
- Reusable patterns and components
- Global Header / Footer
- Page templates
- Per-element styling and responsive preview
- Pages, Blog, Store, Forms, Media, Navigation, Theme and SEO modules
- HTML export and preview/publish simulation

## Monetization
The Builder uses the **same Nexauren billing catalog and D1 database** as the main Nexauren platform. It does not create a second plan or credit system.

Current shared plans:
- Free — $0
- Starter — $4.99/month — 300 credits/cycle
- Pro — $10/month — 1,000 credits/cycle
- Premium — $19.99/month — 3,000 credits/cycle

The Builder can also sell the shared credit packages. Free remains useful as a real website builder; limits should focus on project scale, premium templates and advanced/costly services rather than preventing users from building a complete site.

## Shared billing integration
`wrangler.json` binds this Worker to the existing Nexauren D1 database. `billing-core.js` implements the shared billing model and `paypal-provider.js` handles PayPal checkout/subscription operations without exposing credentials to the browser.

Supported Builder billing endpoints:
- `GET /api/billing/catalog`
- `GET /api/billing/account`
- `GET /api/billing/credits`
- `GET /api/billing/transactions`
- `POST /api/billing/checkout`
- `GET /api/billing/payment?reference=...`
- `POST /api/billing/payment`
- `POST /api/billing/subscription/cancel`

PayPal credentials must be configured as Worker secrets (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`) and the environment should remain `sandbox` until the complete sandbox flow is validated.

## Important
This repository is intentionally separate from `nexaurenstore-source/nexauren`. The main Nexauren repository is not modified by the Builder work.
