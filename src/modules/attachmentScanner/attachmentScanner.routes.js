const express =require("express");
const { requireAdminAuth } = require('../auth/auth.middleware')
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const { requirePermissions } = require('../access/access.middleware');


const {
    scanAttachmentHandler,
    retryAttachmentScanHandler,
    runAttachmentScannerHandler,
} = require(
    "./attachmentScanner.controller"
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
        "ATTACHMENT_SCAN_RUN"
    ),
    runAttachmentScannerHandler
);

router.post(
    "/:id/run",
    requirePermissions(
        "ATTACHMENT_SCAN_RUN"
    ),
    scanAttachmentHandler
);

router.post(
    "/:id/retry",
    requirePermissions(
        "ATTACHMENT_SCAN_RUN"
    ),
    retryAttachmentScanHandler
);

module.exports =
    router;
