const {
  findValidSession,
} = require("./session.service");

const {
  getSessionCookieName,
} = require("./auth.cookies");
const { safeExceptionLog } = require("../../utils/safeLog");

async function requireAdminAuth(req, res, next) {
  try {
    const cookieName = getSessionCookieName();
    const token = req.cookies?.[cookieName];

    if (!token) {
      return res.status(401).json({
        message: "Autenticação necessária.",
      });
    }

    const session = await findValidSession(token);

    if (!session) {
      return res.status(401).json({
        message: "Sessão inválida ou expirada.",
      });
    }

    req.auth = {
      sessionId: session.id,
      userId: session.user.id,
      user: session.user,
    };

    return next();
  } catch (error) {
    safeExceptionLog("admin_session_validation", error);

    return res.status(500).json({
      message: "Não foi possível validar a sessão.",
    });
  }
}

module.exports = {
  requireAdminAuth,
};
