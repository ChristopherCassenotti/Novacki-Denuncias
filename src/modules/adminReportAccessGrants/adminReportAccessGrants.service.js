const {
  randomUUID,
} = require("node:crypto");

const prisma = require(
  "../../database/prisma"
);

const {
  encryptJson,
  decryptJson,
} = require(
  "../../security/crypto.service"
);

function createServiceError(
  message,
  statusCode
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  return error;
}

function auditMetadata(data) {
  return JSON.stringify(data);
}

async function findReportOrFail(
  database,
  reportId
) {
  const report =
    await database.reports.findUnique({
      where: {
        id: reportId,
      },

      select: {
        id: true,
        protocol: true,
      },
    });

  if (!report) {
    throw createServiceError(
      "Denúncia não encontrada.",
      404
    );
  }

  return report;
}

function decryptReason(
  grant
) {
  if (
    !grant.reason_ciphertext ||
    !grant.reason_iv ||
    !grant.reason_auth_tag ||
    !grant.reason_key_version
  ) {
    return null;
  }

  const decrypted =
    decryptJson(
      {
        ciphertext:
          grant.reason_ciphertext,

        iv:
          grant.reason_iv,

        authTag:
          grant.reason_auth_tag,

        keyVersion:
          grant.reason_key_version,
      },
      "REPORT_ACCESS_GRANT_REASON"
    );

  return decrypted.reason ?? null;
}

