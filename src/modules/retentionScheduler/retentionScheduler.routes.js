const express =
    require("express");

const { requireAdminAuth } = require('../auth/auth.middleware');
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const { requirePermissions } = require('../access/access.middleware');

const {
    scheduleReportHandler,
    runRetentionSchedulerHandler,
} = require(
    "./retentionScheduler.controller"
);

const router =
    express.Router();

router.use(
    requireAdminAuth
);

router.use(
    requireTrustedOrigin
);

router.post(
    "/run",
    requirePermissions(
        "RETENTION_POLICY_MANAGE"
    ),
    runRetentionSchedulerHandler
);

router.post(
    "/reports/:id",
    requirePermissions(
        "RETENTION_POLICY_MANAGE"
    ),
    scheduleReportHandler
);

module.exports =
    router;
