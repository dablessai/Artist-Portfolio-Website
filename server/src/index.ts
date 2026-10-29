// Standalone server for the ported ArtByMukherjee site.
// Replaces the Muse space SDK: plain HTTP actions over POST /api/<action>,
// SQLite via Bun + Drizzle, same tables and same action names as the
// original site, so the React client is almost unchanged.
//
// Security differences vs the original (deliberate improvements):
// - The admin password is stored only as a bcrypt hash (adminPassHash).
//   A plaintext adminPass left over from the seed is hashed once on
//   first start and then deleted. It is never returned to any client.
// - Admin actions require a HttpOnly session cookie issued by
//   adminLogin (7-day expiry, stored hashed in a sessions table).
//   No password travels in later requests or sits in browser storage.
// - Comment login stays simulated (Google/X choice + name/email), as in
//   the original, and comments stay Pending until an admin approves.
// - Checkout uses Razorpay in TEST MODE (2026-10-27, test keys only).
//   Keys are NEVER in code, seed, or chat: the server reads
//   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET from its environment at
//   deploy time. The Key ID is public (it goes to Razorpay Checkout);
//   the Secret stays server-side and is used only to create orders
//   and to verify payment signatures. Live keys replace the test
//   keys in the environment later — no code change, and no key
//   ever goes into Admin Settings.

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { asc, desc, eq } from "drizzle-orm";
import * as schema from "./schema";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const DB_PATH = process.env.DB_PATH || join(ROOT, "data", "artbymukherjee.db");
const PORT = Number(process.env.PORT || 3000);
const DIST = process.env.CLIENT_DIST || join(ROOT, "client", "dist");
const SESSION_DAYS = 7;
// Admin photo uploads live under data/ (not client/dist, which a rebuild
// wipes, and not the bundled assets). data/ is the directory the deploy
// guide already says never to overwrite on code updates, so uploaded
// photos survive a re-upload + rebuild. They are served by the /uploads/
// route below, not by the static client fallback.
const UPLOADS_DIR = join(ROOT, "data", "uploads");
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const UPLOAD_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

mkdirSync(join(ROOT, "data"), { recursive: true });
mkdirSync(UPLOADS_DIR, { recursive: true });
const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite, { schema });

// ---- first-run setup: schema + sessions table + password hashing ----
const hasCategories = sqlite
  .query("SELECT name FROM sqlite_master WHERE type='table' AND name='categories'")
  .get();
if (!hasCategories) {
  const sql = readFileSync(join(ROOT, "db", "schema.sql"), "utf8");
  for (const stmt of sql.split("--> statement-breakpoint")) {
    const s = stmt.trim();
    if (s) sqlite.run(s);
  }
}
sqlite.run(
  "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)",
);
// Upgrade path for databases seeded before Razorpay payment columns existed.
for (const col of ["razorpay_payment_id TEXT DEFAULT ''", "razorpay_order_id TEXT DEFAULT ''"]) {
  try {
    sqlite.run(`ALTER TABLE orders ADD COLUMN ${col}`);
  } catch {
    // Column already exists — nothing to do.
  }
}

function settingsMap(): Record<string, string> {
  const rows = db.select().from(schema.siteSettings).all();
  const m: Record<string, string> = {};
  for (const r of rows) m[r.key] = r.value;
  return m;
}
function setSetting(key: string, value: string) {
  const ex = db.select().from(schema.siteSettings).where(eq(schema.siteSettings.key, key)).all();
  if (ex.length) db.update(schema.siteSettings).set({ value }).where(eq(schema.siteSettings.key, key)).run();
  else db.insert(schema.siteSettings).values({ key, value }).run();
}
function delSetting(key: string) {
  db.delete(schema.siteSettings).where(eq(schema.siteSettings.key, key)).run();
}
// Hash a legacy plaintext adminPass once, then delete it.
{
  const s = settingsMap();
  if (!s["adminPassHash"]) {
    const plain = s["adminPass"];
    const hash = await Bun.password.hash(plain && plain.length ? plain : "admin123");
    setSetting("adminPassHash", hash);
    if (s["adminPass"]) delSetting("adminPass");
  }
  if (!s["adminEmail"]) setSetting("adminEmail", "admin@artbymukherjee.in");
}

function sha(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sessionToken(req: Request): string | null {
  return parseCookies(req)["abm_session"] || null;
}
function isAuthed(req: Request): boolean {
  const t = sessionToken(req);
  if (!t) return false;
  const row = sqlite.query("SELECT expires_at FROM sessions WHERE token_hash = ?").get(sha(t)) as
    | { expires_at: number }
    | undefined;
  if (!row) return false;
  if (row.expires_at < Date.now()) {
    sqlite.query("DELETE FROM sessions WHERE token_hash = ?").run(sha(t));
    return false;
  }
  return true;
}
function newSessionCookie(): string {
  const token = `${randomUUID()}-${randomUUID()}`;
  sqlite
    .query("INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)")
    .run(sha(token), Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  return `abm_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 24 * 3600}`;
}
function clearSessionCookie(req: Request): string {
  const t = sessionToken(req);
  if (t) sqlite.query("DELETE FROM sessions WHERE token_hash = ?").run(sha(t));
  return "abm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const iso = (d: any) => (d instanceof Date ? d.toISOString() : d ? new Date(d).toISOString() : "");
const need = (v: unknown, min = 1) => typeof v === "string" && v.trim().length >= min;
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const requireAuth = (authed: boolean) => {
  if (!authed) throw new HttpError(401, "Unauthorized: admin login required");
};

type Handler = (args: any, authed: boolean, req: Request) => Promise<any>;

// ---- admin login rate limiting: 5 failed attempts, then 15-minute lockout ----
// Keyed by email + client address (X-Forwarded-For when behind nginx, else
// direct). In-memory only: a server restart clears the counters, which is
// acceptable for a single-instance site; the lockout still stops automated
// guessing while the server is running. Successful login clears the counter.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; firstAt: number; lockedUntil: number }>();
function loginKey(req: Request, email: unknown): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "direct";
  const em = typeof email === "string" ? email.trim().toLowerCase() : "";
  return `${fwd}|${em}`;
}
function loginLocked(key: string): boolean {
  const rec = loginAttempts.get(key);
  if (!rec) return false;
  const now = Date.now();
  if (rec.lockedUntil > now) return true;
  if (now - rec.firstAt > LOGIN_WINDOW_MS) loginAttempts.delete(key);
  return false;
}
function recordLoginFailure(key: string): void {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || now - rec.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now, lockedUntil: 0 });
  } else {
    rec.count += 1;
    if (rec.count >= LOGIN_MAX_ATTEMPTS) rec.lockedUntil = now + LOGIN_LOCK_MS;
  }
}

