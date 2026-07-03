<?php
/**
 * Template Name: Implanr — Pricing
 * Auto-generated from static HTML preview. Assign this template to the
 * matching WordPress Page (Pages -> Pricing -> Page Attributes -> Template).
 */
get_header(); ?>
<main id="content">
<section class="hero" data-testid="pricing-hero" style="padding-bottom:48px">
    <div class="wrap" style="text-align:center;max-width:760px;margin:0 auto">
      <span class="eyebrow reveal">Pricing</span>
      <h1 class="reveal" data-delay="1" style="margin:22px 0">Honest pricing, <span class="italic-serif">institution-fair.</span></h1>
      <p class="lead reveal" data-delay="2" style="margin:0 auto">Every plan includes the full clinical stack — decision support, PDFs, HIPAA safeguards. What changes is licenses, onboarding, and integration depth.</p>
    </div>
  </section>

  <section data-testid="pricing-grid" style="padding-top:32px">
    <div class="wrap">
      <div class="prices">
        <div class="price reveal" data-testid="price-student">
          <h3>Resident</h3>
          <p class="price__body">For individual residents building portfolio cases during training.</p>
          <div class="price__amount">Free<small>with institution license</small></div>
          <ul class="price__list">
            <li>Full 4-phase workflow</li>
            <li>Clinical decision support</li>
            <li>Personal case portfolio PDF</li>
            <li>Basic AI Explain (5/day)</li>
          </ul>
          <a href="<?php echo esc_url( home_url( '/contact/#book' ) ); ?>" class="btn btn--ghost" style="margin-top:auto" data-testid="price-cta-student">Request Access</a>
        </div>

        <div class="price price--feature reveal" data-delay="1" data-testid="price-clinic">
          <h3>Clinic</h3>
          <p class="price__body">For solo prosthodontists and 2–10 chair private practices.</p>
          <div class="price__amount">Contact<small>tailored to seat count &amp; volume</small></div>
          <ul class="price__list">
            <li>Everything in Resident, plus</li>
            <li>Unlimited AI Explain</li>
            <li>Patient-facing briefings &amp; lab slips</li>
            <li>Custom clinic branding on PDFs</li>
            <li>Multi-clinician dashboards</li>
            <li>Priority support (24-hour response)</li>
          </ul>
          <a href="<?php echo esc_url( home_url( '/contact/#book' ) ); ?>" class="btn btn--mint" style="margin-top:auto" data-testid="price-cta-clinic" data-magnetic>Talk to Sales →</a>
        </div>

        <div class="price reveal" data-delay="2" data-testid="price-institution">
          <h3>Institution</h3>
          <p class="price__body">For dental colleges, teaching hospitals, and multi-location groups.</p>
          <div class="price__amount">Contact<small>bulk cohort licensing</small></div>
          <ul class="price__list">
            <li>Everything in Clinic, plus</li>
            <li>Cohort onboarding &amp; SSO</li>
            <li>Custom institutional guidelines integration</li>
            <li>NABH/NAAC audit export packs</li>
            <li>Dedicated implementation lead</li>
            <li>SLA-backed uptime commitments</li>
          </ul>
          <a href="<?php echo esc_url( home_url( '/contact/#book' ) ); ?>" class="btn btn--ghost" style="margin-top:auto" data-testid="price-cta-institution">Book Institutional Demo</a>
        </div>
      </div>
    </div>
  </section>

  <section data-testid="pricing-faq">
    <div class="wrap wrap-narrow">
      <div class="section__head reveal" style="text-align:center;margin:0 auto">
        <span class="eyebrow" style="margin-inline:auto">FAQ</span>
        <h2 style="margin-top:20px">Common questions.</h2>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;margin-top:40px">
        <div class="badge reveal"><div class="badge__title">Is there a free trial?</div><div class="badge__body">Yes — after a demo, we offer a 30-day pilot with real case data for institutions. Individual clinicians can trial the Clinic tier for 14 days.</div></div>
        <div class="badge reveal" data-delay="1"><div class="badge__title">Do you offer academic discounts?</div><div class="badge__body">Yes. Public and government-run dental colleges receive substantial cohort pricing. Please mention your institution when requesting a demo.</div></div>
        <div class="badge reveal"><div class="badge__title">Can we host on our own servers?</div><div class="badge__body">Enterprise self-hosted deployments are available for institutions with specific data-residency requirements. Contact us for details.</div></div>
        <div class="badge reveal" data-delay="1"><div class="badge__title">Which implant systems are supported?</div><div class="badge__body">30+ institutional systems including Straumann, Nobel Biocare, Adin, Osstem, Astra Tech, Dentsply, and more. Missing yours? We add systems as part of institutional onboarding.</div></div>
      </div>
    </div>
  </section>
</main>
<?php get_footer();
