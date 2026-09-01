const express = require('express');
const { requireAdminAuth } = require('../auth/auth.middleware');
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const { getMyAccess } = require('./access.controller');

const router = express.Router();

router.use(requireAdminAuth);
router.use(requireTrustedOrigin);

router.get('/me', getMyAccess);

module.exports = router;
