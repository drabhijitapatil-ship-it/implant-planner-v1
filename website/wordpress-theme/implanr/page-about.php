<?php
/**
 * Template Name: Implanr — About
 * Auto-generated from static HTML. Assign to the WordPress Page with slug matching this template.
 */
get_header(); ?>
<main id="content">
<section class="hero" data-testid="about-hero" style="padding-bottom:56px">
    <div class="wrap wrap-narrow" style="text-align:left">
      <span class="eyebrow reveal">Our Mission</span>
      <h1 class="reveal" data-delay="1" style="margin:24px 0;font-size:clamp(2.4rem,4.4vw,4rem)">
        Every implant deserves a <span class="italic-serif">clinical record</span> as precise as the surgery itself.
      </h1>
      <p class="lead reveal" data-delay="2" style="max-width:56ch;margin-bottom:32px">
        For decades, prosthodontics has run on a patchwork of spreadsheets, WhatsApp threads, and paper case files. Implanr exists to give the discipline the software backbone it deserves — one that respects clinical rigor, biological safety, and the way modern dental teams actually work.
      </p>
    </div>
  </section>

  <section data-testid="about-problem">
    <div class="wrap">
      <div class="feature-row reveal">
        <div>
          <span class="eyebrow">The Problem</span>
          <h2 class="feature-row__title">Modern dentistry, legacy paperwork.</h2>
          <p class="feature-row__body">A single implant case can touch six systems: a paper history, a scan viewer, a spreadsheet log, a WhatsApp group with the lab, an email trail with the supervisor, and a PDF viewer for consents. Nothing talks to anything else.</p>
          <p class="feature-row__body">The result: silent errors, biological safety violations that go undetected until the case fails, and audit trails that fall apart the moment an inspector asks.</p>
        </div>
        <div class="feature-row__media" style="background:linear-gradient(180deg,#F8FAFC,#FFFFFF)">
          <div style="padding:32px;height:100%;display:flex;flex-direction:column;gap:14px;font-family:var(--f-serif)">
            <div style="font-size:1rem;color:var(--text-3);font-style:italic">Before Implanr:</div>
            <div style="font-size:1.5rem;line-height:1.4">Case log spreadsheet · X-ray viewer · WhatsApp with lab · Email with supervisor · Paper consent · Excel drilling protocol · SMS to patient</div>
            <div style="margin-top:auto;padding:14px;background:var(--mint-soft);border-radius:10px;font-family:var(--f-sans);font-size:14px;color:var(--mint-dark)"><strong>7 tools.</strong> Zero traceability.</div>
          </div>
        </div>
      </div>

      <div class="feature-row feature-row--flip reveal">
        <div>
          <span class="eyebrow">The Approach</span>
          <h2 class="feature-row__title">Built with dentists, not for dentists.</h2>
          <p class="feature-row__body">Every feature in Implanr — from the biological safety engine to the pre-op briefing PDF — was designed with prosthodontists at the chair, students at the clinic, and department heads at the audit desk. We don't ship features until three roles nod at the same time.</p>
          <ul class="feature-row__list">
            <li>Weekly clinician office hours in our design loop</li>
            <li>Peer-reviewed guideline references (ITI, Buser, Misch)</li>
            <li>No feature ships without a supervisor sign-off flow</li>
          </ul>
        </div>
        <div class="feature-row__media" style="background:linear-gradient(180deg,var(--navy-2),var(--navy));color:#fff">
          <div style="padding:40px;height:100%;display:flex;flex-direction:column;justify-content:center;gap:16px">
            <div style="font-family:var(--f-serif);font-size:2rem;font-weight:500;line-height:1.2;color:#fff">332 iterations. Every one shaped by a clinician's Monday morning.</div>
            <div style="font-size:13px;color:rgba(255,255,255,.6)">Version history · shipped in the clinic</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section data-testid="about-founder">
    <div class="wrap">
      <div class="quote reveal">
        <div>
          <p class="quote__text">We started Implanr because our own residents kept losing cases in spreadsheets. Two years later, four institutions run their entire prosthodontics department on it.</p>
          <div class="quote__cite">
            <strong>The Implanr Team</strong>
            <span>Pune · India</span>
          </div>
        </div>
        <div class="quote__portrait" aria-hidden="true"></div>
      </div>
    </div>
  </section>

  <section data-testid="about-cta">
    <div class="wrap">
      <div class="big-cta reveal">
        <div>
          <h2>Want to help shape what we build next?</h2>
          <p>We're always looking for clinical partners, research collaborators, and beta institutions. Say hi.</p>
        </div>
        <div class="big-cta__actions">
          <a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>" class="btn btn--mint" data-testid="about-cta-contact" data-magnetic>Get in touch <span class="btn__arrow">→</span></a>
        </div>
      </div>
    </div>
  </section>
</main>
<?php get_footer();
