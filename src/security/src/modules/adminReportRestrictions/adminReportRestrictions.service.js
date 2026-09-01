const {randomUUID,} = require("node:crypto");
const prisma = require("../../database/prisma");
const {encryptJson,decryptJson,} = require("../../security/crypto.service");

function createServiceError(message,statusCode) {
  const error =new Error(message);

  error.statusCode = statusCode;

  return error;
}

function auditMetadata(data) {
  return JSON.stringify(data);
}

async function findReportOrFail(database, reportId) {
  const report =
    await database.reports.findUnique({
      where: {
        id: reportId,
      },

      select: {
        id: true,
      },
    });

  if (!report) {
    throw createServiceError("Denúncia não encontrada.", 404);
  }

  return report;
}

async function listRestrictions(
  reportId
) {
  await findReportOrFail(
    prisma,
    reportId
  );

  const restrictions =
    await prisma.report_restricted_users.findMany({
      where: {
        report_id:
          reportId,
      },

      select: {
        id: true,
        user_id: true,
        reason: true,
        created_by_user_id: true,
        revoked_by_user_id: true,
        is_active: true,

        notes_ciphertext: true,
        notes_iv: true,
        notes_auth_tag: true,
        notes_key_version: true,

        created_at: true,
        revoked_at: true,
      },

      orderBy: {
        created_at:
          "desc",
      },
    });

  const ids = [
    ...new Set(
      restrictions.flatMap(
        (restriction) => [
          restriction.user_id,
          restriction.created_by_user_id,
          restriction.revoked_by_user_id,
        ]
      ).filter(Boolean)
    ),
  ];

  const users =
    ids.length > 0
      ? await prisma.users.findMany({
          where: {
            id: {
              in: ids,
            },
          },

          select: {
            id: true,
            name: true,
            email: true,
          },
        })
      : [];

  const usersMap =
    new Map(
      users.map(
        (user) => [
          user.id,
          user,
        ]
      )
    );

  return restrictions.map((restriction) => { 
    let notes =  null;

      if (
        restriction.notes_ciphertext &&
        restriction.notes_iv &&
        restriction.notes_auth_tag &&
        restriction.notes_key_version
        ) {
        const decrypted =
          decryptJson(
            {
              ciphertext: restriction.notes_ciphertext,
              iv: restriction.notes_iv,
              authTag: restriction.notes_auth_tag,
              keyVersion: restriction.notes_key_version,
            },
            "REPORT_RESTRICTION_NOTE"
          );

        notes = decrypted.notes ?? null;
      }

      return {
        id: restriction.id,

        user:
          usersMap.get(
            restriction.user_id
          ) || null,

        reason: restriction.reason,
        notes,
        isActive: restriction.is_active,

        createdBy:
          usersMap.get(
            restriction.created_by_user_id
          ) || null,

        revokedBy:
          restriction.revoked_by_user_id
            ? usersMap.get(
                restriction.revoked_by_user_id
              ) || null
            : null,

        createdAt: restriction.created_at,
        revokedAt: restriction.revoked_at,
      };
    }
  );
}

