const express = require('express');
const router = express.Router();
const { requireAdminAuth } = require('../auth/auth.middleware')
const { requirePermissions } = require('../access/access.middleware');
const { getReportHandler, getReportsHandler, updateStatusHandler, updatePriorityHandler, assignReportHandler , unassignReportHandler } = require('./admin.controller');
const { listMessagesHandler, createMessageHandler } = require('../adminReportMessages/adminReportMessages.controller');
const { listInternalNotesHandler, createInternalNoteHandler } = require('../adminReportsInternalNotes/adminReportInternalNotes.controller');

router.use(requireAdminAuth);
router.use(requirePermissions('REPORT_VIEW'));

router.get('/', getReportsHandler);
router.get('/:id', getReportHandler);
router.get('/:id/messages', requirePermissions('REPORT_MESSAGE'), listMessagesHandler);
router.get('/:id/internal-notes', requirePermissions('REPORT_INTERNAL_NOTE'), listInternalNotesHandler);

router.post('/:id/messages', requirePermissions('REPORT_MESSAGE'), createMessageHandler);
router.post('/:id/internal-notes', requirePermissions('REPORT_INTERNAL_NOTE'), createInternalNoteHandler);

router.patch('/:id/status', requirePermissions('REPORT_MANAGE'), updateStatusHandler);
router.patch('/:id/priority', requirePermissions('REPORT_MANAGE'), updatePriorityHandler);

router.put('/:id/assignment', requirePermissions('REPORT_MANAGE'), assignReportHandler);

router.delete('/:id/assignment', requirePermissions('REPORT_MANAGE'), unassignReportHandler);


module.exports = router;