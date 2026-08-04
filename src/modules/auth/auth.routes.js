const express = require('express');
const router = express.Router();
const {login, changePassword, me, logout} = require('./auth.controllers');
const { requirePreAuth } = require('./preAuth.middleware');
const { requireAdminAuth } = require('./auth.middleware');

//GET
router.get('/me', requireAdminAuth, me);


//POST
router.post('/login', login);
router.post('/change-initial-password', requirePreAuth("CHANGE_PASSWORD"), changePassword);
router.post('/logout', requireAdminAuth, logout);


module.exports = router;