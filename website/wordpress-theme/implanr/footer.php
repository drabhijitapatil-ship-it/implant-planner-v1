<?php if ( ! defined( 'ABSPATH' ) ) exit; ?>
<footer class="foot" data-testid="site-footer">
  <div class="wrap">
    <div class="foot__grid">
      <div class="foot__brand-block">
        <a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="brand" style="color: #fff;">
          <span class="brand__dot"></span><?php bloginfo( 'name' ); ?>
        </a>
        <p>Precision implant case management for prosthodontists and dental schools. Institution-grade clinical decision support, biological safety, and HIPAA compliance — designed with dentists, for dentists.</p>
      </div>
      <div>
        <h4>Product</h4>
        <ul>
          <li><a href="<?php echo esc_url( home_url( '/features/' ) ); ?>">Features</a></li>
          <li><a href="<?php echo esc_url( home_url( '/pricing/' ) ); ?>">Pricing</a></li>
          <li><a href="<?php echo esc_url( home_url( '/security/' ) ); ?>">Security &amp; Compliance</a></li>
          <li><a href="<?php echo esc_url( home_url( '/blog/' ) ); ?>">Insights</a></li>
        </ul>
      </div>
      <div>
        <h4>Solutions</h4>
        <ul>
          <li><a href="<?php echo esc_url( home_url( '/for-schools/' ) ); ?>">For Dental Schools</a></li>
          <li><a href="<?php echo esc_url( home_url( '/for-clinicians/' ) ); ?>">For Clinicians</a></li>
          <li><a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>">Book a Demo</a></li>
        </ul>
      </div>
      <div>
        <h4>Company</h4>
        <ul>
          <li><a href="<?php echo esc_url( home_url( '/about/' ) ); ?>">About</a></li>
          <li><a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>">Contact</a></li>
          <li><a href="mailto:info@implanr.com">info@implanr.com</a></li>
        </ul>
      </div>
    </div>
    <div class="foot__bottom">
      <div>© <span data-year></span> <?php bloginfo( 'name' ); ?>. HIPAA-aware · Built with care in the clinic.</div>
      <div>
        <a href="<?php echo esc_url( home_url( '/security/' ) ); ?>">Privacy</a>
        <a href="<?php echo esc_url( home_url( '/security/' ) ); ?>">Terms</a>
        <a href="<?php echo esc_url( home_url( '/security/' ) ); ?>">HIPAA</a>
      </div>
    </div>
  </div>
</footer>
<?php wp_footer(); ?>
</body>
</html>
