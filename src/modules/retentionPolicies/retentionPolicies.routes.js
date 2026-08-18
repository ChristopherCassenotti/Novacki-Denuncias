const express =require("express");
const { requireAdminAuth } = require('../auth/auth.middleware')
const { requirePermissions } = require('../access/access.middleware');

const {
    listRetentionPoliciesHandler,
    getRetentionPolicyHandler,
    createRetentionPolicyHandler,
    updateRetentionPolicyHandler,
    changeRetentionPolicyStatusHandler,
} = require(
    "./retentionPolicies.controller"
);

const router =
    express.Router();

router.use(
    requireAdminAuth
);

router.get(
    "/",
    requirePermissions(
        "RETENTION_POLICY_MANAGE"
    ),
    listRetentionPoliciesHandler
);

router.get(
    "/:id",
    requirePermissions(
        "RETENTION_POLICY_MANAGE"
    ),
    getRetentionPolicyHandler
);

router.post(
    "/",
    requirePermissions(
        "RETENTION_POLICY_MANAGE"
    ),
    createRetentionPolicyHandler
);

router.patch(
    "/:id",
    requirePermissions(
        "RETENTION_POLICY_MANAGE"
    ),
    updateRetentionPolicyHandler
);

router.patch(
    "/:id/status",
    requirePermissions(
        "RETENTION_POLICY_MANAGE"
    ),
    changeRetentionPolicyStatusHandler
);

module.exports =
    router;