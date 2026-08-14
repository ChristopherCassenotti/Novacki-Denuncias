const {reportIdParamSchema,} = require("../adminReports/adminReports.schema");
const {createRestrictionSchema, restrictionUserParamSchema,} = require("./adminReportRestrictions.schema");
const {listRestrictions,createRestriction,revokeRestriction,} = require("./adminReportRestrictions.service");

function formatValidationErrors(error) {
  return error.issues.map(
    (issue) => ({
      field: issue.path.join("."),

      message: issue.message,
    })
  );
}

function sendError(res, error, fallback) {
  if (Number.isInteger(error?.statusCode)) {
    return res.status(error.statusCode).json({ message: error.message,});
  }

  console.error(fallback, error);

  return res.status(500).json({
    message: fallback,
  });
}

async function listRestrictionsHandler(req, res) {
  const params = reportIdParamSchema.safeParse(req.params);

  if (!params.success) {
    return res.status(400).json({
      message:"ID da denúncia inválido.",
    });
  }

  try {
    const restrictions = await listRestrictions(params.data.id);

    return res.status(200).json({
      data: {
        restrictions,
      },
    });
  } catch (error) {
    return sendError(res, error, "Não foi possível carregar as restrições.");
  }
}

async function createRestrictionHandler(req, res) {
  const params = reportIdParamSchema.safeParse(req.params);

  const body = createRestrictionSchema.safeParse(req.body);

  if (!params.success || !body.success) {
    return res.status(400).json({
      message:"Dados da restrição inválidos.",

      errors:
        body.success
          ? undefined
          : formatValidationErrors(body.error),
    });
  }

  try {
    const restrictions = await createRestriction(params.data.id, body.data, req.auth.userId);

    return res.status(201).json({
      message: "Usuário restringido com sucesso.",

      data: {
        restrictions,
      },
    });
  } catch (error) {
    return sendError(res, error, "Não foi possível restringir o usuário.");
  }
}

async function revokeRestrictionHandler(req, res) {
  const validation =restrictionUserParamSchema.safeParse(req.params);

  if (!validation.success) {
    return res.status(400).json({
      message: "Parâmetros inválidos.",
    });
  }

  try {
    const restrictions =
      await revokeRestriction(
        validation.data.id,
        validation.data.userId,
        req.auth.userId
      );

    return res.status(200).json({
      message:"Restrição removida com sucesso.",

      data: {
        restrictions,
      },
    });
  } catch (error) {
    return sendError(res,error,"Não foi possível remover a restrição.");
  }
}

module.exports = {listRestrictionsHandler,createRestrictionHandler,revokeRestrictionHandler,};