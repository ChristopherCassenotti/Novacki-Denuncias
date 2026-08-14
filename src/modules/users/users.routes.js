const express = require('express');
const router = express.Router();
const { getUser, getUsers, createUserHandler, updateUserHandler, replaceRolesHandler, changeStatusHandler, resetPasswordHandler } = require('./users.controller');
const { requireAdminAuth } = require('../auth/auth.middleware');
const { requirePermissions } = require('../access/access.middleware');

router.use(requireAdminAuth);
router.use(requirePermissions('USER_MANAGE'));

router.get('/', getUsers);
router.get('/:id', getUser);

router.post('/', createUserHandler);
router.post('/:id/reset-password', resetPasswordHandler);

router.patch('/:id', updateUserHandler);
router.patch('/:id/status', changeStatusHandler);

router.put('/:id/roles', replaceRolesHandler);

module.exports = router;