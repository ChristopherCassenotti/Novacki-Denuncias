const express = require('express');

const { getReportCategories, getUnits } = require('./public.controller');
const { createPublicReportHandler } = require('../reports/publicReport.controller');
const { accessReportHandler, getCurrentReportHandler, logoutReporterHandler} = require('../reports/reporterAccess.controller');
const { requireReporterAuth } = require('../reports/reporterAuth.middleware');
const { getHistoryHandler, createMessageHandler, getMessagesHandler } = require('../reports/reporterMessages.controller');

const router = express.Router();

router.get('/report-categories', getReportCategories);
router.get('/units', getUnits);
router.get('/reports/current', requireReporterAuth, getCurrentReportHandler);
router.get('/reports/current/messages', requireReporterAuth, getMessagesHandler);
router.get('/reports/current/history', requireReporterAuth, getHistoryHandler);

router.post('/reports', createPublicReportHandler);
router.post('/reports/access', accessReportHandler);
router.post('/reports/logout', requireReporterAuth, logoutReporterHandler);
router.post('/reports/current/messages', requireReporterAuth, createMessageHandler);

module.exports = router;