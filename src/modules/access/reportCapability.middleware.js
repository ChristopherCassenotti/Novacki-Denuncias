const {
  assertReportCapability,
} = require(
  "./reportCapability.service"
);

function requireReportCapability({
  permission,
  scope,
}) {
  return async function (
    req,
    res,
    next
  ) {
    try {
      await assertReportCapability({
        reportId:
          req.params.id,

        userId:
          req.auth.userId,

        permission,
        scope,
      });

      return next();
    } catch (error) {
      if (
        Number.isInteger(
          error?.statusCode
        )
      ) {
        return res
          .status(
            error.statusCode
          )
          .json({
            message:
              error.message,
          });
      }

      console.error(
        "Erro ao validar capacidade da denúncia:",
        error
      );

      return res.status(500).json({
        message:
          "Não foi possível validar o acesso à denúncia.",
      });
    }
  };
}

module.exports = {
  requireReportCapability,
};