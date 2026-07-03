<?php
/**
 * page.php — Generic fallback for any WordPress Page that doesn't have a
 * dedicated Implanr template. Renders the page title + WP editor content
 * inside a calm, on-brand hero + article layout.
 */
get_header(); ?>
<main id="content">
  <?php while ( have_posts() ) : the_post(); ?>
    <section class="hero" style="padding-bottom:32px">
      <div class="wrap wrap-narrow">
        <h1 style="margin:22px 0"><?php the_title(); ?></h1>
      </div>
    </section>
    <section style="padding-top:0">
      <div class="wrap wrap-narrow">
        <article class="wp-post-content"><?php the_content(); ?></article>
      </div>
    </section>
  <?php endwhile; ?>
</main>
<?php get_footer();
