const express = require('express');
const router = express.Router();
const { getUser, getUsers, getAssignableRoles, createUserHandler, updateUserHandler, replaceRolesHandler, changeStatusHandler, resetPasswordHandler, replaceUnitsHandler } = require('./users.controller');
const { requireAdminAuth } = require('../auth/auth.middleware');
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const { requirePermissions } = require('../access/access.middleware');

router.use(requireAdminAuth);
//router.use(requireTrustedOrigin);
router.use(requirePermissions('USER_MANAGE'));

router.get('/', getUsers);
router.get('/:id', getUser);
router.get("/assignable-roles",getAssignableRoles);

router.post('/', createUserHandler);
router.post('/:id/reset-password', resetPasswordHandler);

router.patch('/:id', updateUserHandler);
router.patch('/:id/status', changeStatusHandler);

router.put('/:id/roles', replaceRolesHandler);
router.put('/:id/units', replaceUnitsHandler);

module.exports = router;
