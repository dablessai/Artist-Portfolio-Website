# ArtByMukherjee — Ported Standalone Website

A standalone port of the ArtByMukherjee portfolio + store + blog site for
fine artist Deepshikha Mukherjee (Jamshedpur, Jharkhand, India).
Heritage Indian theme: ivory base, marigold, sindoor-red, indigo-teal.

The original site was built inside Muse and depended on the Muse space
SDK (`@hatch/space-sdk`) — it cannot run anywhere else as-is. This port
removes that dependency completely. It runs on any Linux server with Bun
(including an Oracle Cloud Always Free ARM instance) with no Muse
environment at runtime.

## What is inside — same site, same features
- Home, Gallery, Shop, Commissions (exact 5-step process), About, Blog,
  Contact, floating WhatsApp button, full Admin panel.
- Gallery categories are data-driven and admin-managed (starting six:
  Charcoal, Graphite, Soft Pastel, Oil Paint, Acrylics, Portraits).
- Store in ₹, originals auto-mark Sold, discount codes (seed: WELCOME10),
  per-artwork prints toggle (OFF by default, incl. digital prints).
- Blog comments: visitors pick Google or Twitter/X and leave a comment —
  it stays **Pending and hidden** until the admin approves it.
- Admin: artworks, categories, blog, comment moderation, orders +
  tracking, commission requests, messages, testimonials, discounts,
  Content & Settings (contact/social values, prices, FAQs).

## What changed vs the original (security, deliberate)
1. **Admin password is bcrypt-hashed** (`adminPassHash` in Settings).
   The seed password `admin123` is hashed on first start and the
   plaintext is deleted. It is never sent to the browser, and the login
   page no longer prints demo credentials.
2. **Admin login uses a session cookie** (HttpOnly, 7 days) instead of
   the password being passed with every admin request and stored in
   browser session storage. Admin actions without a session return 401.
3. Comment login is still **simulated** (no real Google/X OAuth — no
   credentials were provided). Moderation rules are unchanged.
4. Checkout uses **Razorpay in TEST MODE** (built 2026-10-27). The
   server re-prices every item from the database and marks an artwork
   Sold only after the Razorpay payment signature verifies; the old
   client-trusted placeOrder is rejected. Keys come only from the
   server environment (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`) —
   never from Admin Settings, code, seed, or chat. Live keys replace
   the test keys in the environment later, with no code change.

## Run it locally
```bash
bun install
bun run build          # builds the client into client/dist
bun run start          # server on http://localhost:3000
```
First start creates `data/artbymukherjee.db` and seeds it from
`db/schema.sql` (6 categories, 6 SAMPLE artworks, 1 SAMPLE post,
placeholder testimonials, WELCOME10). Admin login is the current
login email and password set on 2026-10-27 (the original seeded
credentials no longer work); typing a new password in Admin →
Content & Settings re-hashes it.

Environment: `PORT` (default 3000), `DB_PATH` (default
`./data/artbymukherjee.db`), `CLIENT_DIST` (default `./client/dist`),
`RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (test keys for now; live
keys later — both server-side only, never in Admin Settings).

## Project layout
- `client/src/App.tsx` — all pages (kept from the original, only the
  login/session wiring changed); `theme.css` — Heritage Indian styling.
- `client/src/api.ts` — plain fetch client for `POST /api/<action>`.
- `server/src/index.ts` — Bun HTTP server + all actions + session auth.
- `server/src/schema.ts` — Drizzle SQLite tables (unchanged).
- `db/schema.sql` — tables + seed data used on first run.
- `DEPLOY_ORACLE.md` — step-by-step deployment on Oracle Cloud +
  artbymukherjee.in, including backups.

## Back up before you deploy
The database file (`data/artbymukherjee.db`) holds every artwork, order,
comment and setting. Copy it before upgrades: `cp data/artbymukherjee.db
data/artbymukherjee.db.bak`. See DEPLOY_ORACLE.md for a backup routine.
