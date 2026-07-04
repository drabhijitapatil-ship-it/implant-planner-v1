<?php if ( ! defined( 'ABSPATH' ) ) exit; ?>
<!doctype html>
<html <?php language_attributes(); ?> class="no-js">
<head>
  <meta charset="<?php bloginfo( 'charset' ); ?>" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2314B8A6'/%3E%3C/svg%3E" />
  <script>document.documentElement.classList.remove('no-js');document.documentElement.classList.add('js');</script>
  <noscript><style>.reveal{opacity:1!important;transform:none!important}</style></noscript>
  <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<header class="nav" data-testid="site-nav">
  <div class="wrap nav__inner">
    <a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="brand" data-testid="brand-home-link" aria-label="<?php bloginfo( 'name' ); ?> home">
      <span class="brand__dot" aria-hidden="true"></span>
      <?php bloginfo( 'name' ); ?>
    </a>
    <?php implanr_primary_menu(); ?>
    <div class="nav__cta">
      <a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>" class="btn btn--ghost btn--sm" data-testid="nav-cta-contact">Contact</a>
      <a href="<?php echo esc_url( home_url( '/contact/#book' ) ); ?>" class="btn btn--primary btn--sm" data-testid="nav-cta-demo" data-magnetic>
        Request a Demo <span class="btn__arrow" aria-hidden="true">→</span>
      </a>
      <button class="nav__burger" data-testid="mobile-menu-open" aria-label="Open menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
      </button>
    </div>
  </div>
</header>

<aside class="drawer" aria-hidden="true">
  <div class="drawer__top">
    <a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="brand"><span class="brand__dot"></span><?php bloginfo( 'name' ); ?></a>
    <button class="nav__burger" data-testid="mobile-menu-close" aria-label="Close menu">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
    </button>
  </div>
  <nav aria-label="Mobile">
    <a href="<?php echo esc_url( home_url( '/features/' ) ); ?>">Features</a>
    <a href="<?php echo esc_url( home_url( '/for-schools/' ) ); ?>">For Schools</a>
    <a href="<?php echo esc_url( home_url( '/for-clinicians/' ) ); ?>">For Clinicians</a>
    <a href="<?php echo esc_url( home_url( '/pricing/' ) ); ?>">Pricing</a>
    <a href="<?php echo esc_url( home_url( '/security/' ) ); ?>">Security</a>
    <a href="<?php echo esc_url( home_url( '/about/' ) ); ?>">About</a>
    <a href="<?php echo esc_url( home_url( '/blog/' ) ); ?>">Insights</a>
    <a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>">Contact</a>
  </nav>
  <a href="<?php echo esc_url( home_url( '/contact/#book' ) ); ?>" class="btn btn--mint" data-testid="drawer-cta-demo">Request a Demo <span class="btn__arrow">→</span></a>
</aside>
