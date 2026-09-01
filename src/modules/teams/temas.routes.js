const {  getTeams, getTeam, createTeamHandler,replaceUnitsHandler, updateTeamHandler, replaceMembersHandler, changeStatusHandler, } = require('./teams.controller');
const { requireAdminAuth } = require('../auth/auth.middleware');
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const { requirePermissions } = require('../access/access.middleware');

const express = require('express');

const router = express.Router();

router.use(requireAdminAuth);
router.use(requireTrustedOrigin);
router.use(requirePermissions('TEAM_MANAGE'));

router.get('/', getTeams);
router.get('/:id', getTeam);

router.post('/', createTeamHandler);

router.patch('/:id', updateTeamHandler);
router.patch('/:id/status', changeStatusHandler);

router.put('/:id/members', replaceMembersHandler);
router.put("/:id/units",replaceUnitsHandler);

module.exports = router;
