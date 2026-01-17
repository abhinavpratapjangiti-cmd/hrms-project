require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");

/* =========================
   APP INIT
========================= */
const app = express();
app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

/* =========================
   DB INIT (FAIL FAST)
========================= */
require("./db");

/* =========================
   CRON JOBS
========================= */
require("./cron/timesheetLockCron");

/* =========================
   WEBSOCKET INIT (CRITICAL)
========================= */
const { initWebSocket } = require("./routes/wsServer");

/* =========================
   MIDDLEWARE
========================= */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================
   STATIC ASSETS
========================= */
app.use("/assets", express.static(path.join(__dirname, "public/assets")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =========================
   ROUTE LOADER (FAIL FAST)
========================= */
function requireRoute(routePath) {
  try {
    return require(routePath);
  } catch (err) {
    console.error(`❌ Failed to load route: ${routePath}`);
    throw err;
  }
}

/* =========================
   ROUTE IMPORTS
========================= */
const authRoutes            = requireRoute("./routes/auth");
const holidayRoutes         = requireRoute("./routes/holiday");
const teamRoutes            = requireRoute("./routes/team");
const attendanceRoutes      = requireRoute("./routes/attendance");
const leaveRoutes           = requireRoute("./routes/leaves");
const payslipRoutes         = requireRoute("./routes/payslips");
const payrollRoutes         = requireRoute("./routes/payroll");
const payrollUploadRoutes   = requireRoute("./routes/payroll-upload");
const thoughtRoutes         = requireRoute("./routes/thought");
const notificationRoutes    = requireRoute("./routes/notifications");
const usersRoutes           = requireRoute("./routes/users");
const timesheetRoutes       = requireRoute("./routes/timesheets");
const employeeRoutes        = requireRoute("./routes/employee");
const festivalRoutes        = requireRoute("./routes/festival");
const managerRoutes         = requireRoute("./routes/manager");
const documentRoutes        = requireRoute("./routes/documents");
const decisionRoutes        = requireRoute("./routes/decisions");
const executiveRoutes       = requireRoute("./routes/executive");
const profileRoutes         = requireRoute("./routes/profile");


/* =========================
   ANALYTICS ROUTES
========================= */
const analyticsProfileRoutes = requireRoute("./routes/analytics-profile");
const analyticsBenchRoutes   = requireRoute("./routes/analytics-bench");
const analyticsRoutes        = requireRoute("./routes/analytics");

/* =========================
   API ROUTES (ORDER MATTERS)
========================= */
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/employees", employeeRoutes);

app.use("/api/holiday", holidayRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/leaves", leaveRoutes);

app.use("/api/payslips", payslipRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/payroll", payrollUploadRoutes);

app.use("/api/thought", thoughtRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/festival", festivalRoutes);
app.use("/api/timesheets", timesheetRoutes);
app.use("/api/manager", managerRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/decisions", decisionRoutes);
app.use("/api/executive", executiveRoutes);
app.use("/api/profile", profileRoutes);
/* =========================
   ANALYTICS (LOCKED)
========================= */
app.use("/api/analytics/profile", analyticsProfileRoutes);
app.use("/api/analytics/bench", analyticsBenchRoutes);
app.use("/api/analytics", analyticsRoutes);

/* =========================
   HEALTH CHECK
========================= */
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    environment: NODE_ENV,
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

/* =========================
   API FALLBACK
========================= */
app.use("/api", (req, res) => {
  res.status(404).json({
    message: "API route not found",
    path: req.originalUrl
  });
});

/* =========================
   FRONTEND (SPA)
========================= */
const frontendPath = path.join(__dirname, "../frontend");
app.use(express.static(frontendPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* =========================
   GLOBAL ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  console.error("❌ Unhandled Error:", err);
  res.status(500).json({
    message: "Internal server error",
    ...(NODE_ENV !== "production" && { error: err.message })
  });
});

/* =========================
   START SERVER (HTTP + WS)
========================= */
const server = http.createServer(app);

/* 🔔 ATTACH WEBSOCKET SERVER (MANDATORY) */
initWebSocket(server);

server.listen(PORT, () => {
  console.log(`🚀 HRMS running on port ${PORT}`);
  console.log(`🌱 Environment: ${NODE_ENV}`);
});
