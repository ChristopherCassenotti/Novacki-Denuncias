const prisma = require("../../database/prisma");

function createAccessError(message,statusCode) {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
}

async function assertUserCanAccessReport(reportId,userId) {
  const restriction =
    await prisma.report_restricted_users.findFirst({
      where: {
        report_id: reportId,
        user_id: userId,
        is_active: true,
      },

      select: {
        id: true,
        reason: true,
      },
    });

  if (restriction) {
    throw createAccessError("Você não possui acesso a esta denúncia.",403);
  }

  return true;
}

module.exports = {assertUserCanAccessReport,};