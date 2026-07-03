# Implanr — Marketing Website

A complete, calm, clinical marketing site for **Implanr** — precision implant case management for prosthodontists and dental schools.

This deliverable ships in **two forms**:

1. **`preview/`** — a static HTML preview (10 pages) you (or anyone) can open locally to click through the design before installing.
2. **`wordpress-theme/implanr/`** — a production-ready **custom WordPress theme** you install on your GoDaddy WordPress site at `www.implanr.com`.

Everything is on-brand out of the box. No page builder. No Elementor. No Divi. Just a clean, editable WordPress theme with 10 dedicated page templates.

---

## What's inside

```
website/
├── preview/                              # Static HTML preview (open in browser)
│   ├── index.html                        # Home
│   ├── features.html
│   ├── for-schools.html
│   ├── for-clinicians.html
│   ├── pricing.html
│   ├── about.html
│   ├── security.html
│   ├── blog.html
│   ├── contact.html
│   ├── 404.html
│   └── assets/
│       ├── css/site.css                  # Full design system
│       ├── js/site.js                    # Motion + form + drawer
│       └── partials/                     # header/footer HTML fragments
│
└── wordpress-theme/
    └── implanr/                          # ← THIS is what you install on WordPress
        ├── style.css                     # Theme metadata + WP overrides
        ├── functions.php                 # Menus, asset enqueue
        ├── header.php                    # Top nav + mobile drawer
        ├── footer.php                    # Footer + closing tags
        ├── index.php                     # Blog archive fallback
        ├── front-page.php                # Home
        ├── page-features.php
        ├── page-for-schools.php
        ├── page-for-clinicians.php
        ├── page-pricing.php
        ├── page-about.php
        ├── page-security.php
        ├── page-blog.php
        ├── page-contact.php
        ├── page.php                      # Fallback for other WP pages
        ├── single.php                    # Blog single post
        ├── 404.php
        └── assets/
            ├── css/site.css
            └── js/site.js
```

---

## Design at a glance

