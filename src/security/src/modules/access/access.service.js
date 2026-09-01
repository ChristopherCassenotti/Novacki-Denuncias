const prisma = require('../../database/prisma');

async function getUserAccessContext(userId) {
    const userRoleAssignments = await prisma.user_roles.findMany({
        where:{
            user_id: userId,
        },
        select:{
            role_id: true,
        },
    });

    if(userRoleAssignments.length === 0){
        return{
            roles: [],
            permissions: [],
        };
    }

    const assignedRoleIds = userRoleAssignments.map(
        (assignment) => assignment.role_id
    );

    const roles = await prisma.roles.findMany({
        where: {
            id:{
                in: assignedRoleIds,
            },
            is_active:true,
        },
        select:{
            id:true,
            code: true,
            name: true,
            description: true,
            is_system: true,
        },
        orderBy:{
            name: "asc",
        },
    });

    if(roles.length === 0){
        return{
            roles: [],
            permissions: [],
        };
    }

    const activeRoleIds = roles.map((role) => role.id);

    const rolePermissionAssignments =
        await prisma.role_permissions.findMany({
            where:{
                role_id:{
                    in: activeRoleIds,
                },
            },
            select:{
                permission_id: true,
            },
        });
        
        const permissionIds = [
            ...new Set(
                rolePermissionAssignments.map(
                    (assignment) => assignment.permission_id
                )
            ),
        ];

        const permissions = await prisma.permissions.findMany({
            where:{
                id:{
                    in: permissionIds,
                },
            },
            select:{
                id:true,
                code: true,
                description: true,
            },
        });

        return{
            roles,
            permissions,
        };
}

module.exports = { getUserAccessContext };