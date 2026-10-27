// Plain fetch client for the ported standalone server.
// The server exposes the same action names as the original site over
// POST /api/<action> with a JSON body, and admin auth is a HttpOnly
// session cookie set by adminLogin — no password is stored in the browser.

export interface SiteData {
  categories: { id: number; name: string; slug: string; sortOrder: number; coverAsset: string }[];
  artworks: { id: number; title: string; categoryId: number; medium: string; size: string; year: string; price: number; framed: string; status: string; description: string; featured: number; imageAsset: string; sellPrints: number; imageProtection: number }[];
  printOptions: { id: number; artworkId: number; label: string; size: string; price: number; isDigital: number }[];
  posts: { id: number; title: string; slug: string; excerpt: string; content: string; coverAsset: string; tags: string; status: string; createdAt: string }[];
  comments: { id: number; postId: number; authorName: string; provider: string; body: string; status: string; createdAt: string }[];
  testimonials: { id: number; name: string; place: string; text: string; rating: number }[];
  settings: Record<string, string>;
  discountCodes: { id: number; code: string; type: string; value: number; expiry: string; active: number }[];
}

export interface AdminData {
  orders: { id: number; buyerName: string; email: string; phone: string; address: string; itemsJson: string; total: number; paymentStatus: string; orderStatus: string; courier: string; tracking: string; createdAt: string }[];
  commissions: { id: number; name: string; email: string; whatsapp: string; type: string; medium: string; size: string; deadline: string; budget: string; message: string; status: string; createdAt: string }[];
  messages: { id: number; name: string; email: string; message: string; createdAt: string }[];
  allComments: { id: number; postId: number; authorName: string; provider: string; body: string; status: string; createdAt: string }[];
}

async function call(action: string, args: Record<string, unknown>): Promise<any> {
  const res = await fetch(`/api/${action}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${action}`);
  return data;
}

const a = (action: string) => (args: Record<string, unknown> = {}) => call(action, args);

export const api = {
  adminLogin: (args: { email: string; pass: string }) => call("adminLogin", args) as Promise<{ ok: boolean }>,
  adminLogout: () => call("adminLogout", {}) as Promise<{ ok: true }>,
  getSiteData: () => call("getSiteData", {}) as Promise<SiteData>,
  getAdminData: () => call("getAdminData", {}) as Promise<AdminData>,
  saveCategory: a("saveCategory"),
  deleteCategory: a("deleteCategory"),
  saveArtwork: a("saveArtwork"),
  deleteArtwork: a("deleteArtwork"),
  uploadArtworkImage: (args: { dataUrl: string }) => call("uploadArtworkImage", args) as Promise<{ ok: true; url: string; imageAsset: string }>,
  savePrintOption: a("savePrintOption"),
  deletePrintOption: a("deletePrintOption"),
  savePost: a("savePost"),
  deletePost: a("deletePost"),
  submitComment: a("submitComment"),
  moderateComment: a("moderateComment"),
  getPaymentConfig: () => call("getPaymentConfig", {}) as Promise<{ configured: boolean; keyId: string }>,
  getInstagramFeed: () => call("getInstagramFeed", {}) as Promise<{ connected: boolean; posts: { id: string; caption: string; mediaType: string; mediaUrl: string; thumbnailUrl: string; permalink: string; timestamp: string }[]; cachedAt: number; username: string }>,
  getInstagramStatus: () => call("getInstagramStatus", {}) as Promise<{ configured: boolean; connected: boolean; username: string; expiresAt: number; cachedAt: number; postCount: number }>,
  instagramDisconnect: () => call("instagramDisconnect", {}) as Promise<{ ok: true }>,
  createRazorpayOrder: (args: Record<string, unknown>) => call("createRazorpayOrder", args) as Promise<{ ok: true; razorpayOrderId: string; amount: number; currency: string; keyId: string; total: number }>,
  verifyRazorpayPayment: (args: Record<string, unknown>) => call("verifyRazorpayPayment", args) as Promise<{ ok: true; orderId: number }>,
  updateOrder: a("updateOrder"),
  submitCommission: a("submitCommission"),
  updateCommissionStatus: a("updateCommissionStatus"),
  submitContact: a("submitContact"),
  saveTestimonial: a("saveTestimonial"),
  deleteTestimonial: a("deleteTestimonial"),
  saveDiscount: a("saveDiscount"),
  toggleDiscount: a("toggleDiscount"),
  saveSettings: a("saveSettings"),
};

export type ApiResponse<T, K extends keyof T> = T[K] extends (...args: any[]) => Promise<infer R> ? R : never;
export type ApiRequest<T, K extends keyof T> = T[K] extends (args: infer A) => any ? A : never;
