const express = require('express');
const { requireAdminAuth } = require('../auth/auth.middleware');
const { getMyAccess } = require('./access.controller');

const router = express.Router();

router.get('/me', requireAdminAuth, getMyAccess);

module.exports = router;