// ---- Razorpay checkout (test mode): server-computed totals, verified payments ----
// The client NEVER decides the price. Every cart item is re-priced from the
// database here, originals must still be Available, and an artwork is
// marked Sold only inside verifyRazorpayPayment, after the payment
// signature checks out. A failed, abandoned, or forged payment therefore
// creates no order and sells nothing. This replaces the old placeOrder
// flaw, where a client-set total of even ₹0 could mark an artwork Sold.
type CartInput = { artworkId?: unknown; printOptionId?: unknown; kind?: unknown; isOriginal?: unknown };
function computeOrder(items: unknown, discountCode: unknown) {
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, "Cart is empty");
  const priced: { title: string; price: number; kind: string }[] = [];
  const originalIds: number[] = [];
  let subtotal = 0;
  for (const raw of items as CartInput[]) {
    const art = db.select().from(schema.artworks).where(eq(schema.artworks.id, num(raw.artworkId))).all()[0];
    if (!art) throw new HttpError(400, "An item in the cart no longer exists");
    if (raw.isOriginal) {
      if (art.status !== "Available") throw new HttpError(400, `${art.title} is no longer available`);
      if (art.price <= 0) throw new HttpError(400, `${art.title} is not priced for sale`);
      priced.push({ title: art.title, price: art.price, kind: "Original" });
      subtotal += art.price;
      originalIds.push(art.id);
    } else {
      const print = db.select().from(schema.printOptions).where(eq(schema.printOptions.id, num(raw.printOptionId))).all()[0];
      if (!print || print.artworkId !== art.id) throw new HttpError(400, "A print in the cart is no longer available");
      priced.push({ title: `${art.title} — ${print.label}`, price: print.price, kind: "Print" });
      subtotal += print.price;
    }
  }
  let discount = 0;
  let code = "";
  if (typeof discountCode === "string" && discountCode.trim()) {
    code = discountCode.trim().toUpperCase();
    const d = db.select().from(schema.discountCodes).all().find((x) => x.code.toUpperCase() === code && x.active === 1);
    if (!d) throw new HttpError(400, "Discount code is not valid or has been disabled");
    discount = d.type === "percent" ? Math.round((subtotal * d.value) / 100) : d.value;
    discount = Math.min(discount, subtotal);
  }
  const s = settingsMap();
  const shipping = Number(s["shippingCharge"] || 500);
  const total = Math.max(0, subtotal - discount) + shipping;
  return { items: priced, subtotal, discount, shipping, total, discountCode: code, originalIds };
}
function razorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  return { keyId, keySecret, configured: Boolean(keyId && keySecret) };
}

