const express = require('express');
const router = express.Router();
const { requireAdminAuth } = require('../auth/auth.middleware');
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const { requirePermissions } = require('../access/access.middleware');
const {getPermissions} = require('./permissions.controller');

router.use(requireAdminAuth);
router.use(requireTrustedOrigin);

router.get('/', requirePermissions('ROLE_MANAGE'), getPermissions);

module.exports = router;
