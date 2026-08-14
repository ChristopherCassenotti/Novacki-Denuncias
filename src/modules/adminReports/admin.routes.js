const express = require('express');
const router = express.Router();
const { requireAdminAuth } = require('../auth/auth.middleware')
const { requirePermissions } = require('../access/access.middleware');
const { getReportHandler, getReportsHandler, updateStatusHandler, updatePriorityHandler, assignReportHandler , unassignReportHandler } = require('./admin.controller');
const { listMessagesHandler, createMessageHandler } = require('../adminReportMessages/adminReportMessages.controller');
const { listInternalNotesHandler, createInternalNoteHandler } = require('../adminReportsInternalNotes/adminReportInternalNotes.controller');
const { getIdentityHandler } = require('../adminReportIdentity/adminReportIdentity.controller');
const { listRestrictionsHandler,createRestrictionHandler,revokeRestrictionHandler, } = require('../adminReportRestrictions/adminReportRestrictions.controller');
const { requireReportAccess } = require('../reports/reportAccess.middleware');
const { listAccessGrantsHandler, createAccessGrantHandler, revokeAccessGrantHandler } = require('../adminReportAccessGrants/adminReportAccessGrants.controller');
const { requireReportCapability, } = require("../access/reportCapability.middleware");

router.use(requireAdminAuth);
router.use(requirePermissions('REPORT_VIEW'));
router.param('id', requireReportAccess);

router.get('/', getReportsHandler);
router.get('/:id',requireReportCapability({permission:"REPORT_VIEW", scope:"VIEW",}), getReportHandler);
router.get('/:id/messages', requireReportCapability({permission:"REPORT_MESSAGE",scope:"MESSAGE",}), listMessagesHandler);
router.get('/:id/internal-notes', requireReportCapability({permission:"REPORT_INTERNAL_NOTE",scope:"INVESTIGATE",}), listInternalNotesHandler);
router.get('/:id/identity', requirePermissions('REPORT_IDENTITY_VIEW'), getIdentityHandler);
router.get('/:id/restrictions', requirePermissions('REPORT_RESTRICTION_MANAGE'), listRestrictionsHandler);
router.get('/:id/access-grants',requirePermissions('REPORT_ACCESS_GRANT_MANAGE'),listAccessGrantsHandler);

router.post('/:id/messages', requireReportCapability({permission:"REPORT_MESSAGE",scope:"MESSAGE",}), createMessageHandler);
router.post('/:id/internal-notes', requireReportCapability({permission:"REPORT_INTERNAL_NOTE",scope:"INVESTIGATE",}), createInternalNoteHandler);
router.post('/:id/restrictions', requirePermissions('REPORT_RESTRICTION_MANAGE'), createRestrictionHandler);
router.post('/:id/access-grants',requirePermissions('REPORT_ACCESS_GRANT_MANAGE'),createAccessGrantHandler);

router.patch('/:id/status', requireReportCapability({permission:"REPORT_MANAGE",scope:"MANAGE",}), updateStatusHandler);
router.patch('/:id/priority', requireReportCapability({permission:"REPORT_MANAGE",scope:"MANAGE",}), updatePriorityHandler);

router.put('/:id/assignment', requireReportCapability({permission:"REPORT_MANAGE",scope:"MANAGE",}), assignReportHandler);

router.delete('/:id/assignment', requireReportCapability({permission:"REPORT_MANAGE",scope:"MANAGE",}), unassignReportHandler);
router.delete('/:id/restrictions/:userId', requirePermissions('REPORT_RESTRICTION_MANAGE'), revokeRestrictionHandler);
router.delete('/:id/access-grants/:grantId',requirePermissions('REPORT_ACCESS_GRANT_MANAGE'),revokeAccessGrantHandler);

module.exports = router;