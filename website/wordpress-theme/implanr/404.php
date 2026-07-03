<?php
/**
 * 404.php — WordPress "not found" page.
 * Uses the same "Margin not found" hero from the design system.
 */
get_header(); ?>
<main id="content">
  <section class="hero" data-testid="not-found" style="min-height:60vh;display:flex;align-items:center">
    <div class="wrap" style="text-align:center;max-width:640px;margin:0 auto">
      <span class="eyebrow">Error 404</span>
      <h1 style="margin:24px 0;font-size:clamp(3rem,7vw,5.5rem)">Margin <span class="italic-serif">not found.</span></h1>
      <p class="lead" style="margin:0 auto 32px">We couldn&apos;t locate this page. Let&apos;s get you back to the clinic.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="btn btn--primary" data-testid="404-home">Return home <span class="btn__arrow">→</span></a>
        <a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>" class="btn btn--ghost" data-testid="404-contact">Talk to us</a>
      </div>
    </div>
  </section>
</main>
<?php get_footer();
