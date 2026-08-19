const express =
    require("express");

const { requireAdminAuth } = require('../auth/auth.middleware');
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const { requirePermissions } = require('../access/access.middleware');

const {
    executeRetentionHandler,
    runRetentionExecutorHandler,
} = require(
    "./retentionExecutor.controller"
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
        "RETENTION_EXECUTE"
    ),
    runRetentionExecutorHandler
);

router.post(
    "/:id/run",
    requirePermissions(
        "RETENTION_EXECUTE"
    ),
    executeRetentionHandler
);

module.exports =
    router;
