import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Nightly aggregation jobs — the Data Engineering layer.
 *
 * These jobs populate the reporting tables (report_*) by running
 * analytical queries against the transactional schema (OLTP → OLAP).
 *
 * Key DE patterns demonstrated:
 *  - Separation of transactional (OLTP) and analytical (OLAP) tables
 *  - Idempotent upserts (safe to re-run using ON CONFLICT DO UPDATE)
 *  - Window functions for ranking and trend analysis
 *  - Incremental snapshots by date
 */
@Injectable()
export class AggregationJob {
  private readonly logger = new Logger(AggregationJob.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ── Daily sales summary ── runs at 01:00 UTC every day ──

  @Cron('0 1 * * *', { name: 'daily-sales-aggregation' })
  async aggregateDailySales() {
    this.logger.log('Starting daily sales aggregation...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const reportDate = yesterday.toISOString().split('T')[0];

    await this.dataSource.query(`
      INSERT INTO report_daily_sales (
        report_date,
        total_orders,
        completed_orders,
        cancelled_orders,
        gmv,
        avg_order_value,
        new_listings,
        new_users
      )
      SELECT
        $1::date                                                  AS report_date,
        COUNT(*)                                                  AS total_orders,
        COUNT(*) FILTER (WHERE o.status = 'completed')           AS completed_orders,
        COUNT(*) FILTER (WHERE o.status = 'cancelled')           AS cancelled_orders,
        COALESCE(SUM(o.total_amount) FILTER (
          WHERE o.status IN ('paid','shipped','delivered','completed')
        ), 0)                                                     AS gmv,
        COALESCE(AVG(o.total_amount) FILTER (
          WHERE o.status IN ('paid','shipped','delivered','completed')
        ), 0)                                                     AS avg_order_value,
        (SELECT COUNT(*) FROM listings
          WHERE DATE(created_at) = $1::date
          AND deleted_at IS NULL)                                 AS new_listings,
        (SELECT COUNT(*) FROM users
          WHERE DATE(created_at) = $1::date)                     AS new_users
      FROM orders o
      WHERE DATE(o.created_at) = $1::date
      ON CONFLICT (report_date) DO UPDATE SET
        total_orders     = EXCLUDED.total_orders,
        completed_orders = EXCLUDED.completed_orders,
        cancelled_orders = EXCLUDED.cancelled_orders,
        gmv              = EXCLUDED.gmv,
        avg_order_value  = EXCLUDED.avg_order_value,
        new_listings     = EXCLUDED.new_listings,
        new_users        = EXCLUDED.new_users
    `, [reportDate]);

    this.logger.log(`Daily sales aggregation complete for ${reportDate}`);
  }

  // ── Seller performance ── runs at 01:30 UTC every day ──

  @Cron('30 1 * * *', { name: 'seller-performance-aggregation' })
  async aggregateSellerPerformance() {
    this.logger.log('Starting seller performance aggregation...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const reportDate = yesterday.toISOString().split('T')[0];

    await this.dataSource.query(`
      INSERT INTO report_seller_performance (
        report_date,
        seller_id,
        active_listings,
        new_orders,
        completed_orders,
        revenue,
        conversion_rate,
        avg_rating
      )
      SELECT
        $1::date                                                        AS report_date,
        u.id                                                            AS seller_id,
        COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active')        AS active_listings,
        COUNT(DISTINCT o.id)                                            AS new_orders,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'completed')     AS completed_orders,
        COALESCE(SUM(o.total_amount) FILTER (
          WHERE o.status = 'completed'
        ), 0)                                                           AS revenue,
        CASE
          WHEN COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active') > 0
          THEN COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'completed')::numeric /
               COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active')
          ELSE 0
        END                                                             AS conversion_rate,
        COALESCE(AVG(r.rating), 0)                                      AS avg_rating
      FROM users u
      LEFT JOIN listings l ON l.seller_id = u.id AND l.deleted_at IS NULL
      LEFT JOIN orders o   ON o.seller_id = u.id AND DATE(o.created_at) = $1::date
      LEFT JOIN reviews r  ON r.seller_id = u.id
      WHERE u.role = 'seller'
      GROUP BY u.id
      ON CONFLICT (report_date, seller_id) DO UPDATE SET
        active_listings  = EXCLUDED.active_listings,
        new_orders       = EXCLUDED.new_orders,
        completed_orders = EXCLUDED.completed_orders,
        revenue          = EXCLUDED.revenue,
        conversion_rate  = EXCLUDED.conversion_rate,
        avg_rating       = EXCLUDED.avg_rating
    `, [reportDate]);

    this.logger.log(`Seller performance aggregation complete for ${reportDate}`);
  }

  // ── Category trends ── runs every Monday at 02:00 UTC ──

  @Cron('0 2 * * 1', { name: 'category-trends-aggregation' })
  async aggregateCategoryTrends() {
    this.logger.log('Starting category trends aggregation...');

    const now = new Date();
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek - 7);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    await this.dataSource.query(`
      INSERT INTO report_category_trends (
        week_start,
        category_id,
        total_listings,
        total_orders,
        gmv,
        avg_price
      )
      SELECT
        $1::date                                          AS week_start,
        c.id                                             AS category_id,
        COUNT(DISTINCT l.id)                             AS total_listings,
        COUNT(DISTINCT o.id)                             AS total_orders,
        COALESCE(SUM(o.total_amount) FILTER (
          WHERE o.status IN ('paid','shipped','delivered','completed')
        ), 0)                                            AS gmv,
        COALESCE(AVG(l.price), 0)                        AS avg_price
      FROM categories c
      LEFT JOIN listings l ON l.category_id = c.id
        AND l.created_at >= $1::date
        AND l.created_at < $1::date + INTERVAL '7 days'
        AND l.deleted_at IS NULL
      LEFT JOIN orders o ON o.listing_id = l.id
      WHERE c.is_active = true
      GROUP BY c.id
      ON CONFLICT (week_start, category_id) DO UPDATE SET
        total_listings = EXCLUDED.total_listings,
        total_orders   = EXCLUDED.total_orders,
        gmv            = EXCLUDED.gmv,
        avg_price      = EXCLUDED.avg_price
    `, [weekStartStr]);

    this.logger.log(`Category trends aggregation complete for week of ${weekStartStr}`);
  }

  // ── Manual trigger ── useful for testing without waiting for cron ──

  async runAll() {
    await this.aggregateDailySales();
    await this.aggregateSellerPerformance();
    await this.aggregateCategoryTrends();
  }
}