const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randoUUID } = require('node:crypto');

const prisma = require('../../database/prisma');
const { type } = require('node:os');
const { id } = require('zod/locales');

const DUMMY_PASSWORD_HASH = bcrypt.hashSync("invalid-password-placeholder", 12);

async function authenticateAdmin({email, password}) {
    
    const user = await prisma.users.findUnique({
        where:{
            email,
        },

        select:{
            id: true,
            name: true,
            email: true,
            password_hash: true,
            is_active: true,
            must_change_password: true,
        },
    });

    const passwordHash = user?.password_hash || DUMMY_PASSWORD_HASH;

    const passwordMatches = await bcrypt.compare(password, passwordHash);

    if(!user || !passwordMatches || !user.is_active){
        return null;
    }

    const activeMfaMethod = await prisma.user_mfa_methods.findFirst({
        where:{
            user_id: user.id,
            is_active: true,
        },
        select:{
            id:true,
        },
    });

    let nextStep;

    if(user.must_change_password) {
        nextStep = "CHAGE_PASSWORD";
    }
    else if(!activeMfaMethod){
        nextStep = "MFA_SETUP";
    }
    else{
        nextStep = "MFA_CHALLENGE";
    }

    const preAuthToken = generatePreAuthToken(
        user.id,
        nextStep
    );

    return {
        user:{
            id: user.id,
            name: user.name,
            email: user.email,
        },
        nextStep,
        preAuthToken,
    };
};

async function changeInitialPassword({userId, newPassword}) {
    const user = await prisma.users.findUnique({
        where:{
            id: userId,
        },
        select:{
            id:true,
            email:true,
            password_hash:true,
            is_active:true,
            must_change_password:true,
        },
    });

    if(!user || !user.is_active){
        const error = new Error("Usuário não encontrado ou inativo.");
        error.statusCode = 401;
        throw error;
    }

    if(!user.must_change_password){
        const error = new Error(
            "A senha inicial deste usuário já foi alterada."
        );
        error.statusCode = 409;
        throw error;
    }

    const isSamePassword = await bcrypt.compare(
        newPassword,
        user.password_hash,
    );

    if(isSamePassword){
        const error = new Error("A nova senha precisa ser diferente da atual.");
        error.statusCode = 400;
        throw error;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction(async (tx) => {
        await tx.users.update({
            where:{
                id: user.id,
            },
            data:{
                password_hash: passwordHash,
                must_change_password: false,
                password_changed_at: new Date(),
            },
        });

        await tx.user_one_time_tokens.deleteMany({
            where:{
                user_id: user.id,
            },
        });

        await tx.audit_logs.create({
            data:{
                actor_type: "ADMIN",
                actor_user_id: user.id,
                action: "INITIAL_PASSWORD_CHANGED",
                entity_type: "USER",
                entity_id: user.id,
                success:true,
                request_id: randoUUID(),
                metadata_json:{
                    source: "ADMIN_PRE_AUTH",
                },
            },
        });
    });

    return{
        nextStep: "MFA_SETUP",
        preAuthToken: generatePreAuthToken(
            user.id,
            "MFA_SETUP"
        ),
    };
}

function generatePreAuthToken(userId, nextStep) {
    return jwt.sign(
        {
            type: "ADMIN_PRE_AUTH",
            nextStep,
        },
        process.env.ADMIN_PRE_AUTH_SECRET,
        {
            subject:userId,
            expiresIn:
            process.env.ADMIN_PRE_AUTH_EXPIRES_IN || "10m",
            issuer: "novacki-denuncias",
            audience: "admin-panel",
            algorithm: "HS256",
        }
    );
}

module.exports = {authenticateAdmin, changeInitialPassword};