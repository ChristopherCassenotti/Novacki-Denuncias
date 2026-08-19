const { safeExceptionLog } = require("../../utils/safeLog");
const {reportIdParamSchema,} = require("../adminReports/adminReports.schema");
const { createInternalNoteSchema, } = require("./adminReportInternalNotes.schema");
const {listInternalNotes, createInternalNote,} = require("./adminReportInternalNotes.service");

function formatValidationErrors(error) {
  return error.issues.map((issue) => ({
      field: issue.path.join("."),

      message: issue.message,
    })
  );
}

function sendControllerError(res, error, fallbackMessage) {
  if (Number.isInteger(error?.statusCode)) {
    return res.status(error.statusCode).json({message: error.message,});
  }

  safeExceptionLog("admin_report_internal_note", error);

  return res.status(500).json({
    message: fallbackMessage,
  });
}

async function listInternalNotesHandler(req, res) {
  const params = reportIdParamSchema.safeParse(req.params);

  if (!params.success) {
    return res.status(400).json({
      message: "ID da denúncia inválido.",
    });
  }

  try {
    const notes =
      await listInternalNotes(
        params.data.id
      );

    return res.status(200).json({
      data: {
        notes,
      },
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Não foi possível carregar as anotações internas."
    );
  }
}

async function createInternalNoteHandler(req,res) {
  const params =reportIdParamSchema.safeParse(req.params);

  if (!params.success) {
    return res.status(400).json({message:"ID da denúncia inválido.",});
  }

  const body = createInternalNoteSchema.safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({
      message: "Anotação inválida.",

      errors: formatValidationErrors(body.error),
    });
  }

  try {
    const note =
      await createInternalNote(
        params.data.id,
        body.data,
        req.auth.userId
      );

    return res.status(201).json({
      message:
        "Anotação interna adicionada com sucesso.",

      data: {
        note,
      },
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Não foi possível adicionar a anotação interna."
    );
  }
}

module.exports = { listInternalNotesHandler, createInternalNoteHandler,};
