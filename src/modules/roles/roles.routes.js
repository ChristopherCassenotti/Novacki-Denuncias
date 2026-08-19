const express = require('express');
const { requireAdminAuth } = require('../auth/auth.middleware');
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const { requirePermissions } = require('../access/access.middleware');
const { getRole, getRoles, createRoleHandler, updateRoleHandler, replacePermissionsHandler, changeStatusHandler} = require('./roles.controller'); 

const router = express.Router();

router.use(requireAdminAuth);
router.use(requireTrustedOrigin);
router.use(requirePermissions('ROLE_MANAGE'));

router.get('/', getRoles);
router.get('/:id', getRole);

router.post('/', createRoleHandler);

router.patch('/:id', updateRoleHandler);
router.patch('/:id/status', changeStatusHandler);

router.put('/:id/permissions', replacePermissionsHandler);





module.exports = router;
