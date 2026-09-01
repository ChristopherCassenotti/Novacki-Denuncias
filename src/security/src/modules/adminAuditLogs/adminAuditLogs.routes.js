const express =require("express");
const { requireAdminAuth } = require('../auth/auth.middleware');
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const { requirePermissions } = require('../access/access.middleware');
const {listAuditLogsHandler,getAuditLogHandler,} = require("./adminAuditLogs.controller");

const router =express.Router();

router.use(requireAdminAuth);
router.use(requireTrustedOrigin);

router.get("/",requirePermissions("AUDIT_LOG_VIEW"),listAuditLogsHandler);

router.get("/:id",requirePermissions("AUDIT_LOG_VIEW"),getAuditLogHandler);

module.exports = router;
