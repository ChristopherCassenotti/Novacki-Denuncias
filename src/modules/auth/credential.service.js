const { createHash, randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");
const prisma = require("../../database/prisma");

function invalidTokenError() {
  const error = new Error(
    "Token de credencial inválido, expirado ou já utilizado."
  );
  error.statusCode = 400;
  return error;
}

function hashToken(token) {
  return createHash("sha256").update(token).digest();
}

async function completeCredentialSetup({ token, newPassword }) {
  const now = new Date();
  const tokenHash = hashToken(token);
  const credential = await prisma.user_one_time_tokens.findUnique({
    where: { token_hash: tokenHash },
    select: {
      id: true,
      user_id: true,
      type: true,
      expires_at: true,
      used_at: true,
    },
  });

  if (
    !credential ||
    credential.used_at ||
    credential.expires_at <= now ||
    !["USER_INVITATION", "PASSWORD_RESET"].includes(credential.type)
  ) {
    throw invalidTokenError();
  }

  const user = await prisma.users.findUnique({
    where: { id: credential.user_id },
    select: {
      id: true,
      is_active: true,
      password_hash: true,
    },
  });

  if (!user?.is_active) {
    throw invalidTokenError();
  }

  if (await bcrypt.compare(newPassword, user.password_hash)) {
    const error = new Error("A nova senha precisa ser diferente da atual.");
    error.statusCode = 400;
    throw error;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction(async (tx) => {
    const consumed = await tx.user_one_time_tokens.updateMany({
      where: {
        id: credential.id,
        used_at: null,
        expires_at: { gt: now },
      },
      data: { used_at: now },
    });

    if (consumed.count !== 1) {
      throw invalidTokenError();
    }

    await tx.users.update({
      where: { id: user.id },
      data: {
        password_hash: passwordHash,
        must_change_password: false,
        password_changed_at: now,
      },
    });

    await tx.user_sessions.updateMany({
      where: {
        user_id: user.id,
        revoked_at: null,
      },
      data: { revoked_at: now },
    });

    await tx.user_one_time_tokens.deleteMany({
      where: {
        user_id: user.id,
        id: { not: credential.id },
        used_at: null,
      },
    });

    await tx.audit_logs.create({
      data: {
        actor_type: "ADMIN",
        actor_user_id: user.id,
        action:
          credential.type === "USER_INVITATION"
            ? "USER_INVITATION_COMPLETED"
            : "USER_PASSWORD_RESET_COMPLETED",
        entity_type: "USER",
        entity_id: user.id,
        success: true,
        request_id: randomUUID(),
        metadata_json: JSON.stringify({
          source: credential.type,
          sessionsRevoked: true,
        }),
      },
    });
  });

  return { nextStep: "LOGIN" };
}

module.exports = { completeCredentialSetup };
