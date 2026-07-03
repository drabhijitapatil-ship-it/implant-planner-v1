<?php
/**
 * index.php — WordPress fallback for any request without a more specific template.
 * We route it to the same content the home page uses when the front page is set to a static Page.
 * If a Page named "Home" exists, WP prefers front-page.php automatically.
 */
get_header();
?>
<main id="content" class="wp-content">
  <?php if ( have_posts() ) : ?>
    <section class="hero">
      <div class="wrap wrap-narrow">
        <span class="eyebrow">Insights</span>
        <h1 style="margin:22px 0"><?php single_post_title(); ?></h1>
      </div>
    </section>
    <section style="padding-top:0">
      <div class="wrap"><div class="posts">
      <?php while ( have_posts() ) : the_post(); ?>
        <a class="post" href="<?php the_permalink(); ?>" data-testid="post-<?php echo esc_attr( get_the_ID() ); ?>">
          <div class="post__cover<?php echo (get_the_ID() % 3 === 0) ? ' post__cover--navy' : ((get_the_ID() % 3 === 1) ? ' post__cover--warm' : ''); ?>"><?php if ( has_post_thumbnail() ) the_post_thumbnail( 'large' ); ?></div>
          <div class="post__body">
            <span class="post__tag"><?php $cats = get_the_category(); echo esc_html( $cats ? $cats[0]->name : 'Insight' ); ?></span>
            <div class="post__title"><?php the_title(); ?></div>
            <div class="post__meta"><?php echo esc_html( get_the_date() ); ?> · <?php echo esc_html( round( str_word_count( strip_tags( get_the_content() ) ) / 200 ) ); ?> min read</div>
          </div>
        </a>
      <?php endwhile; ?>
      </div></div>
    </section>
  <?php else : ?>
    <section class="hero"><div class="wrap wrap-narrow"><h1>Nothing here yet.</h1><p class="lead">Insights are coming soon.</p></div></section>
  <?php endif; ?>
</main>
<?php get_footer();
