const express = require("express");

const authRoutes = require("./modules/auth/auth.routes");

const app = express();

app.use(
  express.json({
    limit: "100kb",
  })
);

app.use("/api/admin/auth", authRoutes);

module.exports = app;