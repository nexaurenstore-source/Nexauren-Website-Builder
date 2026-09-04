# Builder Foundation Status

The current foundation connects the Website Builder to the Nexauren ecosystem without duplicating the core account or billing system.

## Connected
- `DB` → `nexauren-db` for Nexauren authentication and billing.
- `BUILDER_DB` → `nexauren-website-build` for Builder data.
- `GET /api/account` → authenticated Nexauren account.
- `GET /api/billing/catalog` → shared Nexauren plan catalog.
- `GET /api/billing/account` → current plan and subscription state.
- `POST /api/billing/checkout` → existing PayPal subscription flow.
- `GET /api/faq` → published FAQ records from Builder D1.

## Builder data foundation
The Builder D1 contains projects, pages, sections, page elements, media, navigation, forms, templates, versions, publications, domains, SEO, analytics, custom code and related management tables.

## Next implementation layer
1. Dashboard and My Websites.
2. Project creation and project management API.
3. Page creation and ordering.
4. Section library and variants.
5. Visual editor with content/layout/style/responsive inspectors.
6. Preview, versions and publish pipeline.
