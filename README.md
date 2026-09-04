# Nexauren Website Builder

Standalone storefront builder for Nexauren.

## Current scope
- Digital products
- Physical products
- Online courses
- Memberships
- Coaching
- Product bundles
- Product visibility: visible, unlisted, invisible
- Free products and pay-what-you-want fields
- Product previews / license / mailing-list options
- Storefront preview
- Store Builder with ready-made sections
- Themes and brand settings
- Coupons
- Orders and customers from local test checkout
- Marketing surface for affiliates, referrals, cross-sells and reviews
- Static HTML export

## Architecture
The current standalone build intentionally keeps state in JavaScript memory. It does not require a database, payment provider, storage provider or external integration. Payment gateways, secure file storage, accounts, subscriptions, persistence and APIs are reserved for the next phase.

## Inspiration
The feature scope follows public Payhip capabilities such as digital/physical products, courses, coaching, memberships, bundles, store building, coupons, affiliates, referrals, reviews and pay-what-you-want pricing, while using Nexauren's own UI and implementation.
