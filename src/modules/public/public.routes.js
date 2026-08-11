const express = require('express');

const { getReportCategories, getUnits } = require('./public.controller');

const router = express.Router();

router.get('/report-categories', getReportCategories);
router.get('/units', getUnits);

module.exports = router;