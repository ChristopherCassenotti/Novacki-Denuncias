const express =
    require("express");

const {
    requireAdminAuth,
} = require(
    "../auth/auth.middleware"
);

const {
    requirePermissions,
} = require(
    "../access/access.middleware"
);

const {
    listHandler,
} = require(
    "./retentionExecutions.controller"
);


const router =
    express.Router();

router.use(
    requireAdminAuth
);

router.get(
    "/",
    requirePermissions(
        "RETENTION_EXECUTE"
    ),
    listHandler
);


module.exports =
    router;