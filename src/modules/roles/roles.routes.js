const express = require('express');
const { requireAdminAuth } = require('../auth/auth.middleware');
const { requirePermissions } = require('../access/access.middleware');
const { getRoles } = require('./roles.controller'); 

const router = express.Router();

router.get('/', requireAdminAuth, requirePermissions('ROLE_MANAGE'), getRoles);

module.exports = router;