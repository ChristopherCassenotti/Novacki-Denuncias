const express = require('express');
const router = express.Router();
const {login, changePassword} = require('./auth.controllers');
const { requirePreAuth } = require('./preAuth.middleware');

router.post('/login', login);

router.post('/change-initial-password', requirePreAuth("CHANGE_PASSWORD"), changePassword);

module.exports = router;