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
const { apiRateLimiter } = require('./modules/auth/auth.rateLimit');
const { errorHandler,notFoundHandler,requireTrustedOrigin,securityHeaders,} = require('./security/http.middleware');

const app = express();

app.disable('x-powered-by');

const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

app.use(securityHeaders);
app.use(apiRateLimiter);
app.use('/api/admin', requireTrustedOrigin);
app.use(express.json({ limit: "100kb" }));
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
app.use('/api/admin/audit-logs', adminAuditLogsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
