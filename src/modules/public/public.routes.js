const express = require('express');

const { getReportCategories, getUnits } = require('./public.controller');
const { createPublicReportHandler } = require('../reports/publicReport.controller');
const { accessReportHandler, getCurrentReportHandler, logoutReporterHandler} = require('../reports/reporterAccess.controller');
const { requireReporterAuth } = require('../reports/reporterAuth.middleware');

const router = express.Router();

router.get('/report-categories', getReportCategories);
router.get('/units', getUnits);
router.get('/reports/current', requireReporterAuth, getCurrentReportHandler);

router.post('/reports', createPublicReportHandler);
router.post('/reports/access', accessReportHandler);
router.post('/reports/logout', requireReporterAuth, logoutReporterHandler);


module.exports = router;