// ---- Resend order emails (server-side only, plain fetch, no new dependency) ----
// Keys NEVER in code, seed, chat, or Admin Settings: RESEND_API_KEY and
// RESEND_FROM come from the server environment at deploy time. The from
// address defaults to orders@artbymukherjee.in, which must be a verified
// sending domain in Resend before any email actually delivers. Email is
// best-effort by design: if the key is unset, sending is skipped (logged
// once per attempt) and the order still completes; a failed send is
// logged server-side and never fails an order, a checkout, or an update.
function resendConfig() {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.RESEND_FROM || "orders@artbymukherjee.in";
  return { apiKey, from, configured: Boolean(apiKey) };
}
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
  const cfg = resendConfig();
  if (!cfg.configured) {
    console.warn("[email] RESEND_API_KEY not set — skipping email");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ from: cfg.from, to, subject, html, ...(text ? { text } : {}) }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[email] Resend send failed (${res.status}): ${body.slice(0, 300)}`);
    }
  } catch (e) {
    console.warn("[email] Resend send error:", e instanceof Error ? e.message : String(e));
  }
}

// ---- Branded email templates (email-safe: table layout, inline styles only,
// no web fonts; Heritage Indian palette: ivory/cream, marigold #E9A13B,
// sindoor #C1442E, indigo-teal #205E63. Header is a dark band holding the
// brand logo for emails (client/public/logo-email.png, served as /logo-email.png — white-on-black
// artwork, so the dark band keeps it visible; hosted image, never base64) ----
// Every interpolated value must already be HTML-escaped by the caller via esc().
function emailTemplate(heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background-color:#F7F0DC;font-family:Georgia,serif;color:#333333;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F0DC;"><tr><td align="center" style="padding:24px 12px;">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#FFFBF0;border:1px solid #EAD9B8;">`
    + `<tr><td style="background-color:#111111;padding:20px 28px;text-align:center;">`
    + `<img src="https://artbymukherjee.in/logo-email.png" alt="ArtByMukherjee" width="180" style="display:block;margin:0 auto;max-width:180px;height:auto;border:0;">`
    + `<div style="height:3px;background-color:#E9A13B;margin:16px auto 0;width:80px;"></div></td></tr>`
    + `<tr><td style="padding:28px;"><h1 style="font-size:22px;color:#205E63;margin:0 0 16px;">${heading}</h1>${bodyHtml}</td></tr>`
    + `<tr><td style="background-color:#F7F0DC;padding:18px 28px;text-align:center;font-size:13px;color:#666666;border-top:3px solid #C1442E;">`
    + `ArtByMukherjee &middot; <a href="mailto:artbymukherjee@gmail.com" style="color:#205E63;">artbymukherjee@gmail.com</a>`
    + ` &middot; <a href="https://www.instagram.com/artbymukherjee" style="color:#205E63;">Instagram @artbymukherjee</a>`
    + ` &middot; <a href="https://artbymukherjee.in" style="color:#205E63;">artbymukherjee.in</a></td></tr>`
    + `</table></td></tr></table></body></html>`;
}
type OrderItem = { title: string; kind: string; price: number };
function orderSummaryTableHtml(items: OrderItem[]): string {
  const rows = items.map((it) => `<tr><td style="padding:8px;border-bottom:1px solid #EAD9B8;">${esc(it.title)}</td><td style="padding:8px;border-bottom:1px solid #EAD9B8;">${esc(it.kind)}</td><td align="right" style="padding:8px;border-bottom:1px solid #EAD9B8;">${inr(it.price)}</td></tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px;"><tr><th align="left" style="padding:8px;border-bottom:2px solid #205E63;color:#205E63;">Item</th><th align="left" style="padding:8px;border-bottom:2px solid #205E63;color:#205E63;">Kind</th><th align="right" style="padding:8px;border-bottom:2px solid #205E63;color:#205E63;">Price</th></tr>${rows}</table>`;
}
function orderSummaryText(items: OrderItem[]): string {
  return items.map((it) => `- ${it.title} (${it.kind}) — ${inr(it.price)}`).join("\n");
}

// ---- Instagram feed (Instagram API with Instagram Login) ----
// No Facebook Page is needed for this route: a Business/Creator account
// logging in with Instagram credentials is enough to read its own media.
// The access token is NEVER returned to any client and NEVER goes in
// Admin Settings: it lives only in the server database (settings keys
// instagramAccessToken / instagramTokenExpiresAt), stripped from both
// getSiteData and getAdminData, and blocked from saveSettings. The Meta
// App ID / App Secret are static server-environment values
// (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET), also never in code/seed.
// Feed posts are cached server-side (instagramFeedCache, public-safe
// fields only) for 1 hour, so a failed or expired-token fetch still
// shows the last good posts and the profile link — never fake posts.
type IgPost = { id: string; caption: string; mediaType: string; mediaUrl: string; thumbnailUrl: string; permalink: string; timestamp: string };
const IG_CACHE_TTL_MS = 3600 * 1000;
const oauthStates = new Map<string, number>();
function igAppConfig() {
  const appId = process.env.INSTAGRAM_APP_ID || "";
  const appSecret = process.env.INSTAGRAM_APP_SECRET || "";
  return { appId, appSecret, configured: Boolean(appId && appSecret) };
}
function igCachedPosts(): { posts: IgPost[]; cachedAt: number } {
  try {
    const s = settingsMap();
    const posts = JSON.parse(s["instagramFeedCache"] || "[]");
    const cachedAt = Number(s["instagramFeedCachedAt"] || 0);
    return { posts: Array.isArray(posts) ? posts : [], cachedAt };
  } catch {
    return { posts: [], cachedAt: 0 };
  }
}
async function igRefreshTokenIfNeeded(): Promise<void> {
  const s = settingsMap();
  const token = s["instagramAccessToken"];
  const expiresAt = Number(s["instagramTokenExpiresAt"] || 0);
  if (!token || !expiresAt) return;
  if (expiresAt - Date.now() > 7 * 24 * 3600 * 1000) return; // still >7 days left
  try {
    const res = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`,
    );
    const data: any = await res.json().catch(() => ({}));
    if (data?.access_token) {
      setSetting("instagramAccessToken", data.access_token);
      if (data?.expires_in) setSetting("instagramTokenExpiresAt", String(Date.now() + Number(data.expires_in) * 1000));
    }
  } catch {
    // Keep the old token; the cached feed still serves.
  }
}
async function igFetchFresh(): Promise<IgPost[]> {
  const s = settingsMap();
  const token = s["instagramAccessToken"];
  if (!token) return [];
  const url =
    `https://graph.instagram.com/v21.0/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(data?.data)) return [];
  const posts: IgPost[] = data.data
    .filter((p: any) => p?.media_url || p?.thumbnail_url)
    .map((p: any) => ({
      id: String(p.id), caption: String(p.caption || ""), mediaType: String(p.media_type || "IMAGE"),
      mediaUrl: String(p.media_url || p.thumbnail_url || ""), thumbnailUrl: String(p.thumbnail_url || p.media_url || ""),
      permalink: String(p.permalink || ""), timestamp: String(p.timestamp || ""),
    }));
  setSetting("instagramFeedCache", JSON.stringify(posts));
  setSetting("instagramFeedCachedAt", String(Date.now()));
  return posts;
}

const actions: Record<string, Handler> = {
  async adminLogin(args, _authed, req) {
    const key = loginKey(req, args.email);
    if (loginLocked(key)) {
      throw new HttpError(429, "Too many failed login attempts. Try again in 15 minutes.");
    }
    const s = settingsMap();
    const okEmail =
      typeof args.email === "string" &&
      args.email.trim().toLowerCase() === (s["adminEmail"] || "").toLowerCase();
    const okPass =
      typeof args.pass === "string" &&
      s["adminPassHash"] &&
      (await Bun.password.verify(args.pass, s["adminPassHash"]));
    const ok = Boolean(okEmail && okPass);
    if (ok) loginAttempts.delete(key);
    else recordLoginFailure(key);
    return { ok };
  },
  async adminLogout() {
    return { ok: true as const };
  },
  async getSiteData() {
    const [cats, arts, prints, posts, comms, tests, codes] = await Promise.all([
      db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder)).all(),
      db.select().from(schema.artworks).orderBy(desc(schema.artworks.id)).all(),
      db.select().from(schema.printOptions).all(),
      db.select().from(schema.blogPosts).orderBy(desc(schema.blogPosts.id)).all(),
      db.select().from(schema.comments).where(eq(schema.comments.status, "Approved")).orderBy(desc(schema.comments.id)).all(),
      db.select().from(schema.testimonials).orderBy(asc(schema.testimonials.sortOrder)).all(),
      db.select().from(schema.discountCodes).all(),
    ]);
    const s = settingsMap();
    delete s["adminPass"];
    delete s["adminPassHash"];
    delete s["adminEmail"];
    delete s["instagramAccessToken"];
    delete s["instagramFeedCache"];
    return {
      categories: cats,
      artworks: arts,
      printOptions: prints,
      posts: posts.map((p) => ({ ...p, createdAt: iso((p as any).createdAt) })),
      comments: comms.map((c) => ({ ...c, createdAt: iso((c as any).createdAt) })),
      testimonials: tests,
      settings: s,
      discountCodes: codes,
    };
  },
  async getAdminData(_args, authed) {
    if (!authed) return { orders: [], commissions: [], messages: [], allComments: [], adminSettings: {} };
    const [o, c, m, ac] = await Promise.all([
      db.select().from(schema.orders).orderBy(desc(schema.orders.id)).all(),
      db.select().from(schema.commissionRequests).orderBy(desc(schema.commissionRequests.id)).all(),
      db.select().from(schema.contactMessages).orderBy(desc(schema.contactMessages.id)).all(),
      db.select().from(schema.comments).orderBy(desc(schema.comments.id)).all(),
    ]);
    const map = (rows: any[]) => rows.map((x) => ({ ...x, createdAt: iso(x.createdAt) }));
    const adminSettings = settingsMap();
    delete adminSettings["adminPass"];
    delete adminSettings["adminPassHash"];
    delete adminSettings["instagramAccessToken"];
    return { orders: map(o), commissions: map(c), messages: map(m), allComments: map(ac), adminSettings };
  },
  async saveCategory(args, authed) {
    requireAuth(authed);
    if (!need(args.name)) throw new HttpError(400, "Category name required");
    const slugVal = slug(args.name);
    if (args.id) {
      db.update(schema.categories).set({ name: args.name, slug: slugVal, coverAsset: args.coverAsset || "hero" }).where(eq(schema.categories.id, num(args.id))).run();
    } else {
      const all = db.select().from(schema.categories).all();
      db.insert(schema.categories).values({ name: args.name, slug: slugVal, coverAsset: args.coverAsset || "hero", sortOrder: all.length + 1 }).run();
    }
    return { ok: true as const };
  },
  async deleteCategory(args, authed) {
    requireAuth(authed);
    if (args.moveToId) {
      db.update(schema.artworks).set({ categoryId: num(args.moveToId) }).where(eq(schema.artworks.categoryId, num(args.id))).run();
    }
    db.delete(schema.categories).where(eq(schema.categories.id, num(args.id))).run();
    return { ok: true as const };
  },
  async saveArtwork(args, authed) {
    requireAuth(authed);
    if (!need(args.title)) throw new HttpError(400, "Artwork title required");
    const v = {
      title: args.title, categoryId: num(args.categoryId, 1), medium: args.medium || "", size: args.size || "",
      year: args.year || "2025", price: num(args.price), framed: args.framed || "Unframed",
      status: args.status || "Available", description: args.description || "", featured: num(args.featured),
      imageAsset: args.imageAsset || "hero", sellPrints: num(args.sellPrints), imageProtection: num(args.imageProtection, 1),
    };
    if (args.id) db.update(schema.artworks).set(v).where(eq(schema.artworks.id, num(args.id))).run();
    else db.insert(schema.artworks).values(v).run();
    return { ok: true as const };
  },
  async deleteArtwork(args, authed) {
    requireAuth(authed);
    db.delete(schema.artworks).where(eq(schema.artworks.id, num(args.id))).run();
    return { ok: true as const };
  },
  // Admin photo upload (2026-10-27): accepts a base64 data URL from the
  // Admin artwork form, validates it, and stores it under data/uploads/.
  // The returned URL is stored as the artwork's imageAsset; the client's
  // img() resolver passes /uploads/... URLs through unchanged, while
  // bundled ASSETS keys keep working exactly as before. SVG is refused
  // (it can carry scripts); only raster JPEG/PNG/WebP up to 5 MB.
  async uploadArtworkImage(args, authed) {
    requireAuth(authed);
    const dataUrl = typeof args.dataUrl === "string" ? args.dataUrl : "";
    const m = /^data:(image\/jpeg|image\/png|image\/webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) throw new HttpError(400, "Upload a JPEG, PNG or WebP image (max 5 MB)");
    const ext = UPLOAD_TYPES[m[1]];
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length === 0 || bytes.length > UPLOAD_MAX_BYTES) {
      throw new HttpError(400, "Image must be under 5 MB");
    }
    const filename = `upload-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    writeFileSync(join(UPLOADS_DIR, filename), bytes);
    const url = `/uploads/${filename}`;
    return { ok: true as const, url, imageAsset: url };
  },
  async savePrintOption(args, authed) {
    requireAuth(authed);
    db.insert(schema.printOptions).values({ artworkId: num(args.artworkId), label: args.label || "", size: args.size || "", price: num(args.price), isDigital: num(args.isDigital) }).run();
    return { ok: true as const };
  },
  async deletePrintOption(args, authed) {
    requireAuth(authed);
    db.delete(schema.printOptions).where(eq(schema.printOptions.id, num(args.id))).run();
    return { ok: true as const };
  },
  async savePost(args, authed) {
    requireAuth(authed);
    if (!need(args.title)) throw new HttpError(400, "Post title required");
    const v = {
      title: args.title, slug: slug(args.title), excerpt: args.excerpt || "", content: args.content || "",
      coverAsset: args.coverAsset || "pastel", tags: args.tags || "", status: args.status || "Published",
    };
    if (args.id) db.update(schema.blogPosts).set(v).where(eq(schema.blogPosts.id, num(args.id))).run();
    else db.insert(schema.blogPosts).values(v).run();
    return { ok: true as const };
  },
  async deletePost(args, authed) {
    requireAuth(authed);
    db.delete(schema.blogPosts).where(eq(schema.blogPosts.id, num(args.id))).run();
    return { ok: true as const };
  },
  async submitComment(args) {
    if (!need(args.authorName) || !need(args.body)) throw new HttpError(400, "Name and comment required");
    db.insert(schema.comments).values({
      postId: num(args.postId), authorName: args.authorName, authorEmail: args.authorEmail || "",
      provider: args.provider || "Google", body: args.body, status: "Pending",
    }).run();
    return { ok: true as const };
  },
  async moderateComment(args, authed) {
    requireAuth(authed);
    if (args.status === "Deleted") db.delete(schema.comments).where(eq(schema.comments.id, num(args.id))).run();
    else db.update(schema.comments).set({ status: args.status || "Pending" }).where(eq(schema.comments.id, num(args.id))).run();
    return { ok: true as const };
  },
  async getPaymentConfig() {
    const cfg = razorpayConfig();
    return { configured: cfg.configured, keyId: cfg.keyId };
  },
  async createRazorpayOrder(args) {
    if (!need(args.buyerName) || !need(args.email) || !need(args.address, 5)) {
      throw new HttpError(400, "Name, email and full address are required");
    }
    const order = computeOrder(args.items, args.discountCode);
    const cfg = razorpayConfig();
    if (!cfg.configured) {
      throw new HttpError(503, "Razorpay test keys are not set on the server yet. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server environment, then try again.");
    }
    const receipt = `abm-${Date.now()}`.slice(0, 40);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({ amount: order.total * 100, currency: "INR", receipt, notes: { buyer: String(args.buyerName) } }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.id) {
      throw new HttpError(502, `Razorpay could not create the order: ${data?.error?.description || "unknown error"}`);
    }
    return { ok: true as const, razorpayOrderId: data.id, amount: order.total * 100, currency: "INR", keyId: cfg.keyId, total: order.total };
  },
  async verifyRazorpayPayment(args) {
    if (!need(args.buyerName) || !need(args.email) || !need(args.address, 5)) {
      throw new HttpError(400, "Name, email and full address are required");
    }
    if (!need(args.razorpayOrderId) || !need(args.razorpayPaymentId) || !need(args.razorpaySignature)) {
      throw new HttpError(400, "Payment details are incomplete");
    }
    const cfg = razorpayConfig();
    if (!cfg.configured) throw new HttpError(503, "Razorpay test keys are not set on the server yet.");
    const expected = createHmac("sha256", cfg.keySecret)
      .update(`${args.razorpayOrderId}|${args.razorpayPaymentId}`)
      .digest("hex");
    const sig = String(args.razorpaySignature);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      throw new HttpError(400, "Payment verification failed. No order was created and nothing was marked Sold.");
    }
    // Idempotency first: a retry of an already-verified payment returns
    // the original order instead of failing because the artwork is now Sold.
    const existing = db.select().from(schema.orders).where(eq(schema.orders.razorpayPaymentId, String(args.razorpayPaymentId))).all();
    if (existing.length) return { ok: true as const, orderId: existing[0].id };
    // Re-price everything from the database — the client total is ignored.
    const order = computeOrder(args.items, args.discountCode);
    const r = db.insert(schema.orders).values({
      buyerName: args.buyerName, email: args.email, phone: args.phone || "", address: args.address,
      itemsJson: JSON.stringify(order.items), total: order.total, discountCode: order.discountCode,
      paymentStatus: "Paid", orderStatus: "Processing",
      razorpayPaymentId: String(args.razorpayPaymentId), razorpayOrderId: String(args.razorpayOrderId),
    }).returning({ id: schema.orders.id }).all();
    for (const oid of order.originalIds) {
      db.update(schema.artworks).set({ status: "Sold" }).where(eq(schema.artworks.id, num(oid))).run();
    }
    // Order emails fire ONLY here, after a verified payment created the
    // order and marked originals Sold. Failed, abandoned, or forged
    // payments never reach this point, and an idempotent retry returns
    // above without re-sending. A send failure never fails the order:
    // sendEmail catches and logs it, and the order still completes.
    const orderId = r[0]?.id ?? 0;
    const items = order.items as OrderItem[];
    const summaryHtml = orderSummaryTableHtml(items);
    const summaryText = orderSummaryText(items);
    await sendEmail(
      String(args.email),
      `Order #${orderId} confirmed — ArtByMukherjee`,
      emailTemplate("Thank you for your order!",
        `<p style="font-size:16px;line-height:1.6;">Dear ${esc(args.buyerName)},</p>`
        + `<p style="font-size:16px;line-height:1.6;">Thank you for bringing a piece of ArtByMukherjee home. Your order <strong>#${orderId}</strong> is confirmed and payment has been received.</p>`
        + `<h2 style="font-size:17px;color:#205E63;margin:24px 0 8px;">Order summary</h2>${summaryHtml}`
        + `<p style="font-size:16px;line-height:1.6;">Total paid: <strong>${inr(order.total)}</strong> (includes shipping ${inr(order.shipping)}).</p>`
        + `<p style="font-size:15px;line-height:1.6;">Original artworks will be shipped within 3 working days to the address you provided at checkout. Digital prints are delivered by email download link after payment.</p>`
        + `<p style="font-size:15px;line-height:1.6;">You can also print your on-screen confirmation page as your invoice.</p>`
        + `<p style="font-size:15px;line-height:1.6;">With gratitude,<br>— ArtByMukherjee</p>`),
      `ArtByMukherjee — Thank you for your order!\n\nDear ${args.buyerName},\n\nThank you for bringing a piece of ArtByMukherjee home. Your order #${orderId} is confirmed and payment has been received.\n\nOrder summary:\n${summaryText}\n\nTotal paid: ${inr(order.total)} (includes shipping ${inr(order.shipping)}).\n\nOriginal artworks will be shipped within 3 working days to the address you provided at checkout. Digital prints are delivered by email download link after payment.\n\nYou can also print your on-screen confirmation page as your invoice.\n\nWith gratitude,\n— ArtByMukherjee\n\nArtByMukherjee · artbymukherjee@gmail.com · Instagram @artbymukherjee · artbymukherjee.in`,
    );
    const artistEmail = settingsMap()["email"] || "artbymukherjee@gmail.com";
    await sendEmail(
      artistEmail,
      `New order #${orderId} — ArtByMukherjee`,
      emailTemplate("New order received",
        `<p style="font-size:16px;line-height:1.6;">A new order has been placed on ArtByMukherjee.</p>`
        + `<p style="font-size:16px;line-height:1.6;">Order <strong>#${orderId}</strong><br>Buyer: ${esc(args.buyerName)}<br>Email: ${esc(args.email)}<br>Phone: ${esc(args.phone || "")}</p>`
        + `<h2 style="font-size:17px;color:#205E63;margin:24px 0 8px;">Order summary</h2>${summaryHtml}`
        + `<p style="font-size:16px;line-height:1.6;">Total: <strong>${inr(order.total)}</strong></p>`
        + `<p style="font-size:15px;line-height:1.6;">View and manage this order in Admin &gt; Orders: <a href="https://artbymukherjee.in/admin" style="color:#205E63;">https://artbymukherjee.in/admin</a></p>`),
      `ArtByMukherjee — New order received\n\nA new order has been placed on ArtByMukherjee.\n\nOrder #${orderId}\nBuyer: ${args.buyerName}\nEmail: ${args.email}\nPhone: ${args.phone || ""}\n\nOrder summary:\n${summaryText}\n\nTotal: ${inr(order.total)}\n\nView and manage this order in Admin > Orders: https://artbymukherjee.in/admin\n\nArtByMukherjee · artbymukherjee@gmail.com · Instagram @artbymukherjee · artbymukherjee.in`,
    );
    return { ok: true as const, orderId };
  },
  async placeOrder() {
    // Deliberately disabled: the old placeOrder trusted the client's total
    // and marked artworks Sold with no payment. Checkout must go through
    // createRazorpayOrder + verifyRazorpayPayment instead.
    throw new HttpError(400, "Checkout now goes through Razorpay. Please use the Razorpay payment flow.");
  },
  async updateOrder(args, authed) {
    requireAuth(authed);
    const prev = db.select().from(schema.orders).where(eq(schema.orders.id, num(args.id))).all()[0];
    const nextStatus = args.orderStatus || "Processing";
    const nextCourier = args.courier || "";
    const nextTracking = args.tracking || "";
    db.update(schema.orders).set({ orderStatus: nextStatus, courier: nextCourier, tracking: nextTracking }).where(eq(schema.orders.id, num(args.id))).run();
    // Shipping update email, only when something actually changed. A send
    // failure never fails the update (sendEmail catches and logs it).
    if (prev && (prev.orderStatus !== nextStatus || prev.courier !== nextCourier || prev.tracking !== nextTracking)) {
      await sendEmail(
        String(prev.email),
        `Order #${prev.id} update — ArtByMukherjee`,
        emailTemplate("Your order has been updated",
          `<p style="font-size:16px;line-height:1.6;">Dear ${esc(prev.buyerName)},</p>`
          + `<p style="font-size:16px;line-height:1.6;">Your order <strong>#${prev.id}</strong> has been updated.</p>`
          + `<p style="font-size:16px;line-height:1.6;">Status: <strong>${esc(nextStatus)}</strong>${nextCourier ? `<br>Courier: ${esc(nextCourier)}` : ""}${nextTracking ? `<br>Tracking: ${esc(nextTracking)}` : ""}</p>`
          + `<p style="font-size:15px;line-height:1.6;">— ArtByMukherjee</p>`),
        `ArtByMukherjee — Your order has been updated\n\nDear ${prev.buyerName},\n\nYour order #${prev.id} has been updated.\n\nStatus: ${nextStatus}${nextCourier ? `\nCourier: ${nextCourier}` : ""}${nextTracking ? `\nTracking: ${nextTracking}` : ""}\n\n— ArtByMukherjee\n\nArtByMukherjee · artbymukherjee@gmail.com · Instagram @artbymukherjee · artbymukherjee.in`,
      );
    }
    return { ok: true as const };
  },
  async submitCommission(args) {
    if (!need(args.name) || !need(args.email)) throw new HttpError(400, "Name and email required");
    db.insert(schema.commissionRequests).values({
      name: args.name, email: args.email, whatsapp: args.whatsapp || "", type: args.type || "Portrait",
      medium: args.medium || "Oil Paint", size: args.size || "", deadline: args.deadline || "",
      budget: args.budget || "", message: args.message || "",
    }).run();
    return { ok: true as const };
  },
  async updateCommissionStatus(args, authed) {
    requireAuth(authed);
    db.update(schema.commissionRequests).set({ status: args.status || "New" }).where(eq(schema.commissionRequests.id, num(args.id))).run();
    return { ok: true as const };
  },
  async submitContact(args) {
    if (!need(args.name) || !need(args.email) || !need(args.message)) throw new HttpError(400, "Name, email and message required");
    db.insert(schema.contactMessages).values({ name: args.name, email: args.email, message: args.message }).run();
    return { ok: true as const };
  },
  async saveTestimonial(args, authed) {
    requireAuth(authed);
    const v = { name: args.name || "", place: args.place || "", text: args.text || "", rating: num(args.rating, 5) };
    if (args.id) db.update(schema.testimonials).set(v).where(eq(schema.testimonials.id, num(args.id))).run();
    else db.insert(schema.testimonials).values({ ...v, sortOrder: 99 }).run();
    return { ok: true as const };
  },
  async deleteTestimonial(args, authed) {
    requireAuth(authed);
    db.delete(schema.testimonials).where(eq(schema.testimonials.id, num(args.id))).run();
    return { ok: true as const };
  },
  async saveDiscount(args, authed) {
    requireAuth(authed);
    db.insert(schema.discountCodes).values({ code: args.code || "", type: args.type || "percent", value: num(args.value, 10), expiry: args.expiry || "", active: 1 }).run();
    return { ok: true as const };
  },
  async toggleDiscount(args, authed) {
    requireAuth(authed);
    db.update(schema.discountCodes).set({ active: num(args.active) }).where(eq(schema.discountCodes.id, num(args.id))).run();
    return { ok: true as const };
  },
  async getInstagramFeed() {
    const s = settingsMap();
    const token = s["instagramAccessToken"];
    const { posts: cached, cachedAt } = igCachedPosts();
    if (!token) return { connected: false, posts: cached, cachedAt, username: s["instagramUsername"] || "" };
    if (cached.length && Date.now() - cachedAt < IG_CACHE_TTL_MS) {
      return { connected: true, posts: cached, cachedAt, username: s["instagramUsername"] || "" };
    }
    await igRefreshTokenIfNeeded();
    const fresh = await igFetchFresh();
    if (fresh.length) return { connected: true, posts: fresh, cachedAt: Date.now(), username: s["instagramUsername"] || "" };
    return { connected: Boolean(token), posts: cached, cachedAt, username: s["instagramUsername"] || "" };
  },
  async getInstagramStatus(_args, authed) {
    requireAuth(authed);
    const s = settingsMap();
    const { posts: cached, cachedAt } = igCachedPosts();
    return {
      configured: igAppConfig().configured,
      connected: Boolean(s["instagramAccessToken"]),
      username: s["instagramUsername"] || "",
      expiresAt: Number(s["instagramTokenExpiresAt"] || 0),
      cachedAt,
      postCount: cached.length,
    };
  },
  async instagramDisconnect(_args, authed) {
    requireAuth(authed);
    delSetting("instagramAccessToken");
    delSetting("instagramTokenExpiresAt");
    delSetting("instagramUsername");
    delSetting("instagramFeedCache");
    delSetting("instagramFeedCachedAt");
    return { ok: true as const };
  },
  async saveSettings(args, authed) {
    requireAuth(authed);
    const entries: { key: string; value: string }[] = Array.isArray(args.entries) ? args.entries : [];
    for (const e of entries) {
      if (!e.key) continue;
      if (e.key === "adminPass") {
        // A new password typed in Settings: hash it, never store plaintext.
        if (e.value) setSetting("adminPassHash", await Bun.password.hash(e.value));
        continue;
      }
      if (e.key === "adminPassHash") continue;
      if (e.key === "instagramAccessToken" || e.key === "instagramFeedCache" || e.key === "instagramTokenExpiresAt") continue;
      setSetting(e.key, String(e.value ?? ""));
    }
    return { ok: true as const };
  },
};

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    // Instagram OAuth (GET, outside the POST-only action API).
    // Start requires an admin session; the callback validates a one-time
    // state token, exchanges the code server-side, and stores only the
    // long-lived token in the database — never in a cookie or response.
    if (url.pathname === "/api/instagram/start" && req.method === "GET") {
      if (!isAuthed(req)) return new Response("Admin login required to connect Instagram.", { status: 401 });
      const cfg = igAppConfig();
      if (!cfg.configured) {
        return new Response(
          "Instagram app not configured on this server yet. Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in the server environment, register this site's redirect URI (origin + /api/instagram/callback) in the Meta app, then try again.",
          { status: 503 },
        );
      }
      const state = `${randomUUID()}-${randomUUID()}`;
      oauthStates.set(state, Date.now() + 10 * 60 * 1000);
      const redirectUri = "https://artbymukherjee.in/api/instagram/callback"; // Fixed canonical URI: must match the URI registered in the Meta app exactly, regardless of which domain (www/IP) the admin clicked Connect from.
      const auth = new URL("https://www.instagram.com/oauth/authorize");
      auth.searchParams.set("client_id", cfg.appId);
      auth.searchParams.set("redirect_uri", redirectUri);
      auth.searchParams.set("scope", "instagram_business_basic");
      auth.searchParams.set("response_type", "code");
      auth.searchParams.set("state", state);
      return Response.redirect(auth.toString(), 302);
    }
    if (url.pathname === "/api/instagram/callback" && req.method === "GET") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const err = url.searchParams.get("error");
      if (err || !code || !state || !oauthStates.has(state) || (oauthStates.get(state) || 0) < Date.now()) {
        oauthStates.delete(state || "");
        return new Response("Instagram connection failed or expired. Please try connecting again from Admin.", { status: 400 });
      }
      oauthStates.delete(state);
      const cfg = igAppConfig();
      if (!cfg.configured) return new Response("Instagram app not configured on this server.", { status: 503 });
      const redirectUri = "https://artbymukherjee.in/api/instagram/callback"; // Fixed canonical URI: must match the URI registered in the Meta app exactly, regardless of which domain (www/IP) the admin clicked Connect from.
      try {
        const form = new URLSearchParams();
        form.set("client_id", cfg.appId);
        form.set("client_secret", cfg.appSecret);
        form.set("grant_type", "authorization_code");
        form.set("redirect_uri", redirectUri);
        form.set("code", code);
        const tokRes = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
        const tok: any = await tokRes.json().catch(() => ({}));
        if (!tokRes.ok || !tok?.access_token) return new Response("Instagram token exchange failed. Please try again.", { status: 502 });
        let longToken = tok.access_token as string;
        let expiresIn = Number(tok.expires_in || 0);
        try {
          const exRes = await fetch(
            `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(cfg.appSecret)}&access_token=${encodeURIComponent(tok.access_token)}`,
          );
          const ex: any = await exRes.json().catch(() => ({}));
          if (ex?.access_token) {
            longToken = ex.access_token;
            if (ex?.expires_in) expiresIn = Number(ex.expires_in);
          }
        } catch {
          // Keep the short-lived token; refresh will be attempted later.
        }
        setSetting("instagramAccessToken", longToken);
        if (expiresIn) setSetting("instagramTokenExpiresAt", String(Date.now() + expiresIn * 1000));
        if (tok?.user_id) setSetting("instagramUserId", String(tok.user_id));
        try {
          const meRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=username&access_token=${encodeURIComponent(longToken)}`);
          const me: any = await meRes.json().catch(() => ({}));
          if (me?.username) setSetting("instagramUsername", String(me.username));
        } catch {
          // Username is display-only; the token still works.
        }
        delSetting("instagramFeedCache");
        delSetting("instagramFeedCachedAt");
        return Response.redirect(`${url.origin}/?instagram=connected`, 302);
      } catch {
        return new Response("Instagram connection failed. Please try again from Admin.", { status: 502 });
      }
    }
    // Admin-uploaded artwork photos (public, like the gallery images).
    // The filename is server-generated, so only a plain basename is ever
    // served; anything else (paths, traversal) is a 404.
    if (url.pathname.startsWith("/uploads/") && req.method === "GET") {
      const name = basename(url.pathname.slice("/uploads/".length));
      const candidate = join(UPLOADS_DIR, name);
      const safe = name && !name.includes("/") && candidate.startsWith(UPLOADS_DIR + "/");
      if (safe && existsSync(candidate)) {
        const ext = name.split(".").pop()?.toLowerCase();
        const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        return new Response(Bun.file(candidate), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
      }
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname.startsWith("/api/")) {
      const action = url.pathname.slice(5);
      const handler = actions[action];
      if (!handler || req.method !== "POST") {
        return Response.json({ error: "Unknown action" }, { status: 404 });
      }
      let args: any = {};
      try {
        args = (await req.json()) || {};
      } catch {
        args = {};
      }
      try {
        const authed = isAuthed(req);
        const result = await handler(args, authed, req);
        const headers: Record<string, string> = {};
        if (action === "adminLogin" && result?.ok) headers["Set-Cookie"] = newSessionCookie();
        if (action === "adminLogout") headers["Set-Cookie"] = clearSessionCookie(req);
        return Response.json(result, { headers });
      } catch (err: any) {
        const status = err instanceof HttpError ? err.status : 500;
        return Response.json({ error: err?.message || "Server error" }, { status });
      }
    }
    // Static client (SPA fallback).
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const candidate = resolve(DIST, `.${filePath}`);
    const safe = candidate === DIST || candidate.startsWith(DIST + "/");
    if (safe && existsSync(candidate) && !candidate.endsWith("/")) {
      return new Response(Bun.file(candidate));
    }
    const index = join(DIST, "index.html");
    if (existsSync(index)) return new Response(Bun.file(index));
    return new Response("Client not built yet — run: bun run build", { status: 503 });
  },
});

console.log(`ArtByMukherjee (ported) listening on http://localhost:${server.port} — DB: ${DB_PATH}`);