async function listAccessGrants(
  reportId
) {
  await findReportOrFail(
    prisma,
    reportId
  );

  const grants =
    await prisma.report_access_grants.findMany({
      where: {
        report_id:
          reportId,
      },

      orderBy: {
        created_at:
          "desc",
      },
    });

  const userIds = [
    ...new Set(
      grants
        .flatMap(
          (grant) => [
            grant.user_id,
            grant.granted_by_user_id,
            grant.revoked_by_user_id,
          ]
        )
        .filter(Boolean)
    ),
  ];

  const users =
    userIds.length
      ? await prisma.users.findMany({
          where: {
            id: {
              in:
                userIds,
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

  const now =
    new Date();

  return grants.map(
    (grant) => ({
      id:
        grant.id,

      user:
        usersMap.get(
          grant.user_id
        ) || null,

      scope:
        grant.scope,

      reason:
        decryptReason(
          grant
        ),

      grantedBy:
        usersMap.get(
          grant.granted_by_user_id
        ) || null,

      revokedBy:
        grant.revoked_by_user_id
          ? usersMap.get(
              grant.revoked_by_user_id
            ) || null
          : null,

      expiresAt:
        grant.expires_at,

      revokedAt:
        grant.revoked_at,

      active:
        grant.revoked_at === null &&
        (
          grant.expires_at === null ||
          grant.expires_at > now
        ),

      createdAt:
        grant.created_at,
    })
  );
}

async function createAccessGrant(
  reportId,
  {
    userId,
    scope,
    reason,
    expiresAt,
  },
  actorUserId
) {
  const report =
    await findReportOrFail(
      prisma,
      reportId
    );

  if (
    userId ===
    actorUserId
  ) {
    throw createServiceError(
      "Você não pode conceder acesso excepcional para si mesmo.",
      403
    );
  }

  const user =
    await prisma.users.findUnique({
      where: {
        id:
          userId,
      },

      select: {
        id: true,
        is_active: true,
      },
    });

  if (
    !user ||
    !user.is_active
  ) {
    throw createServiceError(
      "Usuário inválido ou inativo.",
      400
    );
  }

  const restriction =
    await prisma.report_restricted_users.findFirst({
      where: {
        report_id:
          reportId,

        user_id:
          userId,

        is_active:
          true,
      },

      select: {
        id: true,
      },
    });

  if (restriction) {
    throw createServiceError(
      "Não é possível conceder acesso a um usuário com restrição ativa nesta denúncia.",
      409
    );
  }

  let expiration =
    null;

  if (expiresAt) {
    expiration =
      new Date(
        expiresAt
      );

    if (
      expiration <=
      new Date()
    ) {
      throw createServiceError(
        "A expiração deve ser uma data futura.",
        400
      );
    }
  }

  const normalizedReason =
    reason?.trim() || null;

  let encryptedReason =
    null;

  if (
    normalizedReason
  ) {
    encryptedReason =
      encryptJson(
        {
          reason:
            normalizedReason,
        },
        "REPORT_ACCESS_GRANT_REASON"
      );
  }

  const now =
    new Date();

  await prisma.$transaction(
    async (tx) => {
      const existing =
        await tx.report_access_grants.findFirst({
          where: {
            report_id:
              reportId,

            user_id:
              userId,

            scope,
          },
        });

      if (
        existing &&
        existing.revoked_at === null &&
        (
          existing.expires_at === null ||
          existing.expires_at > now
        )
      ) {
        throw createServiceError(
          "Este usuário já possui este acesso ativo.",
          409
        );
      }

      if (existing) {
        await tx.report_access_grants.update({
          where: {
            id:
              existing.id,
          },

          data: {
            granted_by_user_id:
              actorUserId,

            revoked_by_user_id:
              null,

            reason_ciphertext:
              encryptedReason
                ?.ciphertext ?? null,

            reason_iv:
              encryptedReason
                ?.iv ?? null,

            reason_auth_tag:
              encryptedReason
                ?.authTag ?? null,

            reason_key_version:
              encryptedReason
                ?.keyVersion ?? null,

            expires_at:
              expiration,

            revoked_at:
              null,

            created_at:
              now,
          },
        });
      } else {
        await tx.report_access_grants.create({
          data: {
            id:
              randomUUID(),

            report_id:
              reportId,

            user_id:
              userId,

            scope,

            granted_by_user_id:
              actorUserId,

            reason_ciphertext:
              encryptedReason
                ?.ciphertext ?? null,

            reason_iv:
              encryptedReason
                ?.iv ?? null,

            reason_auth_tag:
              encryptedReason
                ?.authTag ?? null,

            reason_key_version:
              encryptedReason
                ?.keyVersion ?? null,

            expires_at:
              expiration,

            created_at:
              now,
          },
        });
      }

      await tx.report_events.create({
        data: {
          id:
            randomUUID(),

          report_id:
            reportId,

          event_type:
            "ACCESS_GRANTED",

          actor_type:
            "ADMIN",

          actor_user_id:
            actorUserId,
        },
      });

      await tx.audit_logs.create({
        data: {
          actor_type:
            "ADMIN",

          actor_user_id:
            actorUserId,

          action:
            "REPORT_ACCESS_GRANTED",

          entity_type:
            "REPORT",

          entity_id:
            reportId,

          success:
            true,

          request_id:
            randomUUID(),

          metadata_json:
            auditMetadata({
              protocol:
                report.protocol,

              userId,
              scope,

              expiresAt:
                expiration
                  ?.toISOString() ??
                null,
            }),
        },
      });
    }
  );

  return listAccessGrants(
    reportId
  );
}

async function revokeAccessGrant(
  reportId,
  grantId,
  actorUserId
) {
  const report =
    await findReportOrFail(
      prisma,
      reportId
    );

  const grant =
    await prisma.report_access_grants.findFirst({
      where: {
        id:
          grantId,

        report_id:
          reportId,
      },
    });

  if (
    !grant ||
    grant.revoked_at !==
      null
  ) {
    throw createServiceError(
      "Acesso excepcional não encontrado ou já revogado.",
      404
    );
  }

  const now =
    new Date();

  await prisma.$transaction(
    async (tx) => {
      await tx.report_access_grants.update({
        where: {
          id:
            grantId,
        },

        data: {
          revoked_by_user_id:
            actorUserId,

          revoked_at:
            now,
        },
      });

      await tx.report_events.create({
        data: {
          id:
            randomUUID(),

          report_id:
            reportId,

          event_type:
            "ACCESS_REVOKED",

          actor_type:
            "ADMIN",

          actor_user_id:
            actorUserId,
        },
      });

      await tx.audit_logs.create({
        data: {
          actor_type:
            "ADMIN",

          actor_user_id:
            actorUserId,

          action:
            "REPORT_ACCESS_REVOKED",

          entity_type:
            "REPORT",

          entity_id:
            reportId,

          success:
            true,

          request_id:
            randomUUID(),

          metadata_json:
            auditMetadata({
              protocol:
                report.protocol,

              grantId,

              userId:
                grant.user_id,

              scope:
                grant.scope,
            }),
        },
      });
    }
  );

  return listAccessGrants(
    reportId
  );
}

module.exports = {
  listAccessGrants,
  createAccessGrant,
  revokeAccessGrant,
};