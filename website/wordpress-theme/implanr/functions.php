<?php
/**
 * Implanr theme functions
 * ────────────────────────────────────────────────────────────
 * Registers menus, enqueues assets, and declares theme support.
 * Full design system lives in assets/css/site.css.
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'IMPLANR_THEME_VERSION', '1.0.0' );

add_action( 'after_setup_theme', 'implanr_theme_setup' );
function implanr_theme_setup() {
  add_theme_support( 'title-tag' );
  add_theme_support( 'post-thumbnails' );
  add_theme_support( 'automatic-feed-links' );
  add_theme_support( 'html5', array( 'search-form', 'gallery', 'caption', 'style', 'script' ) );

  register_nav_menus( array(
    'primary' => __( 'Primary Navigation', 'implanr' ),
    'footer_product'  => __( 'Footer · Product',  'implanr' ),
    'footer_solutions'=> __( 'Footer · Solutions','implanr' ),
    'footer_company'  => __( 'Footer · Company',  'implanr' ),
  ) );
}

add_action( 'wp_enqueue_scripts', 'implanr_enqueue_assets' );
function implanr_enqueue_assets() {
  // Google Fonts: Newsreader (serif headings) + Manrope (sans body)
  wp_enqueue_style(
    'implanr-fonts',
    'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&display=swap',
    array(), null
  );
  // Theme metadata / WP admin bar overrides
  wp_enqueue_style( 'implanr-theme', get_stylesheet_uri(), array(), IMPLANR_THEME_VERSION );
  // Full design system
  wp_enqueue_style( 'implanr-site', get_template_directory_uri() . '/assets/css/site.css', array( 'implanr-theme' ), IMPLANR_THEME_VERSION );

  // JS: reveal, magnetic CTAs, mobile drawer, mailto form handoff
  wp_enqueue_script( 'implanr-site', get_template_directory_uri() . '/assets/js/site.js', array(), IMPLANR_THEME_VERSION, true );
}

// Replace default primary-menu markup with our nav__links list.
function implanr_primary_menu() {
  $args = array(
    'theme_location' => 'primary',
    'container'      => false,
    'menu_class'     => 'nav__links',
    'fallback_cb'    => 'implanr_default_menu',
    'items_wrap'     => '<nav class="nav__links" aria-label="Primary">%3$s</nav>',
    'depth'          => 1,
  );
  wp_nav_menu( $args );
}

function implanr_default_menu() {
  echo '<nav class="nav__links" aria-label="Primary">';
  $pages = array(
    'features'       => 'Features',
    'for-schools'    => 'For Schools',
    'for-clinicians' => 'For Clinicians',
    'pricing'        => 'Pricing',
    'security'       => 'Security',
    'about'          => 'About',
    'blog'           => 'Insights',
  );
  foreach ( $pages as $slug => $label ) {
    printf( '<a href="%s" data-testid="nav-%s">%s</a>',
      esc_url( home_url( "/{$slug}/" ) ),
      esc_attr( $slug ),
      esc_html( $label )
    );
  }
  echo '</nav>';
}

// Contact-form endpoint: `mailto:` handoff is client-side (see site.js).
// If you install Contact Form 7 or Fluent Forms, drop the shortcode inside
// page-contact.php to replace the built-in <form>. The mailto version
// works with zero plugins.

// Shrink WP head clutter for a marketing site
remove_action( 'wp_head', 'wp_generator' );
remove_action( 'wp_head', 'wlwmanifest_link' );
remove_action( 'wp_head', 'rsd_link' );
