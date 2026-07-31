const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = require('../../database/prisma');
const { type } = require('node:os');

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

    const preAuthToken = jwt.sign(
        {
            type: "ADMIN_PRE_AUTH",
            nextStep,
        },
        process.env.ADMIN_PRE_AUTH_SECRET,
        {
            subject: user.id,
            expiresIn: process.env.ADMIN_PRE_AUTH_EXPIRES_IN || "10m",
            issuer: "novacki-denuncias",
            audience: "admin-panel",
            algorithm: "HS256",
        }
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

module.exports = {authenticateAdmin};