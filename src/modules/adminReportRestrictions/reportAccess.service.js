const prisma = require("../../database/prisma");

function createAccessError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function userIsAdminMaster(
  userId,
  database = prisma
) {
  const role = await database.roles.findFirst({
    where: {
      code: "ADMIN_MASTER",
      is_active: true,
    },
    select: {
      id: true,
    },
  });

  if (!role) {
    return false;
  }

  const assignment =
    await database.user_roles.findFirst({
      where: {
        user_id: userId,
        role_id: role.id,
      },
      select: {
        user_id: true,
      },
    });

  return Boolean(assignment);
}

async function getUserUnitIds(
  userId,
  database = prisma
) {
  const assignments =
    await database.user_units.findMany({
      where: {
        user_id: userId,
      },
      select: {
        unit_id: true,
      },
    });

  return assignments.map(
    (assignment) => assignment.unit_id
  );
}

async function assertUserCanAccessReport(
  reportId,
  userId
) {
  const report =
    await prisma.reports.findUnique({
      where: {
        id: reportId,
      },
      select: {
        id: true,
        unit_id: true,
      },
    });

  if (!report) {
    throw createAccessError(
      "Denúncia não encontrada.",
      404
    );
  }

  // Restrição individual vence tudo,
  // inclusive ADMIN_MASTER.
  const restriction =
    await prisma.report_restricted_users.findFirst({
      where: {
        report_id: reportId,
        user_id: userId,
        is_active: true,
      },
      select: {
        id: true,
      },
    });

  if (restriction) {
    throw createAccessError(
      "Você não possui acesso a esta denúncia.",
      403
    );
  }

  const isMaster =
    await userIsAdminMaster(userId);

  if (isMaster) {
    return true;
  }

  // Denúncia sem unidade fica inacessível
  // para usuário comum.
  if (!report.unit_id) {
    throw createAccessError(
      "Você não possui acesso a esta denúncia.",
      403
    );
  }

  const assignment =
    await prisma.user_units.findFirst({
      where: {
        user_id: userId,
        unit_id: report.unit_id,
      },
      select: {
        user_id: true,
      },
    });

  if (!assignment) {
    throw createAccessError(
      "Você não possui acesso a esta denúncia.",
      403
    );
  }

  return true;
}
async function assertUserCanReceiveReportAccess(
  reportId,
  targetUserId,
  database = prisma
) {
  const report =
    await database.reports.findUnique({
      where: {
        id: reportId,
      },
      select: {
        id: true,
        unit_id: true,
      },
    });

  if (!report) {
    throw createAccessError(
      "Denúncia não encontrada.",
      404
    );
  }

  /*
   * Usuário restrito não pode receber
   * atribuição nem grant, independentemente
   * de perfil ou unidade.
   */
  const restriction =
    await database.report_restricted_users.findFirst({
      where: {
        report_id: reportId,
        user_id: targetUserId,
        is_active: true,
      },
      select: {
        id: true,
      },
    });

  if (restriction) {
    throw createAccessError(
      "O usuário selecionado possui restrição ativa nesta denúncia.",
      409
    );
  }

  /*
   * ADMIN_MASTER pode atuar em qualquer unidade.
   */
  const targetIsAdminMaster =
    await userIsAdminMaster(
      targetUserId,
      database
    );

  if (targetIsAdminMaster) {
    return true;
  }

  /*
   * Denúncia sem unidade não pode ser
   * atribuída a usuário comum.
   */
  if (!report.unit_id) {
    throw createAccessError(
      "Esta denúncia não possui unidade definida.",
      409
    );
  }

  /*
   * Usuário comum precisa estar vinculado
   * à mesma unidade da denúncia.
   */
  const unitAssignment =
    await database.user_units.findFirst({
      where: {
        user_id: targetUserId,
        unit_id: report.unit_id,
      },
      select: {
        user_id: true,
      },
    });

  if (!unitAssignment) {
    throw createAccessError(
      "O usuário selecionado não pertence à unidade desta denúncia.",
      409
    );
  }

  return true;
}
module.exports = {
  assertUserCanAccessReport,
  userIsAdminMaster,
  getUserUnitIds,
  assertUserCanReceiveReportAccess
};