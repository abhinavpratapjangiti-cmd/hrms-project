/**
 * Bench Analytics Service
 * ----------------------------------
 * Canonical service for all bench KPIs
 *
 * CONFIRMED SCHEMA:
 * - employees.active = 1 → active employee
 * - employees.bench_since IS NOT NULL → employee on bench
 * - payroll.month = VARCHAR(7) → YYYY-MM
 *
 * Company Cost Formula:
 * basic + hra + da + lta + special_allowance + other_allowance + pf
 */

const db = require("../db");

/* =====================================================
   INTERNAL: BENCH COST SQL EXPRESSION (SSOT)
===================================================== */
const BENCH_COST_EXPR = `
  IFNULL(p.basic, 0)
+ IFNULL(p.hra, 0)
+ IFNULL(p.da, 0)
+ IFNULL(p.lta, 0)
+ IFNULL(p.special_allowance, 0)
+ IFNULL(p.other_allowance, 0)
+ IFNULL(p.pf, 0)
`;

/* =====================================================
   INTERNAL: GET BENCH EMPLOYEES (HEADCOUNT + DAYS)
   ⚠ NO payroll join (prevents duplication)
===================================================== */
async function getBenchEmployees() {
  const sql = `
    SELECT
      e.id,
      e.bench_since,
      DATEDIFF(CURDATE(), e.bench_since) AS bench_days
    FROM employees e
    WHERE e.active = 1
      AND e.bench_since IS NOT NULL
  `;

  const [rows] = await db.query(sql);
  return rows || [];
}

/* =====================================================
   INTERNAL: TOTAL ACTIVE EMPLOYEES
===================================================== */
async function getTotalActiveEmployees() {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total FROM employees WHERE active = 1`
  );

  return rows?.[0]?.total || 0;
}

/* =====================================================
   PUBLIC: BENCH SUMMARY (HEADCOUNT KPI)
===================================================== */
async function getBenchSummary() {
  const bench = await getBenchEmployees();
  const totalEmployees = await getTotalActiveEmployees();

  const avgBenchDays =
    bench.length > 0
      ? Math.round(
          bench.reduce((s, e) => s + (Number(e.bench_days) || 0), 0) /
            bench.length
        )
      : 0;

  return {
    bench_count: bench.length,
    bench_percent: totalEmployees
      ? +((bench.length / totalEmployees) * 100).toFixed(1)
      : 0,
    avg_bench_days: avgBenchDays
  };
}

/* =====================================================
   PUBLIC: BENCH AGING BUCKETS (LOGICAL COUNTS)
   (Service returns neutral keys; route locks API contract)
===================================================== */
async function getBenchAgingBuckets() {
  const bench = await getBenchEmployees();

  return bench.reduce(
    (b, e) => {
      const d = Number(e.bench_days || 0);

      if (d <= 30) b.days_0_30++;
      else if (d <= 60) b.days_31_60++;
      else b.days_60_plus++;

      return b;
    },
    {
      days_0_30: 0,
      days_31_60: 0,
      days_60_plus: 0
    }
  );
}

/* =====================================================
   PUBLIC: BENCH BURN TREND (MONTHLY COST)
   ✅ prevents duplication
   ✅ supports rolling window
===================================================== */
async function getBenchBurnTrend(months = 6) {
  const sql = `
    SELECT
      p.month,
      SUM(${BENCH_COST_EXPR}) AS bench_cost
    FROM payroll p
    JOIN employees e ON e.id = p.employee_id
    WHERE e.active = 1
      AND e.bench_since IS NOT NULL
      AND DATE_FORMAT(e.bench_since, '%Y-%m') <= p.month
    GROUP BY p.month
    ORDER BY p.month DESC
    LIMIT ?
  `;

  const [rows] = await db.query(sql, [Number(months)]);
  return (rows || []).reverse();
}

/* =====================================================
   PUBLIC: BENCH EMPLOYEE LIST (DRILL DOWN)
===================================================== */
async function getBenchEmployeesList() {
  const sql = `
    SELECT
      e.id,
      e.name,
      e.department,
      e.designation,
      e.work_location,
      e.bench_since,
      DATEDIFF(CURDATE(), e.bench_since) AS bench_days
    FROM employees e
    WHERE e.active = 1
      AND e.bench_since IS NOT NULL
    ORDER BY bench_days DESC
  `;

  const [rows] = await db.query(sql);
  return rows || [];
}

/* =====================================================
   EXPORTS (CANONICAL)
===================================================== */
module.exports = {
  getBenchSummary,
  getBenchAgingBuckets,
  getBenchBurnTrend,
  getBenchEmployeesList
};
/* ======================================================
    END services/benchAnalytics.service.js
====================================================== */