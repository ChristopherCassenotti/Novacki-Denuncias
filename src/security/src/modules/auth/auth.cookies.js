const {
  adminCookieOptions,
} = require('../../config/cookies');

function getSessionCookieName() {
  return process.env.ADMIN_COOKIE_NAME || "nvk_admin_session";
}

function setSessionCookie(res, token, expiresAt) {
  const expirationTime =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : new Date(expiresAt).getTime();

  if (!Number.isFinite(expirationTime)) {
    throw new Error("Expiração da sessão administrativa inválida.");
  }

  res.cookie(getSessionCookieName(), token, {
    ...adminCookieOptions(),
    maxAge: Math.max(0, expirationTime - Date.now()),
  });
}

function clearSessionCookie(res) {
  res.clearCookie(
    getSessionCookieName(),
    adminCookieOptions()
  );
}

module.exports = {
  getSessionCookieName,
  setSessionCookie,
  clearSessionCookie,
};
