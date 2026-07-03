/* Implanr Marketing Site — motion + interactions */

/* --- Include header/footer partials ------------------------------------- */
async function injectPartial(id, url) {
  const slot = document.getElementById(id);
  if (!slot) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.statusText);
    slot.outerHTML = await res.text();
  } catch (e) {
    console.warn(`Partial load failed: ${url}`, e);
  }
}

async function hydrate() {
  await Promise.all([
    injectPartial("site-header", "/assets/partials/header.html"),
    injectPartial("site-footer", "/assets/partials/footer.html"),
  ]);
  wireNavAfterInject();
  wireDrawer();
  markActiveNav();
}

/* --- Sticky nav shadow on scroll ---------------------------------------- */
function wireNavAfterInject() {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

/* --- Mobile drawer ------------------------------------------------------ */
function wireDrawer() {
  const openBtn = document.querySelector("[data-testid='mobile-menu-open']");
  const closeBtn = document.querySelector("[data-testid='mobile-menu-close']");
  const drawer = document.querySelector(".drawer");
  if (!openBtn || !drawer) return;
  openBtn.addEventListener("click", () => drawer.classList.add("open"));
  closeBtn?.addEventListener("click", () => drawer.classList.remove("open"));
  drawer.querySelectorAll("a").forEach(a => a.addEventListener("click", () => drawer.classList.remove("open")));
}

/* --- Active nav item ---------------------------------------------------- */
function markActiveNav() {
  const here = window.location.pathname.replace(/index\.html$/, "").replace(/\/$/, "") || "/";
  document.querySelectorAll(".nav__links a, .drawer nav a").forEach(a => {
    const href = a.getAttribute("href")?.replace(/index\.html$/, "").replace(/\/$/, "") || "/";
    if (href === here) a.classList.add("active");
  });
}

/* --- Reveal on scroll --------------------------------------------------- */
function wireReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  els.forEach(e => io.observe(e));
}

/* --- Magnetic CTAs ------------------------------------------------------ */
function wireMagnetic() {
  const cards = document.querySelectorAll("[data-magnetic]");
  const canHover = matchMedia("(hover: hover)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!canHover) return;
  cards.forEach(btn => {
    btn.addEventListener("mousemove", (e) => {
      const r = btn.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * 0.18;
      const dy = (e.clientY - (r.top + r.height / 2)) * 0.18;
      btn.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    btn.addEventListener("mouseleave", () => btn.style.transform = "");
  });
}

/* --- Hero stack subtle parallax on mouse ------------------------------- */
function wireHeroParallax() {
  const stack = document.querySelector(".hero__stack");
  if (!stack) return;
  const cards = stack.querySelectorAll(".hero__card");
  const canHover = matchMedia("(hover: hover)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!canHover) return;
  stack.addEventListener("mousemove", (e) => {
    const r = stack.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
    const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
    cards.forEach((c, i) => {
      const depth = (i + 1) * 6;
      c.style.setProperty("--mx", `${dx * depth}px`);
      c.style.setProperty("--my", `${dy * depth}px`);
      c.style.translate = `${dx * depth}px ${dy * depth}px`;
    });
  });
  stack.addEventListener("mouseleave", () => cards.forEach(c => (c.style.translate = "")));
}

/* --- Contact form: mailto handoff -------------------------------------- */
function wireContactForm() {
  const form = document.querySelector("[data-testid='contact-form']");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = data.get("name") || "";
    const org = data.get("org") || "";
    const role = data.get("role") || "";
    const email = data.get("email") || "";
    const msg = data.get("msg") || "";
    const subject = encodeURIComponent(`Demo request — ${org || name}`);
    const body = encodeURIComponent(
`Hi Implanr team,

I'd like to book a demo.

Name: ${name}
Organization: ${org}
Role: ${role}
Email: ${email}

Message:
${msg}
`);
    window.location.href = `mailto:info@implanr.com?subject=${subject}&body=${body}`;
  });
}

/* --- Newsletter form: same mailto handoff ------------------------------ */
function wireNewsletter() {
  document.querySelectorAll("[data-testid='newsletter-form']").forEach(form => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = new FormData(form).get("email") || "";
      const subject = encodeURIComponent("Newsletter signup");
      const body = encodeURIComponent(`Please add ${email} to the Implanr newsletter.`);
      window.location.href = `mailto:info@implanr.com?subject=${subject}&body=${body}`;
    });
  });
}

/* --- Copy year in footer ----------------------------------------------- */
function wireYear() {
  document.querySelectorAll("[data-year]").forEach(el => el.textContent = new Date().getFullYear());
}

/* --- Boot -------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  await hydrate();
  wireReveal();
  wireMagnetic();
  wireHeroParallax();
  wireContactForm();
  wireNewsletter();
  wireYear();
});
