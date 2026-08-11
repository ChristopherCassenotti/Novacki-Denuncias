function getSessionCookieName() {
  return process.env.ADMIN_SESSION_COOKIE || "nvk_admin_session";
}

function getBaseCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    priority: "high",
  };
}

function setSessionCookie(res, token, expiresAt) {
  res.cookie(getSessionCookieName(), token, {
    ...getBaseCookieOptions(),
    expires: expiresAt,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(
    getSessionCookieName(),
    getBaseCookieOptions()
  );
}

module.exports = {
  getSessionCookieName,
  setSessionCookie,
  clearSessionCookie,
};
