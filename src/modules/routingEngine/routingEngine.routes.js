const express = require("express");

const { requireAdminAuth } = require('../auth/auth.middleware');
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const { requirePermissions } = require('../access/access.middleware');

const {
    runHandler,
} = require(
    "./routingEngine.controller"
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
    "/reports/:id/run",
    requirePermissions(
        "ROUTING_RULE_MANAGE"
    ),
    runHandler
);

module.exports =
    router;
