const express =require("express");

const { requireAdminAuth } = require('../auth/auth.middleware');

const { requirePermissions } = require('../access/access.middleware');

const {getDashboardHandler,} = require("./adminDashboard.controller");

const router = express.Router();

router.use(requireAdminAuth);

router.get("/",requirePermissions("REPORT_DASHBOARD_VIEW"),getDashboardHandler);

module.exports = router;