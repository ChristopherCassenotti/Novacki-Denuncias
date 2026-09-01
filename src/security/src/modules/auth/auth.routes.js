const express = require('express');
const router = express.Router();
const {login, changePassword, completeCredentialSetup, me, logout} = require('./auth.controller');
const { requirePreAuth } = require('./preAuth.middleware');
const { requireAdminAuth } = require('./auth.middleware');
const { requireTrustedOrigin } = require('../../middlewares/originProtection.middleware');
const {
  credentialActionRateLimiter,
  adminLoginLimiter,
} = require('../../middlewares/security.middlewares');

//GET
router.get('/me', requireAdminAuth, me);


//POST
router.post('/login', adminLoginLimiter, login);
router.post(
  '/complete-credential-setup',
  credentialActionRateLimiter,
  completeCredentialSetup
);
router.post(
  '/change-initial-password',
  credentialActionRateLimiter,
  requirePreAuth("CHANGE_PASSWORD"),
  changePassword
);
router.post('/logout', requireAdminAuth, requireTrustedOrigin, logout);


module.exports = router;
