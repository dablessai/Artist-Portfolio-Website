import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import heroImg from "./assets/media-generation-hero-artwork-0-368d2b5b-48a3-43fb-a3c8-a87bc2371ebb.webp";
import charcoalImg from "./assets/media-generation-art-charcoal-0-bd0a3405-48c4-453b-aeec-79e1bd27848a.webp";
import pastelImg from "./assets/media-generation-art-pastel-0-a9327fea-e9ff-43e3-a9a1-3e0315c445f6.webp";
import oilImg from "./assets/media-generation-art-oil-0-e26075f1-ba86-45a5-8ce1-cd39a41c9ed5.webp";
import graphiteImg from "./assets/media-generation-art-graphite-0-16e59de7-779e-483a-aad2-e01899535cc2.webp";
import acrylicImg from "./assets/media-generation-art-acrylic-0-5661ba0a-e17d-4a00-9f3c-c766c5440cc6.webp";
import artistImg from "./assets/deepshikha-artist.webp";
import charcoalDancerImg from "./assets/charcoal-dancer-study.webp";
import charcoalDrapedImg from "./assets/charcoal-draped-figure.webp";
import charcoalPortraitImg from "./assets/charcoal-portrait-pearls.webp";
import charcoalFlowersImg from "./assets/charcoal-figure-flowers.webp";
import charcoalLookImg from "./assets/charcoal-the-look.webp";
import oilBlueWaterImg from "./assets/oil-figure-in-blue-water.webp";
import oilFloralPortraitImg from "./assets/oil-portrait-floral-background.webp";
import oilWhiteDressImg from "./assets/oil-woman-in-white-dress.webp";
import oilGentlemanImg from "./assets/oil-gentleman-portrait-suit.webp";

const ASSETS: Record<string, string> = { hero: heroImg, charcoal: charcoalImg, pastel: pastelImg, oil: oilImg, graphite: graphiteImg, acrylic: acrylicImg, artist: artistImg, charcoalDancer: charcoalDancerImg, charcoalDraped: charcoalDrapedImg, charcoalPortrait: charcoalPortraitImg, charcoalFlowers: charcoalFlowersImg, charcoalLook: charcoalLookImg, oilBlueWater: oilBlueWaterImg, oilFloralPortrait: oilFloralPortraitImg, oilWhiteDress: oilWhiteDressImg, oilGentleman: oilGentlemanImg };
// Uploaded photos are stored as "/uploads/<file>" in the artwork's
// imageAsset and pass through unchanged; bundled ASSETS keys resolve
// exactly as before, and anything unknown still falls back to hero.
const img = (k: string) => (k?.startsWith("/") || k?.startsWith("http://") || k?.startsWith("https://") ? k : ASSETS[k] || heroImg);
const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
;
type Site = ApiResponse<typeof api, "getSiteData">;
type Art = Site["artworks"][number];
type Post = Site["posts"][number];
type Page = "home"|"gallery"|"shop"|"commissions"|"about"|"blog"|"contact"|"admin"|"cart";
type CartItem = { key: string; artworkId: number; printOptionId?: number; title: string; price: number; kind: string; isOriginal: boolean };

const COMMISSION_STEPS = [
  { n: "01", t: "Inquiry", d: "Fill in the commission form. Share your vision, references, and any requirements." },
  { n: "02", t: "Consultation", d: "We'll discuss the concept, size, palette, and timeline over a brief call or email exchange." },
  { n: "03", t: "Concept Sketch", d: "A compositional sketch is shared for approval before any paint is applied to the canvas." },
  { n: "04", t: "Creation", d: "The artwork is painted with progress updates shared at key stages." },
  { n: "05", t: "Delivery", d: "Professional packaging and insured worldwide shipping, with a certificate of authenticity." },
];

function Motif() { return <div className="motif-strip" aria-hidden="true" />; }
function Heading({ children, sub }: { children: ReactNode; sub?: string }) {
  return <div className="text-center mb-6"><h2 className="font-serif-d text-3xl md:text-4xl font-semibold">{children}</h2><div className="flex items-center justify-center gap-2 mt-2"><span className="h-px w-10 bg-[#E9A13B]" /><span className="text-[#C1442E]">◆</span><span className="h-px w-10 bg-[#E9A13B]" /></div>{sub && <p className="text-sm text-[#8A7360] mt-2 max-w-xl mx-auto">{sub}</p>}</div>;
}
function Stars({ n }: { n: number }) { return <span className="text-[#E9A13B]" aria-label={`${n} star rating`}>{"★".repeat(n)}{"☆".repeat(Math.max(0, 5 - n))}</span>; }
function InstagramFeed({ handle }: { handle: string }) {
  const feedQ = useQuery({ queryKey: ["instagram-feed"], queryFn: () => api.getInstagramFeed({}), staleTime: 5 * 60 * 1000 });
  const posts = feedQ.data?.posts ?? [];
  const clean = handle.replace("@", "");
  if (feedQ.isLoading) return <div className="grid grid-cols-3 gap-3 mt-5">{[0, 1, 2].map(i => <div key={i} className="w-full h-28 md:h-40 rounded-xl bg-white/20" />)}</div>;
  if (!posts.length) {
    return <p className="mt-5 text-sm opacity-90">The latest posts will appear here once the feed is connected in Admin → Content &amp; Settings. Meanwhile, follow <a className="underline font-semibold" href={`https://instagram.com/${clean}`} target="_blank" rel="noreferrer">@{clean}</a> on Instagram.</p>;
  }
  return <div className="grid grid-cols-3 gap-3 mt-5">{posts.slice(0, 6).map(p => (
    <a key={p.id} href={p.permalink || `https://instagram.com/${clean}`} target="_blank" rel="noreferrer" title={p.caption || "Instagram post"}>
      <img src={p.thumbnailUrl || p.mediaUrl} alt={p.caption ? p.caption.slice(0, 80) : "Instagram post"} className="w-full h-28 md:h-40 object-cover rounded-xl" loading="lazy" />
    </a>
  ))}</div>;
}

