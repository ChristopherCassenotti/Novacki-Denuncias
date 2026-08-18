const {randomUUID,} = require("node:crypto");
const prisma = require("../../database/prisma");
const { encryptJson, decryptJson,} = require("../../security/crypto.service");

function createServiceError(message, statusCode) {
  const error = new Error(message);

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
        status: true,
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

function deserializeInternalNote(note) {
  const decrypted =
    decryptJson(
      {
        ciphertext: note.body_ciphertext,
        iv: note.body_iv,
        authTag: note.body_auth_tag,
        keyVersion: note.encryption_key_version,
      },
      "REPORT_INTERNAL_NOTE"
    );

  return {
    id: note.id,
    body: decrypted.body,
    authorUserId: note.author_user_id,
    createdAt: note.created_at,
  };
}

async function listInternalNotes(reportId) {
  await findReportOrFail( prisma, reportId);

  const notes =
    await prisma.report_internal_notes.findMany({
      where: {
        report_id:
          reportId,
      },

      select: {
        id: true,
        author_user_id: true,

        body_ciphertext: true,
        body_iv: true,
        body_auth_tag: true,
        encryption_key_version: true,

        created_at: true,
      },

      orderBy: {
        created_at: "asc",
      },
    });

  const authorIds = [
    ...new Set(
      notes.map(
        (note) => note.author_user_id
      )
    ),
  ];

  const authors =
    authorIds.length
      ? await prisma.users.findMany({
          where: {
            id: {
              in:
                authorIds,
            },
          },

          select: {
            id: true,
            name: true,
          },
        })
      : [];

  const authorsMap =
    new Map(
      authors.map(
        (author) => [
          author.id,
          author,
        ]
      )
    );

  return notes.map((note) => {const parsed = deserializeInternalNote(note);

      return {
        id: parsed.id,

        body: parsed.body,

        author:
          authorsMap.get(
            parsed.authorUserId
          ) || {
            id: parsed.authorUserId,

            name: "Usuário não disponível",
          },

        createdAt: parsed.createdAt,
      };
    }
  );
}

async function createInternalNote( reportId, { body, }, actorUserId) {
  const report =
    await findReportOrFail(
      prisma,
      reportId
    );

  if (
    report.status ===
    "ARCHIVED"
  ) {
    throw createServiceError(
      "Não é possível adicionar anotações a uma denúncia arquivada.",
      409
    );
  }

  const encryptedBody =
    encryptJson(
      {
        body,
      },
      "REPORT_INTERNAL_NOTE"
    );

  const noteId =
    randomUUID();

  const now =
    new Date();

  await prisma.$transaction(
    async (tx) => {
      await tx.report_internal_notes.create({
        data: {
          id: noteId,
          report_id: reportId,
          author_user_id: actorUserId,
          body_ciphertext: encryptedBody.ciphertext,
          body_iv: encryptedBody.iv,
          body_auth_tag: encryptedBody.authTag,
          encryption_key_version: encryptedBody.keyVersion,
          created_at: now,
        },
      });

      await tx.reports.update({
        where: {
          id:
            reportId,
        },

        data: {
          last_activity_at: now,
        },
      });

      await tx.report_events.create({
        data: {
          id: randomUUID(),
          report_id: reportId,
          event_type: "INTERNAL_NOTE_ADDED",
          actor_type: "ADMIN",
          actor_user_id: actorUserId,
        },
      });

      await tx.audit_logs.create({
        data: {
          actor_type: "ADMIN",
          actor_user_id: actorUserId,
          action: "REPORT_INTERNAL_NOTE_ADDED",
          entity_type: "REPORT",
          entity_id: reportId,
          success: true,
          request_id: randomUUID(),
          metadata_json:
            auditMetadata({
              noteId,
            }),
        },
      });
    }
  );

  const note =
    await prisma.report_internal_notes.findUnique({
      where: {
        id:
          noteId,
      },

      select: {
        id: true,
        author_user_id: true,

        body_ciphertext: true,
        body_iv: true,
        body_auth_tag: true,
        encryption_key_version: true,

        created_at: true,
      },
    });

  const author =
    await prisma.users.findUnique({
      where: {
        id:
          actorUserId,
      },

      select: {
        id: true,
        name: true,
      },
    });

  const parsed = deserializeInternalNote(note);

  return {
    id: parsed.id,
    body: parsed.body,
    author,
    createdAt: parsed.createdAt,
  };
}

module.exports = { listInternalNotes, createInternalNote,};
