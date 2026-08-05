const express = require('express');
const cookieParser = require('cookie-parser');
const authRoutes = require('./modules/auth/auth.routes');
const accessRoutes = require('./modules/access/access.routes');
const roleRoutes = require('./modules/roles/roles.routes');

const app = express();

app.use(express.json({ limit: "100kb",}));
app.use(cookieParser());

app.use('/api/admin/auth', authRoutes);
app.use('/api/admin/access', accessRoutes);
app.use('/api/admin/roles', roleRoutes);

module.exports = app;