async function createRestriction(reportId, {userId, reason, notes,}, actorUserId) {
  const report =await findReportOrFail(prisma, reportId);

  if (userId === actorUserId) {
    throw createServiceError("Você não pode criar uma restrição para si mesmo.", 400);
  }

  const user =
    await prisma.users.findUnique({
      where: {
        id: userId,
      },

      select: {
        id: true,
        is_active: true,
      },
    });

  if (!user || !user.is_active) {
    throw createServiceError("Usuário inválido ou inativo.", 400);
  }

  const normalizedNotes = notes?.trim() || null;

  let encryptedNotes = null;

  if (normalizedNotes) {
    encryptedNotes =
      encryptJson(
        {
          notes:
            normalizedNotes,
        },
        "REPORT_RESTRICTION_NOTE"
      );
  }

  const now =
    new Date();

  await prisma.$transaction(
    async (tx) => {
      const existing =
        await tx.report_restricted_users.findUnique({
          where: {
            report_id_user_id: {
              report_id: reportId,

              user_id: userId,
            },
          },
        });

      if (existing?.is_active) {
        throw createServiceError("Este usuário já possui uma restrição ativa nesta denúncia.", 409);
      }

      if (existing) {
        await tx.report_restricted_users.update({
          where: {
            id: existing.id,
          },

          data: {
            reason,
            created_by_user_id: actorUserId,
            revoked_by_user_id: null,
            is_active: true,

            notes_ciphertext:
              encryptedNotes
                ?.ciphertext ?? null,

            notes_iv:
              encryptedNotes
                ?.iv ?? null,

            notes_auth_tag:
              encryptedNotes
                ?.authTag ?? null,

            notes_key_version:
              encryptedNotes
                ?.keyVersion ?? null,

            created_at: now,
            revoked_at: null,
          },
        });
      } else {
        await tx.report_restricted_users.create({
          data: {
            id: randomUUID(),
            report_id: reportId,
            user_id: userId,
            reason,
            created_by_user_id: actorUserId,
            is_active: true,

            notes_ciphertext:
              encryptedNotes
                ?.ciphertext ?? null,

            notes_iv:
              encryptedNotes
                ?.iv ?? null,

            notes_auth_tag:
              encryptedNotes
                ?.authTag ?? null,

            notes_key_version:
              encryptedNotes
                ?.keyVersion ?? null,

            created_at: now,
          },
        });
      }

      const currentReport =
        await tx.reports.findUnique({
          where: {
            id: reportId,
          },

          select: {
            current_assignee_user_id: true,
          },
        });

      if (
        currentReport
          ?.current_assignee_user_id ===
        userId
      ) {
        await tx.report_assignments.updateMany({
          where: {
            report_id: reportId,

            assigned_user_id: userId,

            ended_at: null,
          },

          data: {
            ended_at: now,
          },
        });

        await tx.reports.update({
          where: {
            id: reportId,
          },

          data: {
            current_assignee_user_id: null,

            last_activity_at: now,
          },
        });
      }

      await tx.report_events.create({
        data: {
          id: randomUUID(),
          report_id: reportId,
          event_type: "USER_RESTRICTED",
          actor_type: "ADMIN",
          actor_user_id: actorUserId,
        },
      });

      await tx.audit_logs.create({
        data: {
          actor_type: "ADMIN",
          actor_user_id: actorUserId,
          action: "REPORT_USER_RESTRICTED",
          entity_type: "REPORT",
          entity_id: reportId,
          success: true,
          request_id: randomUUID(),
          metadata_json:
            auditMetadata({
              restrictedUserId: userId,

              reason,
            }),
        },
      });
    }
  );

  return listRestrictions(reportId);
}

async function revokeRestriction(reportId, userId, actorUserId) {
  const report = await findReportOrFail(prisma, reportId);

  const restriction = await prisma.report_restricted_users.findUnique({
      where: {
        report_id_user_id: {
            report_id: reportId,

            user_id: userId,
        },
      },
    });

  if (!restriction || !restriction.is_active) {
    throw createServiceError("Este usuário não possui uma restrição ativa nesta denúncia.", 404);
  }

  const now = new Date();

  await prisma.$transaction(
    async (tx) => {
      await tx.report_restricted_users.update({
        where: {
          id: restriction.id,
        },

        data: {
          is_active: false,
          revoked_by_user_id: actorUserId,
          revoked_at: now,
        },
      });

      await tx.report_events.create({
        data: {
          id: randomUUID(),
          report_id: reportId,
          event_type: "USER_RESTRICTION_REVOKED",
          actor_type: "ADMIN",
          actor_user_id: actorUserId,
        },
      });

      await tx.audit_logs.create({
        data: {
          actor_type: "ADMIN",
          actor_user_id: actorUserId,
          action: "REPORT_USER_RESTRICTION_REVOKED",
          entity_type: "REPORT",
          entity_id: reportId,
          success: true,
          request_id: randomUUID(),
          metadata_json:
            auditMetadata({
              userId,
            }),
        },
      });
    }
  );

  return listRestrictions( reportId);
}

module.exports = { listRestrictions, createRestriction, revokeRestriction,};
