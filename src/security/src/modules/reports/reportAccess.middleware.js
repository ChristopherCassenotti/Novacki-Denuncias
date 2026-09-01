const {assertUserCanAccessReport,} = require("../adminReportRestrictions/reportAccess.service");
const { safeExceptionLog } = require("../../utils/safeLog");

async function requireReportAccess(req,res,next,reportId) {
  try {
    await assertUserCanAccessReport(
      reportId,
      req.auth.userId
    );

    return next();
  } 
  catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({ message: error.message,});
    }

    safeExceptionLog("admin_report_access_validation", error);

    return res.status(500).json({
      message: "Não foi possível validar o acesso à denúncia.",
    });
  }
}

module.exports = { requireReportAccess, };
