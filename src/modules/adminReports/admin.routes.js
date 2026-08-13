const express = require('express');
const router = express.Router();
const { requireAdminAuth } = require('../auth/auth.middleware')
const { requirePermissions } = require('../access/access.middleware');
const { getReportHandler, getReportsHandler } = require('./admin.controller');

router.use(requireAdminAuth);
router.use(requirePermissions('REPORT_VIEW'));

router.get('/', getReportsHandler);
router.get('/:id', getReportHandler);

module.exports = router;