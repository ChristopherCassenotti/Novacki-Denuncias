const express = require('express');
const router = express.Router();
const {login, changePassword, completeCredentialSetup, me, logout} = require('./auth.controller');
const { requirePreAuth } = require('./preAuth.middleware');
const { requireAdminAuth } = require('./auth.middleware');
const {
  credentialActionRateLimiter,
  loginRateLimiter,
} = require('./auth.rateLimit');

//GET
router.get('/me', requireAdminAuth, me);


//POST
router.post('/login', loginRateLimiter, login);
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
router.post('/logout', requireAdminAuth, logout);


module.exports = router;
