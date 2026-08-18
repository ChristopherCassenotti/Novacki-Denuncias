const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const prisma = require('../../database/prisma');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const REPORTER_SESSION_MINUTES = 60;

function createServiceError(message, statusCode){
    const error = new Error(message);

    error.statusCode = statusCode;

    return error;
}

function generateReportAccessSecret(){
    return randomBytes(24).toString('base64url');
}

function hashReportAccessSecret(secret) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("A chave de acesso é obrigatória.");
  }

  const hash = createHash("sha256").update(secret, "utf8").digest("hex");

  return `sha256:${hash}`;
}

function verifyReportAccessSecret(secret, storedHash) {
  if (typeof secret !== "string" ||typeof storedHash !== "string") {
    return false;
  }

  const calculatedHash = hashReportAccessSecret(secret);

  const calculatedBuffer = Buffer.from(calculatedHash, "utf8");

  const storedBuffer = Buffer.from(storedHash, "utf8");

  if (calculatedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(calculatedBuffer, storedBuffer);
}

function generateReporterSessionToken(){
    return randomBytes(32).toString('base64url');
}

function hashReporterSessionToken(token){
    return createHash('sha256').update(token, 'utf8').digest();
}

function calculateLockUntil(){
    return new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
}

function calculateSessionExpiration(){
    return new Date(Date.now() + REPORTER_SESSION_MINUTES * 60 * 1000); 
}

async function registerFailedAttempt(credential) {
    const newFailedAttempts = credential.failed_attempts + 1;

    const shouldLock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

    await prisma.report_access_credentials.update({
        where:{
            id: credential.id,
        },
        data:{
            failed_attempts: 
            shouldLock
                ? 0
                : newFailedAttempts,

            locked_until:
                shouldLock
                    ? calculateLockUntil()
                    : credential.locked_until,
        },
    });
}

async function authenticateReporter({protocol, accessSecret}) {
    const report = await prisma.reports.findUnique({
        where:{
            protocol,
        },
        select:{
            id: true,
            protocol: true,
            status: true,
            last_activity_at: true,
            created_at: true,
        }
    });

    if(!report){
        throw createServiceError('Protocolo ou chave secreta inválidos.', 401);
    }
    
    const credential = await prisma.report_access_credentials.findUnique({
        where:{
            report_id: report.id,
        },

        select:{
            id: true,
            report_id: true,
            secret_hash: true,
            failed_attempts: true,
            locked_until: true,
        }
    });

    if(!credential){
        throw createServiceError('Protocolo ou chave secreta inválidos.', 401);
    }

    const now = new Date();

    if(credential.locked_until && credential.locked_until > now){
        throw createServiceError('O acesso está temporariamente bloqueado. Tente novamente mais tarde.', 429);
    }
    const secretIsValid = verifyReportAccessSecret(accessSecret, credential.secret_hash);

    if(!secretIsValid){
        await registerFailedAttempt(credential);

        throw createServiceError('Protocolo ou chave secreta inválidos.', 401);
    }

    const sessionToken = generateReporterSessionToken();

    const tokenHash = hashReporterSessionToken(sessionToken);

    const expiresAt = calculateSessionExpiration();

    await prisma.$transaction(async (tx) => {
        await tx.report_access_credentials.update({
            where:{
                id: credential.id,
            },

            data:{
                failed_attempts: 0,
                locked_until: null,
                last_access_at: now,
            },
        });

        await tx.reporter_sessions.create({
            data:{
                id: require('node:crypto').randomUUID(),
                report_id: report.id,
                token_hash: tokenHash,
                expires_at: expiresAt,
            },
        });
    });

    return {
        sessionToken, 
        expiresAt,
        report:{
            protocol: report.protocol,
            status: report.status,
            lastActivityAt: report.last_activity_at,
            createdAt: report.created_at,
        },
    };
}

async function findReporterSession(token) {
    if(!token){
        return null;
    }

    const tokenHash = hashReporterSessionToken(token);

    const session = await prisma.reporter_sessions.findUnique({
        where:{
            token_hash: tokenHash,
        },
        select:{
            id: true,
            report_id: true,
            expires_at: true,
            revoked_at: true,
        },
    });

    if(!session){
        return null;
    }

    const now = new Date();

    if(session.revoked_at || session.expires_at <= now){
        return null;
    }

    await prisma.reporter_sessions.update({
        where:{
            id: session.id,
        },
        data:{
            last_used_at: now,
        }
    });

    return session;
}

async function revokeReporterSession(sessionId) {
    await prisma.reporter_sessions.updateMany({
        where:{
            id: sessionId,
            revoked_at: null,
        },
        data:{
            revoked_at: new Date(),
        },
    })
}

module.exports = { generateReportAccessSecret, hashReportAccessSecret, verifyReportAccessSecret, authenticateReporter, findReporterSession, revokeReporterSession };
