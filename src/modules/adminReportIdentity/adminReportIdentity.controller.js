const { reportIdParamSchema, } = require("../adminReports/adminReports.schema");
const { getReportIdentity, } = require("./adminReportIdentity.service");

function sendControllerError(res, error, fallbackMessage) {
  if (Number.isInteger(error?.statusCode)) {
    return res.status(error.statusCode).json({message: error.message,});
  }

  console.error(fallbackMessage, error);

  return res.status(500).json({
    message: fallbackMessage,
  });
}

async function getIdentityHandler(req, res) {
  const params =
    reportIdParamSchema.safeParse(req.params);

  if (!params.success) {
    return res.status(400).json({
      message: "ID da denúncia inválido.",
    });
  }

  try {
    const identity = await getReportIdentity(params.data.id, req.auth.userId);

    return res.status(200).json({
      data: {
        identity,
      },
    });
  } catch (error) {
    return sendControllerError(res, error, "Não foi possível acessar a identidade do denunciante.");
  }
}

module.exports = { getIdentityHandler, };