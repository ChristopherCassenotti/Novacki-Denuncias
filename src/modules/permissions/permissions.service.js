const prisma = require('../../database/prisma');

async function listPermissions() {
    return prisma.permissions.findMany({
        select:{
            id:true,
            code:true,
            description:true,
            created_at:true,
        },
        orderBy:{
            code: 'asc',
        },
    });
}

module.exports = {listPermissions};