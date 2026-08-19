const express = require('express');
const cookieParser = require('cookie-parser');
const authRoutes = require('./modules/auth/auth.routes');
const accessRoutes = require('./modules/access/access.routes');
const roleRoutes = require('./modules/roles/roles.routes');
const permissionsRoutes = require('./modules/permissions/permissions.routes');
const usersRoutes = require('./modules/users/users.routes');
const teamsRoutes = require('./modules/teams/temas.routes');
const publicRoutes = require('./modules/public/public.routes');
const adminReportsRoutes = require('./modules/adminReports/admin.routes');
const adminDashboardRoutes = require('./modules/adminDashboard/adminDashboard.routes');
const adminAuditLogsRoutes = require('./modules/adminAuditLogs/adminAuditLogs.routes');
const retentionPoliciesRoutes = require('./modules/retentionPolicies/retentionPolicies.routes');
const retentionSchedulerRoutes = require('./modules/retentionScheduler/retentionScheduler.routes');
const retentionExecutorRoutes = require('./modules/retentionExecutor/retentionExecutor.routes');
const attachmentScannerRoutes = require('./modules/attachmentScanner/attachmentScanner.routes');
const routingRulesRoutes = require("./modules/routingRules/routingRules.routes");
const routingEngineRoutes = require("./modules/routingEngine/routingEngine.routes");
const healthRoutes = require("./modules/health/health.routes");
const { configureTrustProxy,} = require("./config/trustProxy");
const { requestIdMiddleware, createSecurityHeaders, createCorsMiddleware, noStoreMiddleware, generalApiLimiter, } = require("./middlewares/security.middlewares");
const { notFoundHandler, globalErrorHandler, } = require("./middlewares/error.middlewares");
const { validateEnv, } = require("./config/validateEnv");

const app = express();

app.disable('x-powered-by');

configureTrustProxy(app);
validateEnv();

app.use(requestIdMiddleware);
app.use(createSecurityHeaders());
app.use(createCorsMiddleware());
app.use(healthRoutes);
app.use("/api",noStoreMiddleware);
app.use("/api", generalApiLimiter);
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({extended: false, limit:"64kb",}));
app.use(cookieParser());

app.use('/api/public', publicRoutes);
app.use('/api/admin/auth', authRoutes);
app.use('/api/admin/access', accessRoutes);
app.use('/api/admin/roles', roleRoutes);
app.use('/api/admin/permissions', permissionsRoutes);
app.use('/api/admin/users', usersRoutes);
app.use('/api/admin/teams', teamsRoutes);
app.use('/api/admin/reports', adminReportsRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/retention-policies', retentionPoliciesRoutes);
app.use("/api/admin/retention-scheduler", retentionSchedulerRoutes);
app.use("/api/admin/retention-executor", retentionExecutorRoutes);
app.use("/api/admin/attachment-scanner", attachmentScannerRoutes);
app.use("/api/admin/routing-rules", routingRulesRoutes);
app.use("/api/admin/routing-engine", routingEngineRoutes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