export function App() {
  const qc = useQueryClient();
  const siteQ = useQuery({ queryKey: ["site"], queryFn: () => api.getSiteData({}) });
  const [page, setPage] = useState<Page>("home");
  const [catFilter, setCatFilter] = useState<number | "all">("all");
  const [selectedArt, setSelectedArt] = useState<Art | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [toast, setToast] = useState("");
  const [blogSearch, setBlogSearch] = useState("");
  const [lightbox, setLightbox] = useState(false);

  const site = siteQ.data;
  const settings = site?.settings ?? {};
  const whatsapp = settings["whatsapp"] || "";
  const waLink = (msg: string) => whatsapp ? `https://wa.me/${whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg)}` : null;

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };
  const addToCart = (item: CartItem) => { if (cart.some(c => c.key === item.key)) { notify("Already in your cart — originals are one-of-a-kind."); return; } setCart([...cart, item]); notify("Added to cart ✓"); };
  const goArt = (a: Art) => { setSelectedArt(a); setLightbox(false); window.scrollTo({ top: 0 }); };
  const goPost = (p: Post) => { setSelectedPost(p); window.scrollTo({ top: 0 }); };
  const nav = (p: Page) => { setPage(p); setSelectedArt(null); setSelectedPost(null); window.scrollTo({ top: 0 }); };

  if (siteQ.isPending) return <div className="min-h-screen bg-[#FDF6E9] flex items-center justify-center"><p className="font-serif-d text-2xl">ArtByMukherjee — loading the gallery…</p></div>;
  if (siteQ.error || !site) return <div className="min-h-screen bg-[#FDF6E9] p-8 text-center"><p>Could not load the site.</p><button className="mt-4 bg-[#205E63] text-white px-5 py-2 rounded-full" onClick={() => siteQ.refetch()}>Retry</button></div>;

  const featured = site.artworks.filter(a => a.featured === 1);
  const soldWorks = site.artworks.filter(a => a.status === "Sold");
  const published = site.posts.filter(p => p.status === "Published");
  const shopArts = site.artworks.filter(a => a.status === "Available" && a.price > 0);

  return (
    <div className="min-h-screen bg-[#FDF6E9] text-[#3B2314]">
      <Motif />
      <header className="sticky top-0 z-40 bg-[#FDF6E9]/95 backdrop-blur border-b border-[#EAD9B8] pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button onClick={() => nav("home")} className="text-left" aria-label="ArtByMukherjee home">
            <span className="font-serif-d text-2xl md:text-3xl font-bold leading-none block">Art<span className="text-[#C1442E]">By</span>Mukherjee</span>
            <span className="text-[11px] tracking-[0.2em] uppercase text-[#8A7360]">Deepshikha Mukherjee · Jamshedpur</span>
          </button>
          <nav className="hidden md:flex gap-5 text-sm font-medium" aria-label="Main navigation">
            {(["gallery", "shop", "commissions", "blog", "about", "contact"] as Page[]).map(p => <button key={p} onClick={() => nav(p)} className={`capitalize hover:text-[#C1442E] ${page === p ? "text-[#C1442E] underline underline-offset-4" : ""}`}>{p}</button>)}
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={() => nav("cart")} className="relative bg-[#205E63] text-white px-4 py-2 rounded-full text-sm" aria-label={`Cart, ${cart.length} items`}>🛒 Cart{cart.length > 0 && <span className="ml-1 bg-[#E9A13B] text-[#3B2314] rounded-full px-1.5 text-xs font-bold">{cart.length}</span>}</button>
            <button onClick={() => nav("admin")} className="border border-[#205E63] text-[#205E63] px-3 py-2 rounded-full text-sm" aria-label="Admin login">Admin</button>
          </div>
        </div>
        <nav className="md:hidden flex gap-4 px-4 pb-2 text-sm overflow-x-auto" aria-label="Mobile navigation">
          {(["home", "gallery", "shop", "commissions", "blog", "about", "contact"] as Page[]).map(p => <button key={p} onClick={() => nav(p)} className={`capitalize whitespace-nowrap ${page === p ? "text-[#C1442E] font-semibold" : ""}`}>{p}</button>)}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-24">
        {selectedArt ? (
          <ArtworkDetail art={selectedArt} site={site} onBack={() => setSelectedArt(null)} addToCart={addToCart} waLink={waLink} lightbox={lightbox} setLightbox={setLightbox} notify={notify} />
        ) : selectedPost ? (
          <BlogDetail post={selectedPost} site={site} onBack={() => setSelectedPost(null)} notify={notify} refresh={() => qc.invalidateQueries({ queryKey: ["site"] })} />
        ) : page === "home" ? (
          <>
            <section className="py-8 md:py-12 grid md:grid-cols-2 gap-8 items-center">
              <div>
                <p className="text-xs tracking-[0.25em] uppercase text-[#C1442E] font-semibold">Fine Art · Jamshedpur, India · Ships Worldwide</p>
                <h1 className="font-serif-d text-5xl md:text-6xl font-bold leading-[1.05] mt-3">ArtByMukherjee</h1>
                <p className="font-serif-d text-2xl italic text-[#205E63] mt-2">by Deepshikha Mukherjee</p>
                <p className="mt-4 text-base leading-relaxed">{settings["tagline"] || ""}</p>
                <div className="flex flex-wrap gap-3 mt-6">
                  <button onClick={() => nav("gallery")} className="bg-[#205E63] text-white px-6 py-3 rounded-full font-medium">Explore the Gallery</button>
                  <button onClick={() => nav("commissions")} className="bg-[#C1442E] text-white px-6 py-3 rounded-full font-medium">Commission an Artwork</button>
                </div>
                <p className="text-xs text-[#8A7360] mt-4">Charcoal · Graphite · Soft Pastel · Oil · Acrylic · Portraits</p>
              </div>
              <figure className="border-[10px] border-white shadow-xl rotate-1 bg-white">
                {(() => { const heroKey = settings["heroAsset"] || "oilFloralPortrait"; const heroArt = site.artworks.find(a => a.imageAsset === heroKey); return (<>
                <img src={img(heroKey)} alt={heroArt ? `${heroArt.title} by Deepshikha Mukherjee` : "Artwork by Deepshikha Mukherjee"} className="w-full h-[380px] md:h-[460px] object-cover" />
                <figcaption className="text-center text-xs py-2 text-[#8A7360]">{heroArt ? (heroArt.year ? `${heroArt.title} (${heroArt.year})` : heroArt.title) : "Featured artwork"}</figcaption>
                </>); })()}
              </figure>
            </section>

            <section className="py-6" aria-label="Categories">
              <Heading sub="Every category is managed by the artist — new ones appear here automatically.">Browse by Medium</Heading>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {site.categories.map(c => (
                  <button key={c.id} onClick={() => { setCatFilter(c.id); nav("gallery"); }} className="bg-white rounded-2xl overflow-hidden border border-[#EAD9B8] text-left shadow-sm hover:shadow-md">
                    <img src={img(c.coverAsset)} alt={`${c.name} category`} className="w-full h-32 object-cover" />
                    <span className="block px-4 py-3 font-serif-d text-xl font-semibold">{c.name}</span>
                    <span className="block px-4 pb-3 text-xs text-[#8A7360]">{site.artworks.filter(a => a.categoryId === c.id).length} artwork(s)</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="py-8" aria-label="Featured artworks">
              <Heading>Featured Artworks</Heading>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {featured.map(a => <ArtCard key={a.id} art={a} site={site} onOpen={() => goArt(a)} />)}
              </div>
            </section>

            <section className="py-8 grid md:grid-cols-2 gap-8 items-center bg-[#FFF9EC] border border-[#EAD9B8] rounded-3xl p-6" aria-label="About the artist preview">
              <img src={artistImg} alt="Deepshikha Mukherjee with one of her paintings" className="w-full h-72 object-cover rounded-2xl" />
              <div>
                <h2 className="font-serif-d text-3xl font-semibold">Meet the Artist</h2>
                <p className="mt-3 text-sm leading-relaxed line-clamp-5">{settings["aboutText"] || ""}</p>
                <button onClick={() => nav("about")} className="mt-4 border-2 border-[#205E63] text-[#205E63] px-5 py-2 rounded-full font-medium">Read Her Story</button>
              </div>
            </section>

            {site.testimonials.length > 0 && <section className="py-10" aria-label="Testimonials"><Heading>What Collectors Say</Heading><div className="grid md:grid-cols-3 gap-4">{site.testimonials.map(t => <blockquote key={t.id} className="bg-white border border-[#EAD9B8] rounded-2xl p-5"><Stars n={t.rating} /><p className="text-sm mt-2 leading-relaxed">“{t.text}”</p><footer className="mt-3 text-sm font-semibold">{t.name}{t.place && <span className="text-[#8A7360] font-normal"> · {t.place}</span>}</footer></blockquote>)}</div></section>}

            <section className="py-8 bg-[#205E63] text-white rounded-3xl p-6 md:p-8" aria-label="Instagram">
              <h2 className="font-serif-d text-3xl font-semibold">From Instagram</h2>
              {settings["instagram"] ? <p className="mt-2 text-sm">Follow <a className="underline font-semibold" href={`https://instagram.com/${settings["instagram"].replace("@", "")}`} target="_blank" rel="noreferrer">@{settings["instagram"].replace("@", "")}</a> for studio moments, works in progress and new pieces.</p> : <p className="mt-2 text-sm opacity-90">The artist's Instagram handle will be added in Admin → Settings. Once added, her latest posts will be featured here.</p>}
              {settings["instagram"] ? <InstagramFeed handle={settings["instagram"]} /> : null}
            </section>

            {soldWorks.length > 0 && <section className="py-10" aria-label="Past commissions and sold works"><Heading sub="Sold originals and past commissions — each one-of-a-kind.">Past Commissions & Sold Works</Heading><div className="grid grid-cols-2 lg:grid-cols-4 gap-5">{soldWorks.map(a => <ArtCard key={a.id} art={a} site={site} onOpen={() => goArt(a)} />)}</div></section>}

            {published.length > 0 && <section className="py-6" aria-label="Latest blog posts"><Heading>From the Studio Journal</Heading><div className="grid md:grid-cols-3 gap-4">{published.slice(0, 3).map(p => <PostCard key={p.id} post={p} onOpen={() => goPost(p)} />)}</div></section>}

            <section className="py-10 text-center bg-[#FFF9EC] border-2 border-dashed border-[#E9A13B] rounded-3xl px-6" aria-label="Commission call to action">
              <h2 className="font-serif-d text-3xl md:text-4xl font-semibold">Have a portrait or painting in mind?</h2>
              <p className="text-sm text-[#8A7360] mt-2">Commissions are open — from a first sketch you approve, to insured worldwide delivery.</p>
              <button onClick={() => nav("commissions")} className="mt-5 bg-[#C1442E] text-white px-7 py-3 rounded-full font-medium">Start a Commission</button>
            </section>
          </>
        ) : page === "gallery" ? (
          <GalleryPage site={site} catFilter={catFilter} setCatFilter={setCatFilter} onOpen={goArt} />
        ) : page === "shop" ? (
          <section className="py-8"><Heading sub="Originals are one-of-a-kind — once sold, they move to Sold Works and can never be bought twice. Prints appear only where the artist has enabled them.">The Shop</Heading>
            <ShopFilters site={site} catFilter={catFilter} setCatFilter={setCatFilter} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-4">{shopArts.filter(a => catFilter === "all" || a.categoryId === catFilter).map(a => <ArtCard key={a.id} art={a} site={site} onOpen={() => goArt(a)} showPrice />)}
            </div>
            {shopArts.length === 0 && <p className="text-center text-[#8A7360]">No artworks are currently for sale. Please check back soon.</p>}
          </section>
        ) : page === "commissions" ? (
          <CommissionsPage site={site} notify={notify} />
        ) : page === "about" ? (
          <section className="py-8 max-w-3xl mx-auto">
            <Heading>About the Artist</Heading>
            <img src={artistImg} alt="Deepshikha Mukherjee" className="w-full h-80 object-cover rounded-3xl border-[8px] border-white shadow" />
            <h3 className="font-serif-d text-3xl font-semibold mt-6">Deepshikha Mukherjee</h3>
            <p className="text-sm text-[#C1442E] font-medium">Jamshedpur, Jharkhand, India · Shipping worldwide</p>
            <p className="mt-4 leading-relaxed whitespace-pre-wrap">{settings["aboutText"] || ""}</p>
            <div className="grid sm:grid-cols-3 gap-4 mt-8 text-center">
              {[["Her Process", "Every piece begins with a sketch and a conversation — light, likeness and emotion are built up layer by layer."], ["Mediums", "Charcoal, graphite, soft pastel, oil paint and acrylics — chosen to suit each subject."], ["Exhibitions & Awards", "Exhibition and award details will be shared here soon."]].map(([t, d]) => <div key={t} className="bg-white border border-[#EAD9B8] rounded-2xl p-4"><h4 className="font-serif-d text-xl font-semibold">{t}</h4><p className="text-sm mt-1 text-[#8A7360]">{d}</p></div>)}
            </div>
          </section>
        ) : page === "blog" ? (
          <section className="py-8"><Heading sub="Notes, stories and works in progress from the studio.">Studio Journal — Blog</Heading>
            <div className="max-w-md mx-auto mb-6"><label htmlFor="blog-search" className="sr-only">Search blog posts</label><input id="blog-search" value={blogSearch} onChange={e => setBlogSearch(e.target.value)} placeholder="Search posts…" className="w-full border border-[#EAD9B8] rounded-full px-4 py-2.5 bg-white" /></div>
            <div className="grid md:grid-cols-3 gap-4">{published.filter(p => (p.title + p.excerpt + p.tags).toLowerCase().includes(blogSearch.toLowerCase())).map(p => <PostCard key={p.id} post={p} onOpen={() => goPost(p)} />)}</div>
            {published.length === 0 && <p className="text-center text-[#8A7360]">No posts published yet.</p>}
          </section>
        ) : page === "contact" ? (
          <ContactPage site={site} settings={settings} notify={notify} />
        ) : page === "cart" ? (
          <CartPage cart={cart} setCart={setCart} site={site} notify={notify} onDone={() => { setCart([]); qc.invalidateQueries({ queryKey: ["site"] }); }} />
        ) : (
          <AdminPage site={site} notify={notify} refresh={() => qc.invalidateQueries({ queryKey: ["site"] })} />
        )}
      </main>

      <footer className="border-t border-[#EAD9B8] bg-[#FFF9EC]">
        <Motif />
        <div className="max-w-6xl mx-auto px-4 py-10 grid md:grid-cols-4 gap-8 text-sm">
          <div><p className="font-serif-d text-2xl font-bold">ArtByMukherjee</p><p className="text-[#8A7360] mt-1">Fine art by Deepshikha Mukherjee<br />Jamshedpur, Jharkhand, India</p></div>
          <nav aria-label="Footer links"><p className="font-semibold mb-2">Explore</p>{(["gallery", "shop", "commissions", "blog", "about", "contact"] as Page[]).map(p => <button key={p} onClick={() => nav(p)} className="block capitalize py-0.5 hover:text-[#C1442E]">{p}</button>)}</nav>
          <div><p className="font-semibold mb-2">Categories</p>{site.categories.map(c => <button key={c.id} onClick={() => { setCatFilter(c.id); nav("gallery"); }} className="block py-0.5 hover:text-[#C1442E]">{c.name}</button>)}</div>
          <div><p className="font-semibold mb-2">Connect</p>
            {settings["instagram"] ? <a className="block py-0.5" href={`https://instagram.com/${settings["instagram"].replace("@", "")}`} target="_blank" rel="noreferrer">📷 Instagram @{settings["instagram"].replace("@", "")}</a> : <p className="py-0.5 text-[#8A7360]">📷 Instagram — add in Admin Settings</p>}
            {settings["email"] ? <a className="block py-0.5" href={`mailto:${settings["email"]}`}>✉️ {settings["email"]}</a> : <p className="py-0.5 text-[#8A7360]">✉️ Email — add in Admin Settings</p>}
            {settings["facebook"] ? <a className="block py-0.5" href={settings["facebook"]} target="_blank" rel="noreferrer">📘 Facebook Page</a> : <p className="py-0.5 text-[#8A7360]">📘 Facebook — add in Admin Settings</p>}
            {waLink("Hello! I'm interested in your artwork.") ? <a className="block py-0.5" href={waLink("Hello! I'm interested in your artwork.")!} target="_blank" rel="noreferrer">💬 WhatsApp</a> : <p className="py-0.5 text-[#8A7360]">💬 WhatsApp — add in Admin Settings</p>}
          </div>
        </div>
        <p className="text-center text-xs text-[#8A7360] pb-6">© {new Date().getFullYear()} Deepshikha Mukherjee / ArtByMukherjee. All artworks are original and protected.</p>
      </footer>

      {(() => { const l = waLink(selectedArt ? `Hello, I'm interested in your artwork '${selectedArt.title}'…` : "Hello! I have an enquiry about your artwork."); return l ? <a href={l} target="_blank" rel="noreferrer" aria-label="Enquire on WhatsApp" className="fixed bottom-5 right-5 z-50 bg-[#25D366] text-white shadow-xl rounded-full px-4 py-3 font-semibold text-sm">💬 Enquire on WhatsApp</a> : <button onClick={() => notify("WhatsApp number will be added in Admin → Settings.")} aria-label="Enquire on WhatsApp" className="fixed bottom-5 right-5 z-50 bg-[#25D366] text-white shadow-xl rounded-full px-4 py-3 font-semibold text-sm">💬 Enquire</button>; })()}
      {toast && <div role="status" className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#3B2314] text-white px-5 py-3 rounded-full text-sm shadow-xl">{toast}</div>}
    </div>
  );
}

function ShopFilters({ site, catFilter, setCatFilter }: { site: Site; catFilter: number | "all"; setCatFilter: (v: number | "all") => void }) {
  return <div className="flex flex-wrap gap-2 justify-center" role="group" aria-label="Shop category filter">
    <button onClick={() => setCatFilter("all")} className={`px-4 py-1.5 rounded-full border text-sm ${catFilter === "all" ? "bg-[#C1442E] text-white border-[#C1442E]" : "bg-[#FFF9EC] border-[#E9A13B]"}`}>All</button>
    {site.categories.map(c => <button key={c.id} onClick={() => setCatFilter(c.id)} className={`px-4 py-1.5 rounded-full border text-sm ${catFilter === c.id ? "bg-[#C1442E] text-white border-[#C1442E]" : "bg-[#FFF9EC] border-[#E9A13B]"}`}>{c.name}</button>)}
  </div>;
}

function GalleryPage({ site, catFilter, setCatFilter, onOpen }: { site: Site; catFilter: number | "all"; setCatFilter: (v: number | "all") => void; onOpen: (a: Art) => void }) {
  const list = site.artworks.filter(a => catFilter === "all" || a.categoryId === catFilter);
  return <section className="py-8"><Heading sub="Tap any artwork for its story, size, price and print options.">The Gallery</Heading>
    <ShopFilters site={site} catFilter={catFilter} setCatFilter={setCatFilter} />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">{list.map(a => <ArtCard key={a.id} art={a} site={site} onOpen={() => onOpen(a)} showPrice />)}</div>
    {list.length === 0 && <p className="text-center text-[#8A7360] mt-6">No artworks in this category yet — the artist can add some in Admin.</p>}
  </section>;
}

function ArtCard({ art, site, onOpen, showPrice }: { art: Art; site: Site; onOpen: () => void; showPrice?: boolean }) {
  const cat = site.categories.find(c => c.id === art.categoryId);
  return <article className="bg-white rounded-2xl overflow-hidden border border-[#EAD9B8] shadow-sm text-left">
    <button onClick={onOpen} className="block w-full" aria-label={`View ${art.title}`}>
      <span className="relative block"><img src={img(art.imageAsset)} alt={art.title} className="w-full h-56 object-cover" loading="lazy" />
      {art.status === "Sold" && <span className="absolute top-3 left-3 bg-[#C1442E] text-white text-xs font-bold px-3 py-1 rounded-full">SOLD</span>}
      {art.imageProtection === 1 && <span className="absolute bottom-2 right-3 text-white/70 text-xs font-semibold drop-shadow">ArtByMukherjee</span>}</span>
      <span className="block p-4"><span className="font-serif-d text-xl font-semibold block leading-snug">{art.title}</span>
      <span className="text-xs text-[#8A7360] block mt-1">{cat?.name || ""} · {art.medium} · {art.size}</span>
      {showPrice && art.status === "Available" && art.price > 0 && <span className="text-[#205E63] font-bold block mt-1">{inr(art.price)}</span>}
      {art.status === "Not for Sale" && <span className="text-xs block mt-1">Not for sale</span>}</span>
    </button>
  </article>;
}

function PostCard({ post, onOpen }: { post: Post; onOpen: () => void }) {
  return <article className="bg-white rounded-2xl overflow-hidden border border-[#EAD9B8] text-left">
    <button onClick={onOpen} className="block w-full" aria-label={`Read ${post.title}`}>
      <img src={img(post.coverAsset)} alt={post.title} className="w-full h-40 object-cover" loading="lazy" />
      <span className="block p-4"><span className="text-xs text-[#8A7360]">{new Date(post.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}{post.tags && ` · ${post.tags}`}</span>
      <span className="font-serif-d text-xl font-semibold block mt-1 leading-snug">{post.title}</span>
      <span className="text-sm text-[#8A7360] block mt-1 line-clamp-2">{post.excerpt}</span></span>
    </button>
  </article>;
}

function ShareRow({ title, notify }: { title: string; notify: (m: string) => void }) {
  const text = encodeURIComponent(`Have a look at "${title}" by ArtByMukherjee`);
  return <div className="flex flex-wrap gap-2 mt-4" aria-label="Share">
    <a className="border border-[#EAD9B8] bg-white rounded-full px-3 py-1.5 text-sm" href={`https://wa.me/?text=${text}`} target="_blank" rel="noreferrer">WhatsApp</a>
    <a className="border border-[#EAD9B8] bg-white rounded-full px-3 py-1.5 text-sm" href={`https://www.facebook.com/sharer/sharer.php?u=&quote=${text}`} target="_blank" rel="noreferrer">Facebook</a>
    <a className="border border-[#EAD9B8] bg-white rounded-full px-3 py-1.5 text-sm" href={`https://twitter.com/intent/tweet?text=${text}`} target="_blank" rel="noreferrer">X / Twitter</a>
    <a className="border border-[#EAD9B8] bg-white rounded-full px-3 py-1.5 text-sm" href={`https://pinterest.com/pin/create/button/?description=${text}`} target="_blank" rel="noreferrer">📌 Pinterest Save</a>
    <button className="border border-[#EAD9B8] bg-white rounded-full px-3 py-1.5 text-sm" onClick={() => notify("Link ready to share — copy it from your browser's share menu.")}>Copy Link</button>
  </div>;
}

function ArtworkDetail({ art, site, onBack, addToCart, waLink, lightbox, setLightbox, notify }: { art: Art; site: Site; onBack: () => void; addToCart: (i: CartItem) => void; waLink: (m: string) => string | null; lightbox: boolean; setLightbox: (b: boolean) => void; notify: (m: string) => void }) {
  const cat = site.categories.find(c => c.id === art.categoryId);
  const prints = site.printOptions.filter(p => p.artworkId === art.id);
  const [printId, setPrintId] = useState<number | "original">("original");
  const selPrint = prints.find(p => p.id === printId);
  const l = waLink(`Hello, I'm interested in your artwork '${art.title}'…`);
  return <section className="py-8">
    <button onClick={onBack} className="text-sm text-[#205E63] font-medium">← Back to gallery</button>
    <div className="grid md:grid-cols-2 gap-8 mt-4">
      <div>
        <button onClick={() => setLightbox(true)} className="block w-full" aria-label={`Enlarge ${art.title}`}><img src={img(art.imageAsset)} alt={art.title} className="w-full h-[420px] object-cover rounded-3xl border-[8px] border-white shadow-lg" /></button>
        {art.imageProtection === 1 && <p className="text-xs text-[#8A7360] mt-2">Protected preview — light “ArtByMukherjee” watermark shown; the original is stored at full resolution. Toggle in Admin.</p>}
        <p className="text-xs text-[#8A7360]">Tap image to zoom (lightbox)</p>
      </div>
      <div>
        <p className="text-xs tracking-[0.2em] uppercase text-[#C1442E] font-semibold">{cat?.name} · {art.year}</p>
        <h1 className="font-serif-d text-4xl font-bold mt-1">{art.title}</h1>
        <p className="mt-3 leading-relaxed">{art.description}</p>
        <dl className="grid grid-cols-2 gap-2 mt-4 text-sm bg-white border border-[#EAD9B8] rounded-2xl p-4">
          <div><dt className="text-[#8A7360]">Medium</dt><dd className="font-medium">{art.medium}</dd></div>
          <div><dt className="text-[#8A7360]">Size</dt><dd className="font-medium">{art.size}</dd></div>
          <div><dt className="text-[#8A7360]">Framing</dt><dd className="font-medium">{art.framed}</dd></div>
          <div><dt className="text-[#8A7360]">Status</dt><dd className="font-medium">{art.status}</dd></div>
        </dl>
        {art.status === "Available" && art.price > 0 && <>
          <label htmlFor="buy-option" className="block text-sm font-semibold mt-5">Buy option</label>
          <select id="buy-option" value={String(printId)} onChange={e => setPrintId(e.target.value === "original" ? "original" : Number(e.target.value))} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2.5 bg-white mt-1">
            <option value="original">Original artwork — {inr(art.price)} (one-of-a-kind)</option>
            {art.sellPrints === 1 && prints.map(p => <option key={p.id} value={p.id}>{p.label} · {p.size} — {inr(p.price)}{p.isDigital ? " · Digital download" : ""}</option>)}
          </select>
          {art.sellPrints === 0 && <p className="text-xs text-[#8A7360] mt-1">Prints are not offered for this artwork — the artist enables prints per artwork in Admin.</p>}
          <p className="font-serif-d text-3xl font-bold mt-3">{inr(selPrint ? selPrint.price : art.price)}</p>
          <div className="flex flex-wrap gap-3 mt-3">
            <button onClick={() => addToCart(selPrint ? { key: `print-${selPrint.id}`, artworkId: art.id, printOptionId: selPrint.id, title: `${art.title} — ${selPrint.label}`, price: selPrint.price, kind: "Print", isOriginal: false } : { key: `orig-${art.id}`, artworkId: art.id, title: art.title, price: art.price, kind: "Original", isOriginal: true })} className="bg-[#205E63] text-white px-6 py-3 rounded-full font-medium">Add to Cart</button>
            {l ? <a href={l} target="_blank" rel="noreferrer" className="bg-[#25D366] text-white px-6 py-3 rounded-full font-medium">Enquire on WhatsApp</a> : <button onClick={() => notify("WhatsApp number will be added in Admin → Settings.")} className="border-2 border-[#205E63] text-[#205E63] px-6 py-3 rounded-full font-medium">Enquire</button>}
          </div>
        </>}
        {art.status === "Sold" && <p className="mt-5 bg-[#C1442E]/10 text-[#C1442E] font-semibold rounded-2xl p-4">This original has been sold. You can commission a similar piece — visit the Commissions page.</p>}
        <ShareRow title={art.title} notify={notify} />
      </div>
    </div>
    {lightbox && <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" role="dialog" aria-label="Artwork lightbox"><img src={img(art.imageAsset)} alt={art.title} className="max-h-[85vh] max-w-full object-contain" /><button onClick={() => setLightbox(false)} className="absolute top-5 right-5 bg-white rounded-full px-4 py-2 font-semibold" aria-label="Close lightbox">✕ Close</button></div>}
  </section>;
}

function BlogDetail({ post, site, onBack, notify, refresh }: { post: Post; site: Site; onBack: () => void; notify: (m: string) => void; refresh: () => void }) {
  const approved = site.comments.filter(c => c.postId === post.id && c.status === "Approved");
  const [provider, setProvider] = useState("Google");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [body, setBody] = useState("");
  const mut = useMutation({ mutationFn: () => api.submitComment({ postId: post.id, authorName: name, authorEmail: email, provider, body }), onSuccess: () => { setBody(""); notify("Thank you! Your comment is awaiting approval by the artist."); refresh(); } });
  return <section className="py-8 max-w-3xl mx-auto">
    <button onClick={onBack} className="text-sm text-[#205E63] font-medium">← Back to blog</button>
    <img src={img(post.coverAsset)} alt={post.title} className="w-full h-64 object-cover rounded-3xl mt-4" />
    <p className="text-xs text-[#8A7360] mt-4">{new Date(post.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}{post.tags && ` · ${post.tags}`}</p>
    <h1 className="font-serif-d text-4xl font-bold mt-1">{post.title}</h1>
    <div className="mt-4 leading-relaxed whitespace-pre-wrap">{post.content}</div>
    <ShareRow title={post.title} notify={notify} />
    <div className="mt-10 bg-white border border-[#EAD9B8] rounded-3xl p-5">
      <h2 className="font-serif-d text-2xl font-semibold">Comments ({approved.length})</h2>
      {approved.map(c => <div key={c.id} className="border-b border-[#EAD9B8] py-3"><p className="text-sm font-semibold">{c.authorName} <span className="text-xs font-normal text-[#8A7360]">via {c.provider}</span></p><p className="text-sm mt-1">{c.body}</p></div>)}
      {approved.length === 0 && <p className="text-sm text-[#8A7360] py-2">No approved comments yet — be the first.</p>}
      <h3 className="font-semibold mt-5">Leave a comment</h3>
      <p className="text-xs text-[#8A7360]">Login is required to comment. Comments are visible only after approval from the artist (moderation is ON).</p>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <div><label htmlFor="c-provider" className="text-sm font-medium">Continue with</label><select id="c-provider" value={provider} onChange={e => setProvider(e.target.value)} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1"><option>Google</option><option>Twitter / X</option></select></div>
        <div><label htmlFor="c-name" className="text-sm font-medium">Your name (from {provider} login)</label><input id="c-name" value={name} onChange={e => setName(e.target.value)} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 mt-1" placeholder="e.g. Priya Sharma" /></div>
        <div className="sm:col-span-2"><label htmlFor="c-email" className="text-sm font-medium">{provider === "Google" ? "Gmail address" : "Email for your X account"}</label><input id="c-email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 mt-1" placeholder="you@example.com" /></div>
        <div className="sm:col-span-2"><label htmlFor="c-body" className="text-sm font-medium">Comment</label><textarea id="c-body" value={body} onChange={e => setBody(e.target.value)} rows={3} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 mt-1" placeholder="Share your thoughts…" /></div>
      </div>
      <button disabled={!name || !body || mut.isPending} onClick={() => mut.mutate()} className="mt-3 bg-[#205E63] text-white px-5 py-2.5 rounded-full font-medium disabled:opacity-50">Submit for Approval</button>
      <p className="text-xs text-[#8A7360] mt-2">After submitting: “Your comment is awaiting approval by the artist.” It will appear here only once approved in Admin.</p>
    </div>
  </section>;
}

function CommissionsPage({ site, notify }: { site: Site; notify: (m: string) => void }) {
  const s = site.settings;
  const guide = (s["priceGuide"] || "").split(";").map(r => r.split("|")).filter(r => r.length >= 2);
  const faqs = (s["faqs"] || "").split(";").map(r => r.split("|")).filter(r => r.length >= 2);
  const [f, setF] = useState({ name: "", email: "", whatsapp: "", type: "Portrait", medium: "Oil Paint", size: "", deadline: "", budget: "", message: "" });
  const [done, setDone] = useState(false);
  const mut = useMutation({ mutationFn: () => api.submitCommission(f), onSuccess: () => setDone(true) });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return <section className="py-8">
    <Heading sub="From your idea to a framed original on your wall — here's exactly how it works.">Commission an Artwork</Heading>
    <div className="max-w-2xl mx-auto relative pl-2">
      <div className="absolute left-[34px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-[#E9A13B] via-[#C1442E] to-[#205E63]" aria-hidden="true" />
      {COMMISSION_STEPS.map(st => <div key={st.n} className="flex gap-5 mb-7 relative"><div className="w-16 h-16 shrink-0 rounded-full border-2 border-[#E9A13B] bg-[#FFF9EC] flex items-center justify-center font-serif-d text-2xl font-bold text-[#C1442E] shadow">{st.n}</div><div className="pt-2"><h3 className="font-serif-d text-2xl font-semibold">{st.t}</h3><p className="text-sm mt-1 leading-relaxed">{st.d}</p></div></div>)}
    </div>
    <div className="grid md:grid-cols-2 gap-6 mt-8">
      <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5">
        <h3 className="font-serif-d text-2xl font-semibold">Price Guide</h3>
        <p className="text-xs text-[#8A7360]">Final quote is confirmed during consultation.</p>
        <table className="w-full text-sm mt-3"><tbody>{guide.map((r, i) => <tr key={i} className="border-b border-[#EAD9B8]"><td className="py-2 font-medium pr-3">{r[0]}</td><td className="py-2">{r[1]}</td></tr>)}</tbody></table>
        <p className="text-sm mt-3"><strong>Turnaround:</strong> {s["turnaround"] || ""}</p>
        <h4 className="font-serif-d text-xl font-semibold mt-5">FAQs</h4>
        {faqs.map((r, i) => <div key={i} className="mt-2"><p className="text-sm font-semibold">{r[0]}</p><p className="text-sm text-[#8A7360]">{r[1]}</p></div>)}
      </div>
      <div className="bg-[#FFF9EC] border border-[#EAD9B8] rounded-3xl p-5">
        <h3 className="font-serif-d text-2xl font-semibold">Request a Commission</h3>
        {done ? <div className="mt-4 bg-[#205E63]/10 rounded-2xl p-4"><p className="font-semibold">Thank you! Your commission request has been received.</p><p className="text-sm mt-1">Deepshikha will reach out for a consultation call or email exchange. Your request is also saved in her Admin panel.</p></div> : <>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div><label htmlFor="cm-name" className="text-sm font-medium">Your name *</label><input id="cm-name" value={f.name} onChange={set("name")} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" /></div>
          <div><label htmlFor="cm-email" className="text-sm font-medium">Email *</label><input id="cm-email" value={f.email} onChange={set("email")} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" /></div>
          <div><label htmlFor="cm-wa" className="text-sm font-medium">WhatsApp number</label><input id="cm-wa" value={f.whatsapp} onChange={set("whatsapp")} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" /></div>
          <div><label htmlFor="cm-type" className="text-sm font-medium">Commission type</label><select id="cm-type" value={f.type} onChange={set("type")} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1"><option>Portrait</option><option>Other subject</option></select></div>
          <div><label htmlFor="cm-medium" className="text-sm font-medium">Preferred medium</label><select id="cm-medium" value={f.medium} onChange={set("medium")} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1">{["Charcoal", "Graphite", "Soft Pastel", "Oil Paint", "Acrylics"].map(m => <option key={m}>{m}</option>)}</select></div>
          <div><label htmlFor="cm-size" className="text-sm font-medium">Desired size</label><input id="cm-size" value={f.size} onChange={set("size")} placeholder="e.g. 18 x 24 in" className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" /></div>
          <div><label htmlFor="cm-deadline" className="text-sm font-medium">Deadline (if any)</label><input id="cm-deadline" value={f.deadline} onChange={set("deadline")} placeholder="e.g. By Diwali" className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" /></div>
          <div><label htmlFor="cm-budget" className="text-sm font-medium">Budget range</label><input id="cm-budget" value={f.budget} onChange={set("budget")} placeholder="e.g. ₹20,000 – ₹30,000" className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" /></div>
          <div className="sm:col-span-2"><label htmlFor="cm-msg" className="text-sm font-medium">Your vision / message</label><textarea id="cm-msg" value={f.message} onChange={set("message")} rows={3} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" placeholder="Describe the artwork, share reference details…" /></div>
          <p className="sm:col-span-2 text-xs text-[#8A7360]">Reference photo: mention it in your message and share it on WhatsApp/email during consultation — direct upload will be enabled with storage keys in Settings.</p>
        </div>
        <button disabled={!f.name || !f.email || mut.isPending} onClick={() => mut.mutate()} className="mt-4 bg-[#C1442E] text-white px-6 py-3 rounded-full font-medium disabled:opacity-50">Send Commission Request</button>
        </>}
      </div>
    </div>
    {site.testimonials.length > 0 && <div className="mt-10"><Heading>Commission Stories</Heading><div className="grid md:grid-cols-3 gap-4">{site.testimonials.map(t => <blockquote key={t.id} className="bg-white border border-[#EAD9B8] rounded-2xl p-5"><Stars n={t.rating} /><p className="text-sm mt-2">“{t.text}”</p><footer className="mt-3 text-sm font-semibold">{t.name}{t.place && <span className="text-[#8A7360] font-normal"> · {t.place}</span>}</footer></blockquote>)}</div></div>}
  </section>;
}

function ContactPage({ site, settings, notify }: { site: Site; settings: Record<string, string>; notify: (m: string) => void }) {
  const [f, setF] = useState({ name: "", email: "", message: "" }); const [done, setDone] = useState(false);
  const mut = useMutation({ mutationFn: () => api.submitContact(f), onSuccess: () => setDone(true) });
  const wa = settings["whatsapp"] ? `https://wa.me/${settings["whatsapp"].replace(/[^0-9]/g, "")}` : null;
  return <section className="py-8 max-w-4xl mx-auto"><Heading sub="Questions about an artwork, a commission, or an order — write in.">Get in Touch</Heading>
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5 text-sm space-y-3">
        <p>📍 <strong>Jamshedpur, Jharkhand, India</strong> — shipping worldwide</p>
        {settings["instagram"] ? <p>📷 Instagram: <a className="text-[#205E63] font-medium" href={`https://instagram.com/${settings["instagram"].replace("@", "")}`} target="_blank" rel="noreferrer">@{settings["instagram"].replace("@", "")}</a></p> : <p className="text-[#8A7360]">📷 Instagram — handle to be added in Admin Settings</p>}
        {settings["email"] ? <p>✉️ Email: <a className="text-[#205E63] font-medium" href={`mailto:${settings["email"]}`}>{settings["email"]}</a></p> : <p className="text-[#8A7360]">✉️ Email — to be added in Admin Settings</p>}
        {settings["facebook"] ? <p>📘 <a className="text-[#205E63] font-medium" href={settings["facebook"]} target="_blank" rel="noreferrer">Facebook Page</a></p> : <p className="text-[#8A7360]">📘 Facebook — page link to be added in Admin Settings</p>}
        {wa ? <p>💬 <a className="text-[#205E63] font-medium" href={wa} target="_blank" rel="noreferrer">Chat on WhatsApp</a></p> : <p className="text-[#8A7360]">💬 WhatsApp — number to be added in Admin Settings</p>}
        <p className="text-xs text-[#8A7360]">All four channels are read from Admin → Settings, so the whole site updates the moment the artist adds them.</p>
      </div>
      <div className="bg-[#FFF9EC] border border-[#EAD9B8] rounded-3xl p-5">
        {done ? <p className="font-semibold">Thank you! Your message has been saved and will be emailed to the artist. She usually replies within 2–3 days.</p> : <>
        <div className="space-y-3">
          <div><label htmlFor="ct-name" className="text-sm font-medium">Your name *</label><input id="ct-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" /></div>
          <div><label htmlFor="ct-email" className="text-sm font-medium">Email *</label><input id="ct-email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" /></div>
          <div><label htmlFor="ct-msg" className="text-sm font-medium">Message *</label><textarea id="ct-msg" value={f.message} onChange={e => setF({ ...f, message: e.target.value })} rows={4} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" /></div>
        </div>
        <button disabled={!f.name || !f.email || !f.message || mut.isPending} onClick={() => mut.mutate()} className="mt-4 bg-[#205E63] text-white px-6 py-2.5 rounded-full font-medium disabled:opacity-50">Send Message</button></>}
      </div>
    </div>
  </section>;
}

function CartPage({ cart, setCart, site, notify, onDone }: { cart: CartItem[]; setCart: (c: CartItem[]) => void; site: Site; notify: (m: string) => void; onDone: () => void }) {
  const [f, setF] = useState({ buyerName: "", email: "", phone: "", address: "" });
  const [code, setCode] = useState(""); const [applied, setApplied] = useState<{ code: string; type: string; value: number } | null>(null);
  const [placed, setPlaced] = useState<number | null>(null);
  const [placedTotal, setPlacedTotal] = useState<number>(0);
  const [paying, setPaying] = useState(false);
  const ship = Number(site.settings["shippingCharge"] || 500);
  const subtotal = cart.reduce((s, i) => s + i.price, 0);
  const discount = applied ? (applied.type === "percent" ? Math.round(subtotal * applied.value / 100) : applied.value) : 0;
  const total = Math.max(0, subtotal - discount) + (cart.length ? ship : 0);
  const loadRazorpay = () => new Promise<void>((resolve, reject) => {
    if ((window as any).Razorpay) return resolve();
    const sc = document.createElement("script");
    sc.src = "https://checkout.razorpay.com/v1/checkout.js";
    sc.onload = () => resolve(); sc.onerror = () => reject(new Error("Could not load Razorpay Checkout"));
    document.body.appendChild(sc);
  });
  const pay = async () => {
    if (!f.buyerName || !f.email || !f.address || paying) return;
    setPaying(true);
    try {
      const cfg = await api.getPaymentConfig();
      if (!cfg.configured) { notify("Razorpay test keys are not set on the server yet. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server environment, then try again."); return; }
      const items = cart.map(i => ({ artworkId: i.artworkId, printOptionId: i.printOptionId, kind: i.kind, isOriginal: i.isOriginal }));
      const ord = await api.createRazorpayOrder({ buyerName: f.buyerName, email: f.email, phone: f.phone, address: f.address, items, discountCode: applied?.code || "" });
      await loadRazorpay();
      const rz = new (window as any).Razorpay({
        key: ord.keyId, amount: ord.amount, currency: ord.currency, name: "ArtByMukherjee", description: "Artwork order", order_id: ord.razorpayOrderId,
        prefill: { name: f.buyerName, email: f.email, contact: f.phone },
        handler: async (resp: any) => {
          try {
            const v = await api.verifyRazorpayPayment({ buyerName: f.buyerName, email: f.email, phone: f.phone, address: f.address, items, discountCode: applied?.code || "", razorpayOrderId: resp.razorpay_order_id, razorpayPaymentId: resp.razorpay_payment_id, razorpaySignature: resp.razorpay_signature });
            setPlacedTotal(ord.total); setPlaced(v.orderId); onDone();
          } catch (e: any) { notify(e?.message || "Payment verification failed. No order was created."); }
        },
        modal: { ondismiss: () => { notify("Payment was not completed. Nothing was charged and nothing was marked Sold."); } },
      });
      rz.on("payment.failed", () => notify("Payment failed. Nothing was marked Sold — please try again."));
      rz.open();
    } catch (e: any) { notify(e?.message || "Could not start Razorpay payment."); }
    finally { setPaying(false); }
  };
  if (placed) return <section className="py-10 max-w-xl mx-auto text-center"><div className="bg-white border border-[#EAD9B8] rounded-3xl p-8"><p className="text-5xl">🎉</p><h1 className="font-serif-d text-3xl font-bold mt-3">Order #{placed} Confirmed — Thank You!</h1><p className="text-sm mt-3 leading-relaxed">Payment was verified via Razorpay in <strong>TEST MODE</strong> — no real money moved. An order-confirmation email will be sent to the buyer and a new-order alert to the artist. Originals you bought are now marked <strong>Sold</strong> everywhere. Digital prints are delivered by email download link after payment.</p><p className="text-sm mt-2">Invoice: Order #{placed} · Total paid {inr(placedTotal)} (incl. shipping {inr(ship)}) — print this page as your invoice.</p></div></section>;
  return <section className="py-8 max-w-3xl mx-auto"><Heading>Your Cart & Checkout</Heading>
    {cart.length === 0 ? <p className="text-center text-[#8A7360]">Your cart is empty. Browse the Shop to add an original or a print.</p> : <>
    <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5">
      {cart.map(i => <div key={i.key} className="flex justify-between items-center border-b border-[#EAD9B8] py-3"><div><p className="font-medium">{i.title}</p><p className="text-xs text-[#8A7360]">{i.kind}{i.isOriginal ? " · One-of-a-kind" : ""}</p></div><div className="flex items-center gap-3"><span className="font-bold">{inr(i.price)}</span><button onClick={() => setCart(cart.filter(c => c.key !== i.key))} className="text-[#C1442E] text-sm" aria-label={`Remove ${i.title}`}>Remove</button></div></div>)}
      <div className="flex gap-2 mt-4"><label htmlFor="discount-code" className="sr-only">Discount code</label><input id="discount-code" value={code} onChange={e => setCode(e.target.value)} placeholder="Discount code (try WELCOME10)" className="flex-1 border border-[#EAD9B8] rounded-xl px-3 py-2" /><button onClick={() => { const d = site.discountCodes.find(x => x.code.toUpperCase() === code.trim().toUpperCase() && x.active === 1); if (d) { setApplied(d); notify(`Code applied: ${d.type === "percent" ? d.value + "% off" : inr(d.value) + " off"}`); } else notify("That code isn't valid or has been disabled."); }} className="border-2 border-[#205E63] text-[#205E63] px-4 rounded-xl font-medium">Apply</button></div>
      <dl className="text-sm mt-4 space-y-1"><div className="flex justify-between"><dt>Subtotal</dt><dd>{inr(subtotal)}</dd></div>{discount > 0 && <div className="flex justify-between text-[#205E63]"><dt>Discount ({applied?.code})</dt><dd>− {inr(discount)}</dd></div>}<div className="flex justify-between"><dt>Shipping (shown before payment)</dt><dd>{inr(ship)}</dd></div><div className="flex justify-between font-bold text-base border-t border-[#EAD9B8] pt-2"><dt>Total</dt><dd>{inr(total)}</dd></div></dl>
    </div>
    <div className="bg-[#FFF9EC] border border-[#EAD9B8] rounded-3xl p-5 mt-5">
      <h3 className="font-serif-d text-2xl font-semibold">Delivery & Payment</h3>
      <p className="text-xs bg-[#E9A13B]/20 border border-[#E9A13B] rounded-xl px-3 py-2 mt-2">🔒 Secure checkout via Razorpay in <strong>TEST MODE</strong> — UPI & cards, no real money moves. Keys live only in the server environment, never in Admin Settings or chat. Failed or abandoned payments never mark an artwork as sold.</p>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <div><label htmlFor="co-name" className="text-sm font-medium">Full name *</label><input id="co-name" value={f.buyerName} onChange={e => setF({ ...f, buyerName: e.target.value })} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" /></div>
        <div><label htmlFor="co-email" className="text-sm font-medium">Email *</label><input id="co-email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" /></div>
        <div><label htmlFor="co-phone" className="text-sm font-medium">Phone</label><input id="co-phone" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" /></div>
        <div className="sm:col-span-2"><label htmlFor="co-addr" className="text-sm font-medium">Full delivery address *</label><textarea id="co-addr" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} rows={3} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1" /></div>
      </div>
      <button disabled={!f.buyerName || !f.email || !f.address || paying} onClick={pay} className="mt-4 bg-[#C1442E] text-white px-7 py-3 rounded-full font-medium disabled:opacity-50">{paying ? "Opening Razorpay…" : `Pay ${inr(total)} (Test Mode)`}</button>
    </div></>}
  </section>;
}

function InstagramAdmin({ notify }: { notify: (m: string) => void }) {
  const q = useQuery({ queryKey: ["instagram-status"], queryFn: () => api.getInstagramStatus({}) });
  const st = q.data;
  return <div className="sm:col-span-2 border border-[#EAD9B8] rounded-2xl p-4 mt-4">
    <h3 className="font-semibold">Instagram feed — official connection (Instagram Login, no Facebook Page needed)</h3>
    {!st ? <p className="text-sm text-[#8A7360] mt-1">Loading connection status…</p> : !st.configured ? <p className="text-sm mt-1">Not configured yet on this server: the Meta app ID and Secret must be set in the server environment (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET) and this site's redirect URI registered in the Meta app. The Home feed shows only the profile link until then — no fake posts are shown.</p> : st.connected ? <div className="text-sm mt-1">
      <p>Connected{st.username ? ` as @${st.username}` : ""}{st.postCount ? ` · ${st.postCount} posts cached` : ""}{st.expiresAt ? ` · token expires ${new Date(st.expiresAt).toLocaleDateString()}` : ""}.</p>
      <button onClick={async () => { await api.instagramDisconnect({}); q.refetch(); notify("Instagram disconnected."); }} className="mt-2 border-2 border-[#205E63] text-[#205E63] px-4 py-1.5 rounded-full text-sm">Disconnect Instagram</button>
    </div> : <div className="text-sm mt-1">
      <p>Not connected yet. Clicking Connect opens Instagram login — the artist logs in with her Instagram account herself. The token is stored server-side only, never shown here.</p>
      <a href="/api/instagram/start" className="inline-block mt-2 bg-[#205E63] text-white px-4 py-1.5 rounded-full text-sm">Connect Instagram</a>
      <p className="text-xs text-[#8A7360] mt-2">Note: Instagram requires an HTTPS redirect URI, so authorisation works once the domain (artbymukherjee.in) is live over HTTPS — not from the plain IP address over HTTP.</p>
    </div>}
  </div>;
}
function AdminPage({ site, notify, refresh }: { site: Site; notify: (m: string) => void; refresh: () => void }) {
  const [logged, setLogged] = useState(() => sessionStorage.getItem("abm-admin") === "1");
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [tab, setTab] = useState("Artworks");
  const adminQ = useQuery({ queryKey: ["admin"], queryFn: () => api.getAdminData({}), enabled: logged });
  const inv = () => { refresh(); adminQ.refetch(); };
  const M = (fn: () => Promise<unknown>) => ({ mutationFn: fn, onSuccess: () => { notify("Saved ✓ — the public site is updated."); inv(); } });
  const saveCat = useMutation(M(() => api.saveCategory({ name: newCat, coverAsset: "hero" })));
  const [newCat, setNewCat] = useState("");
  const blankArtF = { title: "", categoryId: 1, medium: "Oil Paint", size: "", year: "2025", price: 0, framed: "Unframed", status: "Available", description: "", featured: 0, imageAsset: "hero", sellPrints: 0, imageProtection: 1 };
  const [artF, setArtF] = useState(blankArtF);
  const [editingArtworkId, setEditingArtworkId] = useState<number | null>(null);
  const saveArt = useMutation({ mutationFn: () => api.saveArtwork({ ...(editingArtworkId ? { id: editingArtworkId } : {}), ...artF }), onSuccess: () => { notify("Saved ✓ — the public site is updated."); inv(); setArtF(blankArtF); setUploadPreview(null); setEditingArtworkId(null); } });
  // Admin photo upload: pick a file, preview it, upload it, then Save
  // Artwork attaches the returned /uploads/... URL. The dropdown below
  // stays as the fallback for built-in images.
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const onUploadFile = (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { notify("Please choose a JPEG, PNG or WebP photo."); return; }
    if (file.size > 5 * 1024 * 1024) { notify("That photo is over 5 MB — please choose a smaller one."); return; }
    const r = new FileReader();
    r.onload = () => setUploadPreview(String(r.result || ""));
    r.readAsDataURL(file);
  };
  const uploadPhoto = async () => {
    if (!uploadPreview) return;
    setUploading(true);
    try {
      const res = await api.uploadArtworkImage({ dataUrl: uploadPreview });
      setArtF({ ...artF, imageAsset: res.url });
      notify("Photo uploaded ✓ — now press Save Artwork to attach it.");
    } catch (e: any) { notify(e?.message || "Photo upload failed. Try again."); }
    finally { setUploading(false); }
  };
  const delArt = useMutation(M(() => Promise.resolve()));
  const [postF, setPostF] = useState({ title: "", excerpt: "", content: "", coverAsset: "pastel", tags: "", status: "Published" });
  const savePost = useMutation(M(() => api.savePost({ ...postF })));
  const mod = useMutation({ mutationFn: (v: { id: number; status: string }) => api.moderateComment({ ...v }), onSuccess: () => { notify("Comment updated ✓"); inv(); } });
  const [settingsF, setSettingsF] = useState<Record<string, string> | null>(null);
  const sf = settingsF ?? { ...site.settings, ...((adminQ.data as any)?.adminSettings ?? {}) };
  const saveSettings = useMutation(M(() => api.saveSettings({ entries: Object.entries(sf).map(([key, value]) => ({ key, value })) })));
  const [testF, setTestF] = useState({ name: "", place: "", text: "", rating: 5 });
  const [editingTestId, setEditingTestId] = useState<number | null>(null);
  const saveTest = useMutation({ mutationFn: () => api.saveTestimonial({ ...(editingTestId ? { id: editingTestId } : {}), ...testF }), onSuccess: () => { notify("Saved ✓ — the public site is updated."); inv(); setTestF({ name: "", place: "", text: "", rating: 5 }); setEditingTestId(null); } });
  const [discF, setDiscF] = useState({ code: "", type: "percent", value: 10, expiry: "" });
  const saveDisc = useMutation(M(() => api.saveDiscount({ ...discF })));
  const [printF, setPrintF] = useState({ artworkId: 1, label: "A3 Print", size: "A3", price: 2000, isDigital: 0 });
  const savePrint = useMutation(M(() => api.savePrintOption({ ...printF })));
  const updOrder = useMutation({ mutationFn: (v: { id: number; orderStatus: string; courier: string; tracking: string }) => api.updateOrder({ ...v }), onSuccess: () => { notify("Order updated — buyer will be emailed the shipping update ✓"); inv(); } });
  const updComm = useMutation({ mutationFn: (v: { id: number; status: string }) => api.updateCommissionStatus({ ...v }), onSuccess: () => inv() });

  if (!logged) return <section className="py-12 max-w-md mx-auto"><div className="bg-white border border-[#EAD9B8] rounded-3xl p-6">
    <h1 className="font-serif-d text-3xl font-bold text-center">Artist Admin Login</h1>
    <p className="text-sm text-[#8A7360] text-center mt-1">Single admin account for Deepshikha — manage artworks, blog, orders, comments & settings.</p>
    <p className="text-xs bg-[#E9A13B]/15 border border-[#E9A13B] rounded-xl p-3 mt-4">Use the admin email and password set at setup. Change the password any time in Admin → Content &amp; Settings.</p>
    <div className="space-y-3 mt-4">
      <div><label htmlFor="ad-email" className="text-sm font-medium">Admin email</label><input id="ad-email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 mt-1" /></div>
      <div><label htmlFor="ad-pass" className="text-sm font-medium">Password</label><input id="ad-pass" type="password" value={pass} onChange={e => setPass(e.target.value)} className="w-full border border-[#EAD9B8] rounded-xl px-3 py-2 mt-1" /></div>
    </div>
    <button onClick={async () => { try { const r = await api.adminLogin({ email, pass }); if (r.ok) { sessionStorage.setItem("abm-admin", "1"); setLogged(true); } else notify("Incorrect email or password."); } catch (e: any) { notify(e?.message || "Login failed. Try again."); } }} className="w-full mt-4 bg-[#205E63] text-white py-3 rounded-full font-medium">Log In to Admin</button>
  </div></section>;

  const tabs = ["Artworks", "Categories", "Blog", "Comments", "Orders", "Commissions", "Messages", "Testimonials", "Discounts", "Content & Settings"];
  const allComments = adminQ.data?.allComments ?? site.comments;
  const pending = allComments.filter(c => c.status === "Pending");
  const inp = "w-full border border-[#EAD9B8] rounded-xl px-3 py-2 bg-white mt-1 text-sm";
  const lbl = "text-sm font-medium";
  return <section className="py-8">
    <div className="flex items-center justify-between flex-wrap gap-3"><h1 className="font-serif-d text-3xl font-bold">Admin Panel</h1><button onClick={() => { sessionStorage.removeItem("abm-admin"); api.adminLogout({}).catch(() => {}); setLogged(false); }} className="text-sm border border-[#C1442E] text-[#C1442E] px-4 py-1.5 rounded-full">Log Out</button></div>
    <p className="text-sm text-[#8A7360] mt-1">Every change here goes live on the public site immediately. {pending.length > 0 && <strong className="text-[#C1442E]">{pending.length} comment(s) awaiting approval.</strong>}</p>
    <div className="flex gap-2 flex-wrap mt-4" role="tablist" aria-label="Admin sections">{tabs.map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-3.5 py-1.5 rounded-full border text-sm ${tab === t ? "bg-[#205E63] text-white border-[#205E63]" : "bg-white border-[#E9A13B]"}`}>{t}{t === "Comments" && pending.length > 0 ? ` (${pending.length})` : ""}</button>)}</div>

    {tab === "Categories" && <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5 mt-5">
      <h2 className="font-serif-d text-2xl font-semibold">Gallery Categories</h2><p className="text-sm text-[#8A7360]">Add a category and it appears instantly in Gallery filters, Home tiles, Shop filter, footer and the artwork form. A category with artworks must have them moved first.</p>
      <div className="flex gap-2 mt-3"><label htmlFor="new-cat" className="sr-only">New category name</label><input id="new-cat" value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="e.g. Watercolour" className="flex-1 border border-[#EAD9B8] rounded-xl px-3 py-2" /><button disabled={!newCat} onClick={() => { saveCat.mutate(); setNewCat(""); }} className="bg-[#205E63] text-white px-5 rounded-xl font-medium disabled:opacity-50">Add Category</button></div>
      <ul className="mt-4 space-y-2">{site.categories.map(c => { const count = site.artworks.filter(a => a.categoryId === c.id).length; return <li key={c.id} className="flex justify-between items-center border-b border-[#EAD9B8] py-2 text-sm"><span><strong>{c.name}</strong> · {count} artwork(s)</span><button onClick={async () => { if (count > 0) { const others = site.categories.filter(x => x.id !== c.id); if (!others[0]) { notify("Create another category first to move artworks into."); return; } await api.deleteCategory({ id: c.id, moveToId: others[0].id }); notify(`Artworks moved to ${others[0].name} and category deleted.`); inv(); } else { await api.deleteCategory({ id: c.id }); inv(); } }} className="text-[#C1442E]" aria-label={`Delete category ${c.name}`}>Delete</button></li>; })}</ul>
    </div>}

    {tab === "Artworks" && <div className="grid lg:grid-cols-2 gap-5 mt-5">
      <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5">
        <h2 className="font-serif-d text-2xl font-semibold">{editingArtworkId ? "Edit Artwork" : "Add Artwork"}</h2>{editingArtworkId && <p className="text-sm text-[#8A7360] mt-1">Editing an existing artwork — saving updates it in place, it does not create a copy.</p>}
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div className="sm:col-span-2"><label className={lbl} htmlFor="af-title">Title</label><input id="af-title" value={artF.title} onChange={e => setArtF({ ...artF, title: e.target.value })} className={inp} /></div>
          <div><label className={lbl} htmlFor="af-cat">Category</label><select id="af-cat" value={artF.categoryId} onChange={e => setArtF({ ...artF, categoryId: Number(e.target.value) })} className={inp}>{site.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className={lbl} htmlFor="af-img">Image</label><select id="af-img" value={artF.imageAsset} onChange={e => { setArtF({ ...artF, imageAsset: e.target.value }); setUploadPreview(null); }} className={inp}>{artF.imageAsset.startsWith("/") && <option value={artF.imageAsset}>Uploaded photo (current)</option>}{Object.keys(ASSETS).map(k => <option key={k} value={k}>{k}</option>)}</select></div>
          <div className="sm:col-span-2 border border-dashed border-[#E9A13B] rounded-xl p-3">
            <label className={lbl} htmlFor="af-upload">Upload new photo</label>
            <input id="af-upload" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => onUploadFile(e.target.files?.[0])} className="block mt-1 text-sm" />
            <p className="text-xs text-[#8A7360] mt-1">JPEG, PNG or WebP, max 5 MB. Pick a photo, preview it below, press Upload Photo, then Save Artwork. The dropdown above still works for built-in images.</p>
            {(uploadPreview || artF.imageAsset.startsWith("/")) && <img src={uploadPreview || img(artF.imageAsset)} alt="Photo preview" className="mt-2 max-h-48 rounded-xl object-cover" />}
            <button disabled={!uploadPreview || uploading} onClick={uploadPhoto} className="mt-2 border-2 border-[#205E63] text-[#205E63] px-5 py-1.5 rounded-full text-sm font-medium disabled:opacity-50">{uploading ? "Uploading…" : "Upload Photo"}</button>
            {artF.imageAsset.startsWith("/") && !uploadPreview && <p className="text-xs text-[#205E63] mt-1">Using uploaded photo: {artF.imageAsset}</p>}
          </div>
          <div><label className={lbl} htmlFor="af-medium">Medium</label><input id="af-medium" value={artF.medium} onChange={e => setArtF({ ...artF, medium: e.target.value })} className={inp} /></div>
          <div><label className={lbl} htmlFor="af-size">Size</label><input id="af-size" value={artF.size} onChange={e => setArtF({ ...artF, size: e.target.value })} className={inp} /></div>
          <div><label className={lbl} htmlFor="af-year">Year</label><input id="af-year" value={artF.year} onChange={e => setArtF({ ...artF, year: e.target.value })} className={inp} /></div>
          <div><label className={lbl} htmlFor="af-price">Price (₹, 0 = not priced)</label><input id="af-price" type="number" value={artF.price} onChange={e => setArtF({ ...artF, price: Number(e.target.value) })} className={inp} /></div>
          <div><label className={lbl} htmlFor="af-framed">Framed</label><select id="af-framed" value={artF.framed} onChange={e => setArtF({ ...artF, framed: e.target.value })} className={inp}><option>Framed</option><option>Unframed</option></select></div>
          <div><label className={lbl} htmlFor="af-status">Status</label><select id="af-status" value={artF.status} onChange={e => setArtF({ ...artF, status: e.target.value })} className={inp}><option>Available</option><option>Sold</option><option>Not for Sale</option></select></div>
          <div className="sm:col-span-2"><label className={lbl} htmlFor="af-desc">Description</label><textarea id="af-desc" value={artF.description} onChange={e => setArtF({ ...artF, description: e.target.value })} rows={2} className={inp} /></div>
          <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={artF.featured === 1} onChange={e => setArtF({ ...artF, featured: e.target.checked ? 1 : 0 })} /> Featured on Home</label>
          <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={artF.imageProtection === 1} onChange={e => setArtF({ ...artF, imageProtection: e.target.checked ? 1 : 0 })} /> Image protection (watermark)</label>
          <label className="text-sm flex gap-2 items-center sm:col-span-2"><input type="checkbox" checked={artF.sellPrints === 1} onChange={e => setArtF({ ...artF, sellPrints: e.target.checked ? 1 : 0 })} /> <strong>Sell prints of this artwork</strong>&nbsp;(OFF by default — prints appear only if you turn this ON and add print options below)</label>
        </div>
        <button disabled={!artF.title} onClick={() => saveArt.mutate()} className="mt-4 bg-[#205E63] text-white px-6 py-2.5 rounded-full font-medium disabled:opacity-50">{editingArtworkId ? "Update Artwork" : "Save Artwork"}</button>{editingArtworkId && <button onClick={() => { setArtF(blankArtF); setUploadPreview(null); setEditingArtworkId(null); }} className="mt-4 ml-3 border-2 border-[#205E63] text-[#205E63] px-6 py-2 rounded-full font-medium">Cancel</button>}
        <div className="border-t border-[#EAD9B8] mt-5 pt-4">
          <h3 className="font-semibold">Print options (only for artworks with prints ON)</h3>
          <div className="grid sm:grid-cols-2 gap-3 mt-2">
            <div><label className={lbl} htmlFor="pf-art">Artwork</label><select id="pf-art" value={printF.artworkId} onChange={e => setPrintF({ ...printF, artworkId: Number(e.target.value) })} className={inp}>{site.artworks.map(a => <option key={a.id} value={a.id}>{a.title}{a.sellPrints ? "" : " (prints OFF)"}</option>)}</select></div>
            <div><label className={lbl} htmlFor="pf-label">Label</label><input id="pf-label" value={printF.label} onChange={e => setPrintF({ ...printF, label: e.target.value })} className={inp} /></div>
            <div><label className={lbl} htmlFor="pf-size">Size</label><input id="pf-size" value={printF.size} onChange={e => setPrintF({ ...printF, size: e.target.value })} className={inp} /></div>
            <div><label className={lbl} htmlFor="pf-price">Price (₹)</label><input id="pf-price" type="number" value={printF.price} onChange={e => setPrintF({ ...printF, price: Number(e.target.value) })} className={inp} /></div>
            <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={printF.isDigital === 1} onChange={e => setPrintF({ ...printF, isDigital: e.target.checked ? 1 : 0 })} /> Digital print (delivered by email download)</label>
          </div>
          <button onClick={() => savePrint.mutate()} className="mt-3 border-2 border-[#205E63] text-[#205E63] px-5 py-2 rounded-full font-medium">Add Print Option</button>
          <ul className="text-sm mt-3 space-y-1">{site.printOptions.map(p => <li key={p.id} className="flex justify-between border-b border-[#EAD9B8] py-1"><span>{site.artworks.find(a => a.id === p.artworkId)?.title} — {p.label} ({p.size}) {inr(p.price)}{p.isDigital ? " · Digital" : ""}</span><button className="text-[#C1442E]" aria-label={`Delete print ${p.label}`} onClick={async () => { await api.deletePrintOption({ id: p.id }); inv(); }}>Delete</button></li>)}</ul>
        </div>
      </div>
      <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5">
        <h2 className="font-serif-d text-2xl font-semibold">All Artworks</h2>
        <ul className="mt-3 space-y-2">{site.artworks.map(a => <li key={a.id} className="flex justify-between gap-2 border-b border-[#EAD9B8] py-2 text-sm"><span><strong>{a.title}</strong><br /><span className="text-[#8A7360]">{a.status} · {inr(a.price)} · Prints {a.sellPrints ? "ON" : "OFF"}</span></span><span className="flex gap-2 shrink-0"><button className="text-[#205E63]" onClick={() => { setUploadPreview(null); setEditingArtworkId(a.id); setArtF({ title: a.title, categoryId: a.categoryId, medium: a.medium, size: a.size, year: a.year, price: a.price, framed: a.framed, status: a.status, description: a.description, featured: a.featured, imageAsset: a.imageAsset, sellPrints: a.sellPrints, imageProtection: a.imageProtection }); }} aria-label={`Edit ${a.title}`}>Edit</button><button className="text-[#C1442E]" onClick={async () => { await api.deleteArtwork({ id: a.id }); inv(); }} aria-label={`Delete ${a.title}`}>Delete</button></span></li>)}</ul>
      </div>
    </div>}

    {tab === "Blog" && <div className="grid lg:grid-cols-2 gap-5 mt-5">
      <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5"><h2 className="font-serif-d text-2xl font-semibold">Write a Post</h2>
        <div className="space-y-3 mt-3">
          <div><label className={lbl} htmlFor="bf-title">Title</label><input id="bf-title" value={postF.title} onChange={e => setPostF({ ...postF, title: e.target.value })} className={inp} /></div>
          <div><label className={lbl} htmlFor="bf-excerpt">Excerpt</label><input id="bf-excerpt" value={postF.excerpt} onChange={e => setPostF({ ...postF, excerpt: e.target.value })} className={inp} /></div>
          <div><label className={lbl} htmlFor="bf-content">Content</label><textarea id="bf-content" value={postF.content} onChange={e => setPostF({ ...postF, content: e.target.value })} rows={6} className={inp} /></div>
          <div className="grid grid-cols-3 gap-3"><div><label className={lbl} htmlFor="bf-cover">Cover</label><select id="bf-cover" value={postF.coverAsset} onChange={e => setPostF({ ...postF, coverAsset: e.target.value })} className={inp}>{Object.keys(ASSETS).map(k => <option key={k}>{k}</option>)}</select></div><div><label className={lbl} htmlFor="bf-tags">Tags</label><input id="bf-tags" value={postF.tags} onChange={e => setPostF({ ...postF, tags: e.target.value })} className={inp} /></div><div><label className={lbl} htmlFor="bf-status">Status</label><select id="bf-status" value={postF.status} onChange={e => setPostF({ ...postF, status: e.target.value })} className={inp}><option>Published</option><option>Draft</option><option>Scheduled</option></select></div></div>
        </div>
        <button disabled={!postF.title} onClick={() => savePost.mutate()} className="mt-4 bg-[#205E63] text-white px-6 py-2.5 rounded-full font-medium disabled:opacity-50">Save Post</button>
      </div>
      <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5"><h2 className="font-serif-d text-2xl font-semibold">Posts</h2><ul className="mt-3 space-y-2">{site.posts.map(p => <li key={p.id} className="flex justify-between border-b border-[#EAD9B8] py-2 text-sm"><span><strong>{p.title}</strong> · {p.status}</span><button className="text-[#C1442E]" onClick={async () => { await api.deletePost({ id: p.id }); inv(); }} aria-label={`Delete post ${p.title}`}>Delete</button></li>)}</ul></div>
    </div>}

    {tab === "Comments" && <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5 mt-5"><h2 className="font-serif-d text-2xl font-semibold">Comment Moderation Queue</h2><p className="text-sm text-[#8A7360]">Nothing is public until you approve it here.</p>
      {allComments.length === 0 && <p className="text-sm mt-3">No comments yet.</p>}
      {allComments.map(c => <div key={c.id} className="border-b border-[#EAD9B8] py-3 flex flex-wrap justify-between gap-3"><div className="text-sm"><p><strong>{c.authorName}</strong> <span className="text-[#8A7360]">via {c.provider} · on “{site.posts.find(p => p.id === c.postId)?.title || "post"}” · {c.status}</span></p><p className="mt-1">{c.body}</p></div><div className="flex gap-2">{c.status !== "Approved" && <button onClick={() => mod.mutate({ id: c.id, status: "Approved" })} className="bg-[#205E63] text-white px-4 py-1.5 rounded-full text-sm" aria-label={`Approve comment by ${c.authorName}`}>Approve</button>}<button onClick={() => mod.mutate({ id: c.id, status: "Rejected" })} className="border border-[#C1442E] text-[#C1442E] px-4 py-1.5 rounded-full text-sm" aria-label={`Reject comment by ${c.authorName}`}>Reject</button><button onClick={() => mod.mutate({ id: c.id, status: "Deleted" })} className="text-[#C1442E] text-sm" aria-label={`Delete comment by ${c.authorName}`}>Delete</button></div></div>)}
    </div>}

    {tab === "Orders" && <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5 mt-5"><h2 className="font-serif-d text-2xl font-semibold">Store Orders</h2>
      {(adminQ.data?.orders ?? []).map(o => <OrderRow key={o.id} o={o} onSave={(v) => updOrder.mutate(v)} />)}
      {(adminQ.data?.orders ?? []).length === 0 && <p className="text-sm mt-3">No orders yet. Orders from the Shop checkout will appear here with buyer details, payment status and address.</p>}
    </div>}

    {tab === "Commissions" && <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5 mt-5"><h2 className="font-serif-d text-2xl font-semibold">Commission Requests</h2>
      {(adminQ.data?.commissions ?? []).map(c => <div key={c.id} className="border-b border-[#EAD9B8] py-3 text-sm flex flex-wrap justify-between gap-3"><div><p><strong>{c.name}</strong> · {c.email} · {c.whatsapp}</p><p className="text-[#8A7360]">{c.type} · {c.medium} · {c.size} · Deadline: {c.deadline || "—"} · Budget: {c.budget || "—"}</p><p className="mt-1">{c.message}</p></div><label className="text-sm">Status <select aria-label={`Status for commission by ${c.name}`} value={c.status} onChange={e => updComm.mutate({ id: c.id, status: e.target.value })} className="border border-[#EAD9B8] rounded-lg px-2 py-1 ml-1"><option>New</option><option>In Discussion</option><option>Completed</option></select></label></div>)}
      {(adminQ.data?.commissions ?? []).length === 0 && <p className="text-sm mt-3">No commission requests yet.</p>}
    </div>}

    {tab === "Messages" && <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5 mt-5"><h2 className="font-serif-d text-2xl font-semibold">Contact Messages</h2>
      {(adminQ.data?.messages ?? []).map(m => <div key={m.id} className="border-b border-[#EAD9B8] py-3 text-sm"><p><strong>{m.name}</strong> · {m.email}</p><p className="mt-1">{m.message}</p></div>)}
      {(adminQ.data?.messages ?? []).length === 0 && <p className="text-sm mt-3">No contact messages yet.</p>}
    </div>}

    {tab === "Testimonials" && <div className="grid lg:grid-cols-2 gap-5 mt-5">
      <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5"><h2 className="font-serif-d text-2xl font-semibold">{editingTestId ? "Edit Testimonial" : "Add Testimonial"}</h2>{editingTestId && <p className="text-sm text-[#8A7360] mt-1">Editing an existing testimonial — saving updates it in place, it does not create a copy.</p>}
        <div className="space-y-3 mt-3"><div><label className={lbl} htmlFor="tf-name">Client name</label><input id="tf-name" value={testF.name} onChange={e => setTestF({ ...testF, name: e.target.value })} className={inp} /></div><div><label className={lbl} htmlFor="tf-place">Place</label><input id="tf-place" value={testF.place} onChange={e => setTestF({ ...testF, place: e.target.value })} className={inp} /></div><div><label className={lbl} htmlFor="tf-text">Quote</label><textarea id="tf-text" value={testF.text} onChange={e => setTestF({ ...testF, text: e.target.value })} rows={3} className={inp} /></div><div><label className={lbl} htmlFor="tf-rating">Rating (1–5)</label><input id="tf-rating" type="number" min={1} max={5} value={testF.rating} onChange={e => setTestF({ ...testF, rating: Number(e.target.value) })} className={inp} /></div></div>
        <button disabled={!testF.name || !testF.text} onClick={() => saveTest.mutate()} className="mt-4 bg-[#205E63] text-white px-6 py-2.5 rounded-full font-medium disabled:opacity-50">{editingTestId ? "Update Testimonial" : "Save Testimonial"}</button>{editingTestId && <button onClick={() => { setTestF({ name: "", place: "", text: "", rating: 5 }); setEditingTestId(null); }} className="mt-4 ml-3 border-2 border-[#205E63] text-[#205E63] px-6 py-2 rounded-full font-medium">Cancel</button>}</div>
      <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5"><h2 className="font-serif-d text-2xl font-semibold">All Testimonials</h2><ul className="mt-3 space-y-2">{site.testimonials.map(t => <li key={t.id} className="flex justify-between border-b border-[#EAD9B8] py-2 text-sm"><span><strong>{t.name}</strong> — {t.text.slice(0, 60)}…</span><span className="flex gap-3"><button className="text-[#205E63]" onClick={() => { setTestF({ name: t.name, place: t.place, text: t.text, rating: t.rating }); setEditingTestId(t.id); }} aria-label={`Edit testimonial by ${t.name}`}>Edit</button><button className="text-[#C1442E]" onClick={async () => { await api.deleteTestimonial({ id: t.id }); inv(); }} aria-label={`Delete testimonial by ${t.name}`}>Delete</button></span></li>)}</ul></div>
    </div>}

    {tab === "Discounts" && <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5 mt-5"><h2 className="font-serif-d text-2xl font-semibold">Discount Codes</h2>
      <div className="grid sm:grid-cols-4 gap-3 mt-3"><div><label className={lbl} htmlFor="df-code">Code</label><input id="df-code" value={discF.code} onChange={e => setDiscF({ ...discF, code: e.target.value })} className={inp} /></div><div><label className={lbl} htmlFor="df-type">Type</label><select id="df-type" value={discF.type} onChange={e => setDiscF({ ...discF, type: e.target.value })} className={inp}><option value="percent">Percent %</option><option value="fixed">Fixed ₹</option></select></div><div><label className={lbl} htmlFor="df-value">Value</label><input id="df-value" type="number" value={discF.value} onChange={e => setDiscF({ ...discF, value: Number(e.target.value) })} className={inp} /></div><div><label className={lbl} htmlFor="df-expiry">Expiry (optional)</label><input id="df-expiry" value={discF.expiry} onChange={e => setDiscF({ ...discF, expiry: e.target.value })} className={inp} /></div></div>
      <button disabled={!discF.code} onClick={() => saveDisc.mutate()} className="mt-3 bg-[#205E63] text-white px-5 py-2 rounded-full font-medium disabled:opacity-50">Create Code</button>
      <ul className="mt-4 space-y-2">{site.discountCodes.map(d => <li key={d.id} className="flex justify-between border-b border-[#EAD9B8] py-2 text-sm"><span><strong>{d.code}</strong> · {d.type === "percent" ? d.value + "%" : inr(d.value)} off · {d.active ? "Active" : "Disabled"}</span><button className="text-[#205E63]" onClick={async () => { await api.toggleDiscount({ id: d.id, active: d.active ? 0 : 1 }); inv(); }} aria-label={`Toggle discount ${d.code}`}>{d.active ? "Disable" : "Enable"}</button></li>)}</ul>
    </div>}

    {tab === "Content & Settings" && <div className="bg-white border border-[#EAD9B8] rounded-3xl p-5 mt-5"><h2 className="font-serif-d text-2xl font-semibold">Editable Content & Settings</h2><p className="text-sm text-[#8A7360]">Everything the site reads from — contact channels, tagline, About, price guide, FAQs, shipping and gateway — lives here. No rebuild needed.</p>
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        {([["tagline", "Hero tagline"], ["instagram", "Instagram handle (without @)"], ["email", "Contact email"], ["facebook", "Facebook page URL"], ["whatsapp", "WhatsApp number (with country code, digits)"], ["shippingCharge", "Shipping charge (₹)"], ["gatewayMode", "Payment gateway (test/live keys note)"], ["adminEmail", "Admin login email"], ["adminPass", "Admin password"]] as [string, string][]).map(([k, label]) => <div key={k}><label className={lbl} htmlFor={`sf-${k}`}>{label}</label><input id={`sf-${k}`} value={sf[k] || ""} onChange={e => setSettingsF({ ...sf, [k]: e.target.value })} className={inp} /></div>)}
        <div className="sm:col-span-2"><label className={lbl} htmlFor="sf-hero">Hero banner image (top of Home page) — pick any artwork; changing this needs no rebuild</label><select id="sf-hero" value={sf["heroAsset"] || "oilFloralPortrait"} onChange={e => setSettingsF({ ...sf, heroAsset: e.target.value })} className={inp}>{site.artworks.map(a => <option key={a.id} value={a.imageAsset}>{a.title}</option>)}</select></div>
        <div className="sm:col-span-2"><label className={lbl} htmlFor="sf-about">About the Artist — biography</label><textarea id="sf-about" value={sf["aboutText"] || ""} onChange={e => setSettingsF({ ...sf, aboutText: e.target.value })} rows={4} className={inp} /></div>
        <div className="sm:col-span-2"><label className={lbl} htmlFor="sf-price">Commission price guide (format: Label|Price; next row after ;)</label><textarea id="sf-price" value={sf["priceGuide"] || ""} onChange={e => setSettingsF({ ...sf, priceGuide: e.target.value })} rows={3} className={inp} /></div>
        <div className="sm:col-span-2"><label className={lbl} htmlFor="sf-faqs">FAQs (format: Question|Answer; next after ;)</label><textarea id="sf-faqs" value={sf["faqs"] || ""} onChange={e => setSettingsF({ ...sf, faqs: e.target.value })} rows={3} className={inp} /></div>
        <div className="sm:col-span-2"><label className={lbl} htmlFor="sf-turn">Turnaround text</label><input id="sf-turn" value={sf["turnaround"] || ""} onChange={e => setSettingsF({ ...sf, turnaround: e.target.value })} className={inp} /></div>
      </div>
      <InstagramAdmin notify={notify} />
      <button onClick={() => saveSettings.mutate()} className="mt-4 bg-[#C1442E] text-white px-6 py-2.5 rounded-full font-medium">Save All Settings</button>
      <p className="text-xs text-[#8A7360] mt-3">Artist photo: the About page currently uses the “artist” image slot; replacing it is done by swapping that image in a future edit or via the Artworks image list. Payment gateway: keep “Test Mode” here until live Razorpay keys are provided securely — never paste live keys in chat.</p>
    </div>}
  </section>;
}

function OrderRow({ o, onSave }: { o: { id: number; buyerName: string; email: string; phone: string; address: string; itemsJson: string; total: number; paymentStatus: string; orderStatus: string; courier: string; tracking: string }; onSave: (v: { id: number; orderStatus: string; courier: string; tracking: string }) => void }) {
  const [status, setStatus] = useState(o.orderStatus); const [courier, setCourier] = useState(o.courier); const [tracking, setTracking] = useState(o.tracking);
  let items: { title: string; price: number }[] = []; try { items = JSON.parse(o.itemsJson); } catch { items = []; }
  return <div className="border-b border-[#EAD9B8] py-4 text-sm">
    <p><strong>Order #{o.id}</strong> · {o.buyerName} · {o.email} · {o.phone} · <strong>{inr(o.total)}</strong> · Payment: {o.paymentStatus}</p>
    <p className="text-[#8A7360]">{items.map(i => i.title).join(", ")} — Deliver to: {o.address}</p>
    <div className="flex flex-wrap gap-2 mt-2 items-end">
      <label className="text-sm">Status <select aria-label={`Order status for order ${o.id}`} value={status} onChange={e => setStatus(e.target.value)} className="border border-[#EAD9B8] rounded-lg px-2 py-1.5 ml-1"><option>Processing</option><option>Packed</option><option>Shipped</option><option>Delivered</option></select></label>
      <label className="text-sm">Courier <input aria-label={`Courier for order ${o.id}`} value={courier} onChange={e => setCourier(e.target.value)} className="border border-[#EAD9B8] rounded-lg px-2 py-1.5 ml-1" /></label>
      <label className="text-sm">Tracking <input aria-label={`Tracking for order ${o.id}`} value={tracking} onChange={e => setTracking(e.target.value)} className="border border-[#EAD9B8] rounded-lg px-2 py-1.5 ml-1" /></label>
      <button onClick={() => onSave({ id: o.id, orderStatus: status, courier, tracking })} className="bg-[#205E63] text-white px-4 py-1.5 rounded-full text-sm">Save & Email Buyer</button>
    </div>
  </div>;
}
