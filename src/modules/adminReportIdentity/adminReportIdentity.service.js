const {randomUUID,} = require("node:crypto");
const prisma = require("../../database/prisma");
const {decryptJson,} = require("../../security/crypto.service");

function createServiceError(message, statusCode) {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
}

function auditMetadata(data) {
  return JSON.stringify(data);
}

async function getReportIdentity(reportId, actorUserId) {
  const report =
    await prisma.reports.findUnique({
      where: {
        id: reportId,
      },

      select: {
        id: true,
        mode: true,
      },
    });

  if (!report) {
    throw createServiceError("Denúncia não encontrada.", 404);
  }

  if (report.mode ==="ANONYMOUS") {
    throw createServiceError("Esta denúncia foi registrada de forma anônima.", 404);
  }

  const identity =
    await prisma.report_identities.findUnique({
      where: {
        report_id: reportId,
      },

      select: {
        id: true,
        report_id: true,
        identity_ciphertext: true,
        identity_iv: true,
        identity_auth_tag: true,
        encryption_key_version: true,
        consent_to_contact: true,
        created_at: true,
      },
    });

  if (!identity) {
    throw createServiceError(
      "Identidade do denunciante não encontrada.",
      404
    );
  }

  const decrypted =
    decryptJson(
      {
        ciphertext: identity.identity_ciphertext,
        iv: identity.identity_iv,
        authTag: identity.identity_auth_tag,
        keyVersion: identity.encryption_key_version,
      },
      "REPORT_IDENTITY"
    );

  await prisma.audit_logs.create({
    data: {
      actor_type: "ADMIN",
      actor_user_id: actorUserId,
      action: "REPORT_IDENTITY_VIEWED",
      entity_type: "REPORT",
      entity_id: reportId,
      success: true,
      request_id: randomUUID(),
      metadata_json:
        auditMetadata({
          identityId: identity.id,
        }),
    },
  });

  return {
    name: decrypted.name ?? null,
    email: decrypted.email ?? null,
    phone: decrypted.phone ?? null,
    consentToContact: identity.consent_to_contact,
    createdAt: identity.created_at,
  };
}

module.exports = { getReportIdentity, };
