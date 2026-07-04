<?php
/**
 * Template Name: Implanr — Contact
 * Auto-generated from static HTML. Assign to the WordPress Page with slug matching this template.
 */
get_header(); ?>
<main id="content">
<section class="hero" id="book" data-testid="contact-hero" style="padding-bottom:56px">
    <div class="wrap" style="display:grid;grid-template-columns:1fr 1.1fr;gap:clamp(32px,5vw,80px);align-items:start">
      <div>
        <span class="eyebrow reveal">Contact</span>
        <h1 class="reveal" data-delay="1" style="margin:22px 0;font-size:clamp(2.4rem,4.6vw,4rem)">Let's <span class="italic-serif">meet the clinic</span> you're building.</h1>
        <p class="lead reveal" data-delay="2" style="max-width:44ch;margin-bottom:32px">Tell us a little about your practice or department. We'll send back a 30-minute demo slot — no slides, just your case data walked through the product.</p>
        <div class="reveal" data-delay="3" style="display:flex;flex-direction:column;gap:16px;padding:24px;background:var(--white);border-radius:var(--radius-lg);border:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text)"><div style="width:36px;height:36px;border-radius:10px;background:var(--mint-soft);color:var(--mint-dark);display:grid;place-items:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></div><div><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;font-weight:600">Email</div><a href="mailto:info@implanr.com" style="font-weight:600;color:var(--navy)">info@implanr.com</a></div></div>
          <div style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text)"><div style="width:36px;height:36px;border-radius:10px;background:var(--mint-soft);color:var(--mint-dark);display:grid;place-items:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div><div><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;font-weight:600">Web</div><span style="font-weight:600;color:var(--navy)">implanr.com</span></div></div>
          <div style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text)"><div style="width:36px;height:36px;border-radius:10px;background:var(--mint-soft);color:var(--mint-dark);display:grid;place-items:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div><div><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;font-weight:600">Based in</div><span style="font-weight:600;color:var(--navy)">Pune · India</span></div></div>
        </div>
      </div>

      <form class="reveal" data-delay="2" data-testid="contact-form" style="padding:clamp(28px,4vw,44px);background:var(--white);border-radius:var(--radius-lg);border:1px solid var(--border);box-shadow:var(--shadow-soft);display:flex;flex-direction:column;gap:16px">
        <div class="form-grid">
          <div class="field">
            <label for="c-name">Full name</label>
            <input id="c-name" name="name" required autocomplete="name" placeholder="Dr. Riddhi Sabane" data-testid="contact-name" />
          </div>
          <div class="field">
            <label for="c-role">Role</label>
            <select id="c-role" name="role" required data-testid="contact-role">
              <option value="">Select a role</option>
              <option>Chief Prosthodontist</option>
              <option>Implant In-Charge</option>
              <option>Head of Department</option>
              <option>Private Clinician</option>
              <option>Resident / Student</option>
              <option>Administrator / Buyer</option>
              <option>Other</option>
            </select>
          </div>
          <div class="field field--full">
            <label for="c-org">Organization</label>
            <input id="c-org" name="org" required placeholder="Sinhgad Dental College · 40-chair practice · etc." data-testid="contact-org" />
          </div>
          <div class="field field--full">
            <label for="c-email">Work email</label>
            <input id="c-email" name="email" type="email" required autocomplete="email" placeholder="you@clinic.com" data-testid="contact-email" />
          </div>
          <div class="field field--full">
            <label for="c-msg">What are you hoping to solve?</label>
            <textarea id="c-msg" name="msg" placeholder="A short description of your current workflow — spreadsheet, WhatsApp, paper — and what you want Implanr to fix." data-testid="contact-msg"></textarea>
            <span class="field__hint">We reply within one working day. Your message opens your mail app addressed to info@implanr.com.</span>
          </div>
        </div>
        <button type="submit" class="btn btn--primary" style="margin-top:8px;align-self:flex-start" data-testid="contact-submit" data-magnetic>
          Send &amp; Book Demo <span class="btn__arrow">→</span>
        </button>
      </form>
    </div>
  </section>

  <section data-testid="contact-strip" style="padding-top:0">
    <div class="wrap">
      <div class="badges reveal" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
        <div class="badge"><div class="badge__title">Fast reply</div><div class="badge__body">One working-day response — often within hours.</div></div>
        <div class="badge"><div class="badge__title">No pressure</div><div class="badge__body">30-min walkthrough. If it doesn't fit, we'll say so.</div></div>
        <div class="badge"><div class="badge__title">Real cases</div><div class="badge__body">We walk the product through your case data — not slides.</div></div>
        <div class="badge"><div class="badge__title">Institution ready</div><div class="badge__body">Ask about our cohort onboarding and BAA.</div></div>
      </div>
    </div>
  </section>
</main>
<?php get_footer();
