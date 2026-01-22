/**
 * Executive Action Service (Appwrite)
 * ----------------------------------
 * Converts bench analytics into leadership decisions
 *
 * DEPENDS ON:
 * - Appwrite Bench Analytics Service instance
 */

const THRESHOLDS = {
  UTIL_CRITICAL: 50,
  UTIL_WARNING: 70,
  BENCH_DAYS_CRITICAL: 60
};

/* =====================================================
   FACTORY
   (Inject BenchAnalyticsService instance)
===================================================== */
function createExecutiveActionService(BenchAnalyticsService) {

  /* =====================================================
     PUBLIC: EXECUTIVE ACTIONS
  ===================================================== */
  async function getExecutiveActions() {
    const summary = await BenchAnalyticsService.getBenchSummary();
    const aging   = await BenchAnalyticsService.getBenchAgingBuckets();
    const burn    = await BenchAnalyticsService.getBenchBurnTrend(3);

    const utilization =
      100 - Number(summary.bench_percent || 0);

    const actions = [];

    /* =============================
       UTILIZATION
    ============================= */
    if (utilization < THRESHOLDS.UTIL_CRITICAL) {
      actions.push({
        level: "CRITICAL",
        title: "Utilization at critical level",
        insight: `Only ${utilization.toFixed(1)}% of workforce is billable`,
        action:
          "Freeze hiring, accelerate redeployment, push sales closures"
      });
    } else if (utilization < THRESHOLDS.UTIL_WARNING) {
      actions.push({
        level: "WARNING",
        title: "Utilization below optimal",
        insight: `Utilization at ${utilization.toFixed(1)}%`,
        action:
          "Prioritize bench allocation within 30 days"
      });
    }

    /* =============================
       BENCH AGING
    ============================= */
    if (aging.days_60_plus > 0) {
      actions.push({
        level: "CRITICAL",
        title: "Long bench aging detected",
        insight:
          `${aging.days_60_plus} employees idle > ${THRESHOLDS.BENCH_DAYS_CRITICAL} days`,
        action:
          "Escalate to delivery & sales heads for redeployment or exit"
      });
    }

    /* =============================
       BENCH BURN TREND
    ============================= */
    if (burn.length >= 2) {
      const last = burn[burn.length - 1].bench_cost;
      const prev = burn[burn.length - 2].bench_cost;

      if (Number(last) > Number(prev)) {
        actions.push({
          level: "WARNING",
          title: "Bench cost increasing",
          insight:
            `Bench burn increased from ₹${prev} to ₹${last}`,
          action:
            "Review cost controls and billing timelines"
        });
      }
    }

    /* =============================
       DEFAULT HEALTHY STATE
    ============================= */
    if (!actions.length) {
      actions.push({
        level: "OK",
        title: "Organization operating within safe limits",
        insight:
          "Utilization and bench metrics are healthy",
        action:
          "Maintain current hiring and delivery cadence"
      });
    }

    return {
      utilization: utilization.toFixed(1),
      summary,
      actions
    };
  }

  return {
    getExecutiveActions
  };
}

module.exports = {
  createExecutiveActionService
};
