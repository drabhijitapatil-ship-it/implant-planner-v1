<?php
/**
 * Template Name: Implanr — Features
 * Auto-generated from static HTML preview. Assign this template to the
 * matching WordPress Page (Pages -> Features -> Page Attributes -> Template).
 */
get_header(); ?>
<main id="content">
<section class="hero" data-testid="features-hero" style="padding-bottom:64px">
    <div class="wrap">
      <div style="max-width:760px">
        <span class="eyebrow reveal">Features</span>
        <h1 class="reveal" data-delay="1" style="margin:22px 0">The clinical stack for <span class="italic-serif">modern prosthodontics.</span></h1>
        <p class="lead reveal" data-delay="2">Every phase of the implant workflow deserves better than a spreadsheet. Implanr is a purpose-built clinical operating system — decision support, safety validation, guidelines, and paperwork, in one calm interface.</p>
      </div>
    </div>
  </section>

  <section style="padding-top:0" data-testid="features-body">
    <div class="wrap">

      <!-- Row 1 · Clinical Decision Support (with visual diagram) -->
      <div class="feature-row reveal" data-testid="feature-cds">
        <div>
          <span class="eyebrow">Clinical Decision Support</span>
          <h2 class="feature-row__title">Biological safety, computed in real time.</h2>
          <p class="feature-row__body">Every implant placement is validated against the site's bone width and height the moment you pick a tooth. Soft blocks (buccal-lingual bone) warn you; hard blocks (posterior length) prevent unsafe orders altogether.</p>
          <ul class="feature-row__list">
            <li>Bone width margin computed from radiograph annotations</li>
            <li>Hard-block on posterior implant length below institutional threshold</li>
            <li>Bridge &amp; cantilever detection the moment teeth are selected</li>
            <li>Sinus Lift &amp; PET-specific relaxations built into the engine</li>
          </ul>
        </div>
        <div class="feature-row__media">
          <div class="safety-diagram">
            <div class="safety-diagram__title">Site #16 · Sinus Lift · Ø 4.3 × 10 mm</div>
            <div class="safety-bar">
              <div class="safety-bar__label"><span>Buccal-lingual bone (needs ≥ 5.7 mm)</span><span>6.8 mm</span></div>
              <div class="safety-bar__track"><div class="safety-bar__fill" style="width:72%"></div><div class="safety-bar__marker" style="left:60%"></div></div>
            </div>
            <div class="safety-bar">
              <div class="safety-bar__label"><span>Vertical bone (post-lift)</span><span>10.4 mm</span></div>
              <div class="safety-bar__track"><div class="safety-bar__fill" style="width:88%"></div><div class="safety-bar__marker" style="left:78%"></div></div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
              <span class="safety-chip safety-chip--ok">Safe · +1.1 mm width</span>
              <span class="safety-chip safety-chip--ok">Safe · post-lift height</span>
              <span class="safety-chip safety-chip--warn">Watch: sinus membrane</span>
            </div>
            <div style="margin-top:auto;font-size:12px;color:var(--text-3)">Rule engine: <strong>Buser 2004</strong> · <strong>ITI 2015</strong></div>
          </div>
        </div>
      </div>

      <!-- Row 2 · AI Explain -->
      <div class="feature-row feature-row--flip reveal" data-testid="feature-ai">
        <div>
          <span class="eyebrow">AI Explain</span>
          <h2 class="feature-row__title">"Why this implant, why this length?"</h2>
          <p class="feature-row__body">Every recommendation on the Home tool is one tap away from a plain-language explanation, grounded in your institution's published guidelines and the specific geometry of this case.</p>
          <ul class="feature-row__list">
            <li>Grounded in institutional guideline PDFs (not generic web scrape)</li>
            <li>Cites the exact rule and the exact tooth-map input that triggered it</li>
            <li>Never overrides — the clinician decides</li>
            <li>Optional vision context for IOPAs (privacy-gated)</li>
          </ul>
        </div>
        <div class="feature-row__media feature-row__media--navy">
          <div style="padding:32px;color:#fff;height:100%;display:flex;flex-direction:column;gap:14px">
            <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#5EEAD4;font-weight:600">Explain · Ø 3.75 × 8 mm</div>
            <div style="font-family:var(--f-serif);font-size:1.35rem;line-height:1.35;font-weight:500">Recommended because the buccal bone at #21 is 5.8 mm — one 3.75 mm system with 1 mm margin is safest.</div>
            <div style="height:1px;background:rgba(255,255,255,.12);margin:12px 0"></div>
            <div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.6">Cited: <em>ITI Treatment Guide vol. 7 §4.2</em>, <em>Buser 2004</em> (aesthetic zone), your institution's <em>2024 clinical handbook §12</em>.</div>
          </div>
        </div>
      </div>

      <!-- Row 3 · Implant Library -->
      <div class="feature-row reveal" data-testid="feature-library">
        <div>
          <span class="eyebrow">Implant Library</span>
          <h2 class="feature-row__title">30+ institutional systems, one search.</h2>
          <p class="feature-row__body">Straumann, Nobel Biocare, Dentsply Sirona, Adin, Osstem, and more — each system's full component tree (fixtures, healing abutments, impression copings, abutments, screws) is pre-mapped, searchable, and cross-referenced to their published indications.</p>
          <ul class="feature-row__list">
            <li>Fixture, HA, IC, abutment &amp; screw components per system</li>
            <li>Institutional indications quoted, not paraphrased</li>
            <li>Bulk price-list &amp; stock integration (optional)</li>
          </ul>
        </div>
        <div class="feature-row__media" style="padding:24px">
          <div class="systems" style="grid-template-columns:repeat(2,1fr)">
            <div class="system">Straumann BLT SLActive</div>
            <div class="system">Straumann BLT SLA</div>
            <div class="system">Nobel Active TiUltra</div>
            <div class="system">Nobel Replace CC</div>
            <div class="system">Adin Touareg Swell</div>
            <div class="system">Osstem TS III SA</div>
            <div class="system">Astra Tech OsseoSpeed</div>
            <div class="system">Dentsply Xive</div>
            <div class="system">+ 22 more</div>
          </div>
        </div>
      </div>

      <!-- Row 4 · HIPAA & Compliance -->
      <div class="feature-row feature-row--flip reveal" data-testid="feature-hipaa">
        <div>
          <span class="eyebrow">Compliance</span>
          <h2 class="feature-row__title">HIPAA safeguards, built in — not bolted on.</h2>
          <p class="feature-row__body">15-minute auto-logout, native screen-capture blocking on iOS &amp; Android, immutable access logs, and role-based data segmentation. Your PHI stays where it belongs.</p>
          <ul class="feature-row__list">
            <li>15-minute inactivity auto-logout across web and mobile</li>
            <li>Expo screen-capture blocking on native (blank screenshots)</li>
            <li>Every view, export, override — logged with user, IP, and timestamp</li>
            <li>Admin audit log UI with CSV export</li>
          </ul>
        </div>
        <div class="feature-row__media">
          <div style="padding:32px;height:100%;display:flex;flex-direction:column;gap:12px">
            <div class="badge" style="border:0;padding:0;flex-direction:row;align-items:center;gap:14px"><div class="badge__ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div><div><div class="badge__title">15-min auto-logout</div><div class="badge__body">Inactivity closes the session.</div></div></div>
            <div class="badge" style="border:0;padding:0;flex-direction:row;align-items:center;gap:14px"><div class="badge__ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 4v6c0 5.25-3.75 9.75-9 10-5.25-.25-9-4.75-9-10V6z"/></svg></div><div><div class="badge__title">Screen-capture block</div><div class="badge__body">Native OS-level protection.</div></div></div>
            <div class="badge" style="border:0;padding:0;flex-direction:row;align-items:center;gap:14px"><div class="badge__ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div><div class="badge__title">Full audit trail</div><div class="badge__body">Every action, logged &amp; exportable.</div></div></div>
          </div>
        </div>
      </div>

      <!-- Row 5 · Roles & PDFs -->
      <div class="feature-row reveal" data-testid="feature-rbac">
        <div>
          <span class="eyebrow">Role-Based Access</span>
          <h2 class="feature-row__title">Five roles. One truth.</h2>
          <p class="feature-row__body">Student, Supervisor, Implant In-Charge, Nurse, Administrator — each with tailored dashboards, permissions, and approval gates. Dual-approval workflows ensure no case advances without both supervisor and implant-in-charge sign-off.</p>
          <ul class="feature-row__list">
            <li>Dual-approval gates at every phase transition</li>
            <li>Nurse-friendly checklist &amp; sterilization tracking</li>
            <li>Administrator-only access log &amp; back-fill tools</li>
          </ul>
        </div>
        <div class="feature-row__media" style="padding:24px;display:flex;align-items:center">
          <div style="width:100%;display:flex;flex-direction:column;gap:10px">
            <div class="mockup__row"><span class="mockup__badge">Student</span><div><div class="mockup__row-title">Submits Phase 1</div><div class="mockup__row-sub">Guided form · guardrails</div></div></div>
            <div class="mockup__row"><span class="mockup__badge">Supervisor</span><div><div class="mockup__row-title">Reviews &amp; signs</div><div class="mockup__row-sub">Diagnosis approval</div></div></div>
            <div class="mockup__row"><span class="mockup__badge">In-Charge</span><div><div class="mockup__row-title">Countersigns</div><div class="mockup__row-sub">Implant selection lock</div></div></div>
            <div class="mockup__row"><span class="mockup__badge">Nurse</span><div><div class="mockup__row-title">Preps tray &amp; sterility</div><div class="mockup__row-sub">Surgery-day checklist</div></div></div>
          </div>
        </div>
      </div>

    </div>
  </section>

  <section data-testid="features-cta">
    <div class="wrap">
      <div class="big-cta reveal">
        <div>
          <h2>Ready to see it on your own workflow?</h2>
          <p>Book a 30-minute walkthrough with your case data — no slides, just the product.</p>
        </div>
        <div class="big-cta__actions">
          <a href="<?php echo esc_url( home_url( '/contact/#book' ) ); ?>" class="btn btn--mint" data-testid="features-cta-demo" data-magnetic>Request a Demo <span class="btn__arrow">→</span></a>
        </div>
      </div>
    </div>
  </section>
</main>
<?php get_footer();
