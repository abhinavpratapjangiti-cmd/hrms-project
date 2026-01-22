const sdk = require("node-appwrite");

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/* =====================================================
   INTERNAL: DATE DIFF (CURDATE - bench_since)
===================================================== */
function diffDays(fromDate) {
  if (!fromDate) return 0;
  const start = new Date(fromDate);
  const today = new Date();
  return Math.floor((today - start) / MS_PER_DAY);
}

/* =====================================================
   INTERNAL: BENCH COST (SSOT)
===================================================== */
function benchCost(p) {
  return (
    Number(p.basic || 0) +
    Number(p.hra || 0) +
    Number(p.da || 0) +
    Number(p.lta || 0) +
    Number(p.special_allowance || 0) +
    Number(p.other_allowance || 0) +
    Number(p.pf || 0)
  );
}

/* =====================================================
   FACTORY (inject Appwrite client)
===================================================== */
function createBenchAnalyticsService(databases, DB_ID, EMP_COL, PAYROLL_COL) {

  /* =====================================================
     INTERNAL: BENCH EMPLOYEES (HEADCOUNT + DAYS)
  ===================================================== */
  async function getBenchEmployees() {
    const res = await databases.listDocuments(
      DB_ID,
      EMP_COL,
      [
        sdk.Query.equal("active", true),
        sdk.Query.isNotNull("bench_since"),
        sdk.Query.limit(500)
      ]
    );

    return res.documents.map(e => ({
      employee_id: e.employee_id,
      bench_since: e.bench_since,
      bench_days: diffDays(e.bench_since)
    }));
  }

  /* =====================================================
     INTERNAL: TOTAL ACTIVE EMPLOYEES
  ===================================================== */
  async function getTotalActiveEmployees() {
    const res = await databases.listDocuments(
      DB_ID,
      EMP_COL,
      [
        sdk.Query.equal("active", true),
        sdk.Query.limit(1)
      ]
    );

    return res.total || 0;
  }

  /* =====================================================
     PUBLIC: BENCH SUMMARY
  ===================================================== */
  async function getBenchSummary() {
    const bench = await getBenchEmployees();
    const totalEmployees = await getTotalActiveEmployees();

    const avgBenchDays =
      bench.length > 0
        ? Math.round(
            bench.reduce((s, e) => s + e.bench_days, 0) / bench.length
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
     PUBLIC: BENCH AGING BUCKETS
  ===================================================== */
  async function getBenchAgingBuckets() {
    const bench = await getBenchEmployees();

    return bench.reduce(
      (b, e) => {
        const d = e.bench_days;

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
     PUBLIC: BENCH BURN TREND (MONTHLY)
     Same rule:
     bench_since YYYY-MM <= payroll.month
  ===================================================== */
  async function getBenchBurnTrend(months = 6) {
    const bench = await getBenchEmployees();
    if (!bench.length) return [];

    const benchMap = new Map(
      bench.map(b => [b.employee_id, b.bench_since.slice(0, 7)])
    );

    const payroll = await databases.listDocuments(
      DB_ID,
      PAYROLL_COL,
      [sdk.Query.limit(1000)]
    );

    const monthMap = {};

    for (const p of payroll.documents) {
      const benchStartMonth = benchMap.get(p.employee_id);
      if (!benchStartMonth) continue;

      if (benchStartMonth <= p.month) {
        monthMap[p.month] =
          (monthMap[p.month] || 0) + benchCost(p);
      }
    }

    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-months)
      .map(([month, bench_cost]) => ({
        month,
        bench_cost: Math.round(bench_cost)
      }));
  }

  /* =====================================================
     PUBLIC: BENCH EMPLOYEE LIST
  ===================================================== */
  async function getBenchEmployeesList() {
    const res = await databases.listDocuments(
      DB_ID,
      EMP_COL,
      [
        sdk.Query.equal("active", true),
        sdk.Query.isNotNull("bench_since"),
        sdk.Query.limit(500)
      ]
    );

    return res.documents
      .map(e => ({
        employee_id: e.employee_id,
        name: e.name,
        department: e.department,
        designation: e.designation,
        work_location: e.work_location,
        bench_since: e.bench_since,
        bench_days: diffDays(e.bench_since)
      }))
      .sort((a, b) => b.bench_days - a.bench_days);
  }

  return {
    getBenchSummary,
    getBenchAgingBuckets,
    getBenchBurnTrend,
    getBenchEmployeesList
  };
}

module.exports = {
  createBenchAnalyticsService
};
