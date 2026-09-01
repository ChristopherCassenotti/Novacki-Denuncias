const express = require("express");

const { requireAdminAuth } = require('../auth/auth.middleware');
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const { requirePermissions } = require('../access/access.middleware');

const {
    listHandler,
    getHandler,
    createHandler,
    updateHandler,
    statusHandler,
} = require(
    "./routingRules.controller"
);

const router =
    express.Router();

router.use(
    requireAdminAuth
);

//router.use(requireTrustedOrigin);

router.use(
    requirePermissions(
        "ROUTING_MANAGE"
    )
);

router.get(
    "/",
    listHandler
);

router.get(
    "/:id",
    getHandler
);

router.post(
    "/",
    createHandler
);

router.patch(
    "/:id",
    updateHandler
);

router.patch(
    "/:id/status",
    statusHandler
);

module.exports =
    router;
