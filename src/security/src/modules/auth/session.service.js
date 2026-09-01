const crypto = require('node:crypto');

const prisma = require('../../database/prisma');

function hashSessionToken(token){
    return crypto.createHash('sha256').update(token).digest();
}

function getSessionExpiration(){
    const sessionDays = Number(process.env.ADMIN_SESSION_DAYS || 7);

    const expiresAt = new Date();
    
    expiresAt.setDate(expiresAt.getDate() + sessionDays);

    return expiresAt;
}

async function createAdminSession(userId) {
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashSessionToken(token);
    const expiresAt = getSessionExpiration();

    await prisma.user_sessions.create({
        data:{
            id: crypto.randomUUID(),
            user_id: userId,
            token_hash: tokenHash,
            expires_at: expiresAt,
        },
    });

    return{
        token,
        expiresAt,
    };
}

async function findValidSession(token) {
  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const now = new Date();

  const session = await prisma.user_sessions.findUnique({
    where: {
      token_hash: tokenHash,
    },
    select: {
      id: true,
      user_id: true,
      expires_at: true,
      last_used_at: true,
      revoked_at: true,
      created_at: true,
    },
  });

  if (!session) {
    return null;
  }

  if (
    session.revoked_at !== null ||
    session.expires_at <= now
  ) {
    return null;
  }

  const user = await prisma.users.findUnique({
    where: {
      id: session.user_id,
    },
    select: {
      id: true,
      name: true,
      email: true,
      is_active: true,
      must_change_password: true,
    },
  });

  if (
    !user ||
    !user.is_active ||
    user.must_change_password
  ) {
    return null;
  }

  await prisma.user_sessions.update({
    where: {
      id: session.id,
    },
    data: {
      last_used_at: now,
    },
  });

  return {
    id: session.id,
    userId: session.user_id,
    expiresAt: session.expires_at,
    user,
  };
}

async function revokeSession(token) {
    if(!token){
        return;
    }

    const tokenHash = hashSessionToken(token);

    await prisma.user_sessions.updateMany({
        where:{
            token_hash: tokenHash,
            revoked_at: null,
        },
        data:{
            revoked_at: new Date(),
        },
    });
}

module.exports = { createAdminSession, findValidSession, revokeSession}