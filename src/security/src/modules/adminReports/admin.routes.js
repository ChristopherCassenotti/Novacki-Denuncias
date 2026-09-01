const express = require('express');
const router = express.Router();
const { requireAdminAuth } = require('../auth/auth.middleware')
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const { getReportHandler, getReportsHandler, updateStatusHandler, updatePriorityHandler, assignReportHandler , unassignReportHandler } = require('./admin.controller');
const { listMessagesHandler, createMessageHandler } = require('../adminReportMessages/adminReportMessages.controller');
const { listInternalNotesHandler, createInternalNoteHandler } = require('../adminReportsInternalNotes/adminReportInternalNotes.controller');
const { getIdentityHandler } = require('../adminReportIdentity/adminReportIdentity.controller');
const { listRestrictionsHandler,createRestrictionHandler,revokeRestrictionHandler, } = require('../adminReportRestrictions/adminReportRestrictions.controller');
const { requireReportAccess } = require('../reports/reportAccess.middleware');
const { listAccessGrantsHandler, createAccessGrantHandler, revokeAccessGrantHandler } = require('../adminReportAccessGrants/adminReportAccessGrants.controller');
const { requireReportCapability, requireReportStatusCapability, } = require("../access/reportCapability.middleware");
const { uploadAttachment, } = require("../adminReportAttachments/adminReportAttachments.upload");
const { listAttachmentsHandler,createAttachmentHandler, downloadAttachmentHandler } = require("../adminReportAttachments/adminReportAttachments.controller");
const {
    getLegalHoldHandler,
    applyLegalHoldHandler,
    releaseLegalHoldHandler,
} = require(
    "../adminReportLegalHold/adminReportLegalHold.controller"
);
const { requirePermissions } = require('../access/access.middleware');


router.use(requireAdminAuth);
router.use(requireTrustedOrigin);
router.param('id', requireReportAccess);

router.get('/', getReportsHandler);
router.get('/:id',requireReportCapability({permission:"REPORT_VIEW", scope:"VIEW",}), getReportHandler);
router.get('/:id/messages', requireReportCapability({permission:"REPORT_MESSAGE",scope:"MESSAGE",}), listMessagesHandler);
router.get('/:id/internal-notes', requireReportCapability({permission:"REPORT_INTERNAL_NOTE",scope:"INVESTIGATE",}), listInternalNotesHandler);
router.get('/:id/identity', requireReportCapability({permission:"REPORT_IDENTITY_VIEW",scope:"INVESTIGATE",}), getIdentityHandler);
router.get('/:id/restrictions', requireReportCapability({permission:"REPORT_RESTRICT_USER",scope:"MANAGE",}), listRestrictionsHandler);
router.get('/:id/access-grants',requireReportCapability({permission:"REPORT_MANAGE_ACCESS",scope:"MANAGE",}),listAccessGrantsHandler);
router.get("/:id/attachments",requireReportCapability({permission:"REPORT_ATTACHMENT",scope:"INVESTIGATE",}),listAttachmentsHandler);
router.get("/:id/attachments/:attachmentId/download", requireReportCapability({permission:"REPORT_ATTACHMENT",scope:"INVESTIGATE",}), downloadAttachmentHandler);

router.post('/:id/messages', requireReportCapability({permission:"REPORT_MESSAGE",scope:"MESSAGE",}), createMessageHandler);
router.post('/:id/internal-notes', requireReportCapability({permission:"REPORT_INTERNAL_NOTE",scope:"INVESTIGATE",}), createInternalNoteHandler);
router.post('/:id/restrictions', requireReportCapability({permission:"REPORT_RESTRICT_USER",scope:"MANAGE",}), createRestrictionHandler);
router.post('/:id/access-grants',requireReportCapability({permission:"REPORT_MANAGE_ACCESS",scope:"MANAGE",}),createAccessGrantHandler);
router.post("/:id/attachments",requireReportCapability({permission:"REPORT_ATTACHMENT",scope:"INVESTIGATE",}),uploadAttachment,createAttachmentHandler);

router.patch('/:id/status', requireReportStatusCapability, updateStatusHandler);
router.patch('/:id/priority', requireReportCapability({permission:"REPORT_CHANGE_PRIORITY",scope:"MANAGE",}), updatePriorityHandler);

router.put('/:id/assignment', requireReportCapability({permission:"REPORT_ASSIGN",scope:"MANAGE",}), assignReportHandler);

router.delete('/:id/assignment', requireReportCapability({permission:"REPORT_ASSIGN",scope:"MANAGE",}), unassignReportHandler);
router.delete('/:id/restrictions/:userId', requireReportCapability({permission:"REPORT_RESTRICT_USER",scope:"MANAGE",}), revokeRestrictionHandler);
router.delete('/:id/access-grants/:grantId',requireReportCapability({permission:"REPORT_MANAGE_ACCESS",scope:"MANAGE",}),revokeAccessGrantHandler);

router.get(
    "/:id/legal-hold",
    requirePermissions(
        "REPORT_LEGAL_HOLD_MANAGE"
    ),
    getLegalHoldHandler
);

router.post(
    "/:id/legal-hold",
    requirePermissions(
        "REPORT_LEGAL_HOLD_MANAGE"
    ),
    applyLegalHoldHandler
);

router.post(
    "/:id/legal-hold/release",
    requirePermissions(
        "REPORT_LEGAL_HOLD_MANAGE"
    ),
    releaseLegalHoldHandler
);

module.exports = router;
