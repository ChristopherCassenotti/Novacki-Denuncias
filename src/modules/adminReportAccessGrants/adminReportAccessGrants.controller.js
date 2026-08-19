const { safeExceptionLog } = require("../../utils/safeLog");
const {
  reportIdParamSchema,
} = require(
  "../adminReports/adminReports.schema"
);

const {
  createAccessGrantSchema,
  accessGrantParamSchema,
} = require(
  "./adminReportAccessGrants.schema"
);

const {
  listAccessGrants,
  createAccessGrant,
  revokeAccessGrant,
} = require(
  "./adminReportAccessGrants.service"
);

function formatValidationErrors(
  error
) {
  return error.issues.map(
    (issue) => ({
      field:
        issue.path.join("."),

      message:
        issue.message,
    })
  );
}

function sendError(
  res,
  error,
  fallback
) {
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

  safeExceptionLog("admin_report_access_grant", error);

  return res.status(500).json({
    message:
      fallback,
  });
}

async function listAccessGrantsHandler(
  req,
  res
) {
  const params =
    reportIdParamSchema.safeParse(
      req.params
    );

  if (!params.success) {
    return res.status(400).json({
      message:
        "ID da denúncia inválido.",
    });
  }

  try {
    const grants =
      await listAccessGrants(
        params.data.id
      );

    return res.status(200).json({
      data: {
        grants,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Não foi possível carregar os acessos."
    );
  }
}

async function createAccessGrantHandler(
  req,
  res
) {
  const params =
    reportIdParamSchema.safeParse(
      req.params
    );

  const body =
    createAccessGrantSchema.safeParse(
      req.body
    );

  if (
    !params.success ||
    !body.success
  ) {
    return res.status(400).json({
      message:
        "Dados do acesso inválidos.",

      errors:
        body.success
          ? undefined
          : formatValidationErrors(
              body.error
            ),
    });
  }

  try {
    const grants =
      await createAccessGrant(
        params.data.id,
        body.data,
        req.auth.userId
      );

    return res.status(201).json({
      message:
        "Acesso concedido com sucesso.",

      data: {
        grants,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Não foi possível conceder o acesso."
    );
  }
}

async function revokeAccessGrantHandler(
  req,
  res
) {
  const params =
    accessGrantParamSchema.safeParse(
      req.params
    );

  if (!params.success) {
    return res.status(400).json({
      message:
        "Parâmetros inválidos.",
    });
  }

  try {
    const grants =
      await revokeAccessGrant(
        params.data.id,
        params.data.grantId,
        req.auth.userId
      );

    return res.status(200).json({
      message:
        "Acesso revogado com sucesso.",

      data: {
        grants,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Não foi possível revogar o acesso."
    );
  }
}

module.exports = {
  listAccessGrantsHandler,
  createAccessGrantHandler,
  revokeAccessGrantHandler,
};
