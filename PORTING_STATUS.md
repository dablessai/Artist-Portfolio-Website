# ArtByMukherjee — Porting Status: COMPLETE (2026-10-26 morning)

Ported standalone project is built, tested and delivered. See README.md
and DEPLOY_ORACLE.md in this folder. Original Muse site untouched.

Test results (local, test database only — discarded afterwards):
- Public data: 6 categories, 6 SAMPLE artworks, settings with no
  adminPass / adminPassHash leaked.
- Unauthenticated saveCategory: 401. Unauthenticated getAdminData: empty.
- Bad login: ok=false. Good login (admin@artbymukherjee.in / admin123):
  ok=true, session cookie issued.
- Authed category add worked; password change via Settings worked
  (old password then rejected, new password accepted).
- Submitted comment stayed Pending in the admin queue and hidden
  from public data. Homepage served 200.
- Client built with Vite + Tailwind (84 modules, ~5.3 MB dist incl.
  artwork images).

Still NOT done (needs separate decisions / credentials):
- Deployment itself: no Oracle instance exists yet.
- Real payments, real Google/X OAuth, image uploads (see README).
