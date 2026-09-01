const express = require('express');

const { getReportCategories, getUnits } = require('./public.controller');
const { createPublicReportHandler } = require('../reports/publicReport.controller');
const { accessReportHandler, getCurrentReportHandler, logoutReporterHandler} = require('../reports/reporterAccess.controller');
const { requireReporterAuth } = require('../reports/reporterAuth.middleware');
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const { getHistoryHandler, createMessageHandler, getMessagesHandler } = require('../reports/reporterMessages.controller');
const { uploadAttachment, uploadInitialAttachments, } = require("../adminReportAttachments/adminReportAttachments.upload");
const { listReporterAttachmentsHandler,createReporterAttachmentHandler,downloadReporterAttachmentHandler, } = require("../publicReportAttachments/publicReportAttachments.controller");
const { createPublicReportWithAttachmentsHandler,} = require("../publicReports/publicReportsWithAttachments.controller");
const {
  publicReportCreateLimiter,
  reportAccessLimiter,
} = require('../../middlewares/security.middlewares');

const router = express.Router();

router.get('/report-categories', getReportCategories);
router.get('/units', getUnits);
router.get('/reports/current', requireReporterAuth, getCurrentReportHandler);
router.get('/reports/current/messages', requireReporterAuth, getMessagesHandler);
router.get('/reports/current/history', requireReporterAuth, getHistoryHandler);
router.get("/reports/current/attachments", requireReporterAuth, listReporterAttachmentsHandler);
router.get("/reports/current/attachments/:attachmentId/download", requireReporterAuth, downloadReporterAttachmentHandler);

router.post('/reports', publicReportCreateLimiter, createPublicReportHandler);
router.post('/reports/access', reportAccessLimiter, accessReportHandler);
router.post('/reports/logout', requireReporterAuth, requireTrustedOrigin, logoutReporterHandler);
router.post('/reports/current/messages', requireReporterAuth, requireTrustedOrigin, createMessageHandler);
router.post("/reports/current/attachments", requireReporterAuth, requireTrustedOrigin, uploadAttachment, createReporterAttachmentHandler);
router.post("/reports/with-attachments",publicReportCreateLimiter,uploadInitialAttachments,createPublicReportWithAttachmentsHandler);
router.post("/with-attachments",publicReportCreateLimiter,uploadInitialAttachments,createPublicReportWithAttachmentsHandler);

module.exports = router;
