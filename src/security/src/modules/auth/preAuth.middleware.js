const jwt = require("jsonwebtoken");
const { safeExceptionLog } = require("../../utils/safeLog");

function requirePreAuth(requiredNextStep) {
  return function preAuthMiddleware(req, res, next) {

    const authorization = req.headers.authorization;

    if (
      typeof authorization !== "string" ||
      !authorization.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        message: "Token temporário não informado.",
      });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        message: "Token temporário não informado.",
      });
    }

    try {
      const payload = jwt.verify(
        token,
        process.env.ADMIN_PRE_AUTH_SECRET,
        {
          algorithms: ["HS256"],
          issuer: "novacki-denuncias",
          audience: "admin-panel",
        }
      );

      if (
        !payload ||
        payload.type !== "ADMIN_PRE_AUTH" ||
        !payload.sub
      ) {
        return res.status(401).json({
          message: "Token temporário inválido.",
        });
      }

      if (
        requiredNextStep &&
        payload.nextStep !== requiredNextStep
      ) {
        return res.status(403).json({
          message: "Este token não permite realizar esta ação.",
          expectedNextStep: requiredNextStep,
          tokenNextStep: payload.nextStep,
        });
      }

      req.preAuth = {
        userId: payload.sub,
        nextStep: payload.nextStep,
      };

      return next();
    } catch (error) {
      safeExceptionLog("admin_pre_auth_validation", error);

      return res.status(401).json({
        message: "Token temporário inválido ou expirado.",
      });
    }
  };
}

module.exports = {
  requirePreAuth,
};
