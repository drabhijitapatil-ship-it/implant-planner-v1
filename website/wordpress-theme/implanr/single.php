<?php
/**
 * single.php — WordPress single-post template (blog post detail).
 */
get_header(); ?>
<main id="content">
  <?php while ( have_posts() ) : the_post(); ?>
    <section class="hero" style="padding-bottom:32px">
      <div class="wrap wrap-narrow">
        <span class="eyebrow"><?php $cats = get_the_category(); echo esc_html( $cats ? $cats[0]->name : 'Insight' ); ?></span>
        <h1 style="margin:22px 0"><?php the_title(); ?></h1>
        <div style="font-size:13px;color:#94A3B8">By <?php the_author(); ?> · <?php echo esc_html( get_the_date() ); ?></div>
      </div>
    </section>
    <?php if ( has_post_thumbnail() ) : ?>
      <div class="wrap wrap-narrow" style="margin-bottom:40px"><?php the_post_thumbnail( 'large', array( 'style' => 'width:100%;border-radius:20px' ) ); ?></div>
    <?php endif; ?>
    <section style="padding-top:0">
      <div class="wrap wrap-narrow">
        <article class="wp-post-content"><?php the_content(); ?></article>
      </div>
    </section>
  <?php endwhile; ?>
</main>
<?php get_footer();