- **Mood**: *Clinical Calm* — deep navy `#0A192F`, soft white `#F8FAFC`, mint `#14B8A6` accents.
- **Type**: **Newsreader** (serif, italic accents) for headings + **Manrope** (humanist sans) for body. Zero Inter, Roboto, or Arial.
- **Motion**: staggered hero reveal, scroll-linked reveals, magnetic "Request a Demo" buttons, subtle hero parallax, respects `prefers-reduced-motion`.
- **Data attributes**: every interactive element has a unique `data-testid` for future automated testing.
- **Contact form**: `mailto:info@implanr.com` handoff (opens the visitor's mail client with subject + body pre-filled — no backend required, works instantly on GoDaddy shared WP hosting).

---

## Preview the design locally (no install needed)

```bash
cd website/preview
python3 -m http.server 4500
```

Then open [`http://localhost:4500`](http://localhost:4500) in any browser and click through all 10 pages.

---

## Install the WordPress theme on www.implanr.com

### Option A — Upload via WordPress admin (recommended, easiest)

1. **Zip the theme folder**. On your computer:
   ```bash
   cd website/wordpress-theme
   zip -r implanr-theme.zip implanr
   ```
   *(Or right-click the `implanr` folder → "Compress" / "Send to → Compressed folder".)*

2. **Log into WordPress admin** at `https://www.implanr.com/wp-admin`.

3. **Go to** `Appearance` → `Themes` → `Add New` → `Upload Theme`.

4. **Choose file** → select `implanr-theme.zip` → click **Install Now**.

5. Click **Activate**.

6. **Create the 9 content pages**. Go to `Pages` → `Add New`, and create one page for each slug below. For each, set the URL slug to the exact value shown, and (in the "Page Attributes" sidebar) assign the matching **Template**:

   | Page title       | URL slug          | Template                        |
   |------------------|-------------------|---------------------------------|
   | Home             | (set as Front Page — see step 7) | — (uses `front-page.php` automatically) |
   | Features         | `features`        | *Implanr — Features*             |
   | For Schools      | `for-schools`     | *Implanr — For Schools*          |
   | For Clinicians   | `for-clinicians`  | *Implanr — For Clinicians*       |
   | Pricing          | `pricing`         | *Implanr — Pricing*              |
   | About            | `about`           | *Implanr — About*                |
   | Security         | `security`        | *Implanr — Security*             |
   | Insights (Blog)  | `blog`            | *Implanr — Insights*             |
   | Contact          | `contact`         | *Implanr — Contact*              |

   *(You don't need to add any content to these pages — the templates render everything themselves.)*

7. **Set Home as the front page**:
   - `Settings` → `Reading` → **Your homepage displays**: *A static page*.
   - **Homepage**: create a Page called *Home* (empty is fine) → select it.
   - **Posts page**: select the *Insights* page.

8. **Set up the navigation menu** (optional — theme has a sensible default):
   - `Appearance` → `Menus` → create a new menu called *Primary*.
   - Add the pages: Features · For Schools · For Clinicians · Pricing · Security · About · Insights.
   - Assign to **Primary Navigation** location.

9. **Set permalinks to "Post name"**:
   - `Settings` → `Permalinks` → **Post name** → Save.

10. Visit `https://www.implanr.com/` — you should see the new home page. Test every nav link.

### Option B — Upload via FTP / GoDaddy File Manager

1. In your GoDaddy hosting dashboard, open **File Manager** (or connect via FTP).
2. Navigate to `wp-content/themes/`.
3. Upload the entire `implanr/` folder (drag & drop, or FTP transfer).
4. In WordPress admin, `Appearance` → `Themes` → click **Activate** on Implanr.
5. Then follow steps 6–10 from Option A above.

---

## Editing content later

- **Text on any of the 10 pages** — the copy lives in the theme's `page-*.php` files. Open the relevant file in the WP theme editor (`Appearance` → `Theme File Editor`) or via FTP, and edit the HTML directly. Keep the surrounding CSS classes intact.
- **Blog posts** — write regular WordPress posts (`Posts` → `Add New`). They automatically appear on `/blog/`.
- **Menu items** — `Appearance` → `Menus`.
- **Site title & tagline** — `Settings` → `General`. The theme reads `bloginfo('name')` in the header and footer, so any change reflects immediately.

## Editing the contact-form recipient

The default form uses a `mailto:info@implanr.com` handoff (zero-config). To change:

- **Change the email**: edit `assets/js/site.js` — search for `info@implanr.com` and replace.
- **Wire to a plugin** (Contact Form 7 / Fluent Forms / WPForms): install the plugin, create a form that emails `info@implanr.com`, then in `page-contact.php` replace the whole `<form data-testid="contact-form">…</form>` block with `[contact-form-7 id="..."]` (or your plugin's shortcode).

---

## Customization cheatsheet

| I want to…                            | Edit                                       |
|---------------------------------------|--------------------------------------------|
| Change brand colors                   | `assets/css/site.css` → `:root` variables  |
| Change fonts                          | `functions.php` → `implanr_enqueue_assets` |
| Change hero copy                      | `front-page.php`                           |
| Add a testimonial                     | `front-page.php` → search for `.quote`     |
| Change "Request a Demo" button label  | Find `Request a Demo` in `.php` templates  |
| Add university logos                  | `front-page.php` → search for `trust__logo`|
| Swap the contact email                | `assets/js/site.js` (mailto handoff)       |

---

## Browser support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari — 2 years back). No IE11.

## Performance notes

- No client-side framework, no bundler, no build step.
- CSS is a single file (~30KB gzipped).
- Fonts are loaded with `display=swap` so text is never invisible.
- Total home-page weight (excluding Google Fonts): under 40KB.

## Accessibility

- Contrast ratios verified against WCAG AA (mint on white uses the darker `#0F766E` for text).
- All interactive elements have `data-testid` attributes and `aria-label`s where appropriate.
- `prefers-reduced-motion` fully honored — all animations become opacity-only fades.
- Semantic HTML: `<header>`, `<main>`, `<footer>`, `<nav>`, proper heading order.

---

## Support

Questions or tweaks? Email [info@implanr.com](mailto:info@implanr.com).

Made with care, in the clinic.
