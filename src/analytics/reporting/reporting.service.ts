import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Reporting service queries the OLAP reporting tables — never the
 * hot transactional tables. This is an important pattern to call out:
 * analytical queries run against pre-aggregated snapshots, keeping
 * the transactional database fast and unconstrained.
 */
@Injectable()
export class ReportingService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getDailySalesSummary(days = 30) {
    return this.dataSource.query(`
      SELECT
        report_date,
        total_orders,
        completed_orders,
        cancelled_orders,
        gmv,
        avg_order_value,
        new_listings,
        new_users,
        ROUND(
          AVG(gmv) OVER (
            ORDER BY report_date
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
          ), 2
        ) AS gmv_7d_avg
      FROM report_daily_sales
      WHERE report_date >= CURRENT_DATE - ($1 || ' days')::INTERVAL
      ORDER BY report_date DESC
    `, [days]);
  }

  async getTopSellers(limit = 10, days = 30) {
    return this.dataSource.query(`
      SELECT
        u.id                          AS seller_id,
        u.first_name,
        u.last_name,
        SUM(rsp.revenue)              AS total_revenue,
        SUM(rsp.completed_orders)     AS total_orders,
        ROUND(AVG(rsp.avg_rating), 2) AS avg_rating,
        RANK() OVER (ORDER BY SUM(rsp.revenue) DESC) AS revenue_rank
      FROM report_seller_performance rsp
      JOIN users u ON u.id = rsp.seller_id
      WHERE rsp.report_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY total_revenue DESC
      LIMIT $1
    `, [limit, days]);
  }

  async getCategoryTrends(weeks = 8) {
    return this.dataSource.query(`
      SELECT
        c.id            AS category_id,
        c.name          AS category_name,
        rct.week_start,
        rct.total_listings,
        rct.total_orders,
        rct.gmv,
        rct.avg_price,
        ROUND(
          100.0 * (rct.gmv - LAG(rct.gmv) OVER (
            PARTITION BY rct.category_id ORDER BY rct.week_start
          )) / NULLIF(LAG(rct.gmv) OVER (
            PARTITION BY rct.category_id ORDER BY rct.week_start
          ), 0),
          2
        ) AS gmv_wow_pct
      FROM report_category_trends rct
      JOIN categories c ON c.id = rct.category_id
      WHERE rct.week_start >= CURRENT_DATE - ($1 || ' weeks')::INTERVAL
      ORDER BY c.name, rct.week_start DESC
    `, [weeks]);
  }

  async getSellerPerformance(sellerId: string, days = 30) {
    const [timeseries, summary] = await Promise.all([
      this.dataSource.query(`
        SELECT
          report_date,
          new_orders,
          completed_orders,
          revenue,
          conversion_rate,
          avg_rating
        FROM report_seller_performance
        WHERE seller_id = $1
          AND report_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
        ORDER BY report_date DESC
      `, [sellerId, days]),

      this.dataSource.query(`
        SELECT
          SUM(revenue)                          AS total_revenue,
          SUM(completed_orders)                 AS total_completed,
          SUM(new_orders)                       AS total_orders,
          ROUND(AVG(avg_rating), 2)             AS avg_rating,
          ROUND(AVG(conversion_rate) * 100, 2)  AS avg_conversion_rate_pct
        FROM report_seller_performance
        WHERE seller_id = $1
          AND report_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      `, [sellerId, days]),
    ]);

    return { summary: summary[0], timeseries };
  }
}