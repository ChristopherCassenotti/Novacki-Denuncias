const { randomUUID } = require('node:crypto');

const prisma = require('../../database/prisma');

function createServiceError(message, statusCode){
    const error = new Error(message);
    error.statusCode = statusCode;

    return error;
}

function normalizeDescription(description){
    if(description === undefined){
        return undefined;
    }

    if(description === null || description.trim() === ""){
        return null;
    }

    return description.trim();
}

async function findeRoleOrFail(database, roleId) {
    const role = await database.roles.findUnique({
        where:{
            id: roleId,
        },
        select:{
            id: true,
            code: true,
            name: true,
            description: true,
            is_system: true,
            is_active: true,
            created_at: true,
            updated_at: true,
        },
    });

    if(!role){
        throw createServiceError('Perfil não encontrado.', 404);
    }

    return role;
}

function ensureRoleCanBeModified(role){
    if(role.is_system){
        throw createServiceError('Perfis internos do sistema não podem ser modificados', 403)
    }
}

async function validatePermissionIds(database, permissionIds) {
    const uniquePermissionIds = [...new Set(permissionIds)];
    
    if(uniquePermissionIds.length === 0){
        return [];
    }

    const permissions = await database.permissions.findMany({
        where:{
            id:{
                in: uniquePermissionIds,
            },
        },
        select:{
            id: true,
        },
    });

    if(permissions.length !== uniquePermissionIds.length){
        const existingPermissionsIds = new Set(
            permissions.map((permission) => permission.id)
        );
        
        const invalidPermissionIds = uniquePermissionIds.filter((permissionId) => 
            !existingPermissionsIds.has(permissionId)
        );

        throw createServiceError(`Uma ou mais permissões não existem: ${invalidPermissionIds.join(", ")}`, 400);
    }

    return uniquePermissionIds;
}

async function getRoleById(roleId) {
    const role = await findeRoleOrFail(prisma, roleId);

    const assignments =
        await prisma.role_permissions.findMany({
            where:{
                role_id: role.id,
            },
            select:{
                permission_id: true,
            },
        });
        
        const permission = assignments.map((assignments) => assignments.permission_id);

        const permissions = 
            permission.length === 0
             ? []
             : await prisma.permissions.findMany({
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
                orderBy:{
                    code: 'asc',
                },
             });

    return{
        ...role,
        permission
    };
}

async function listRoles() {
    const roles = await prisma.roles.findMany({
        select:{
            id:true,
            code: true,
            name: true,
            description: true,
            is_system: true,
            is_active: true,
            created_at: true,
            updated_at: true,
        },
        orderBy:{
            name: 'asc',
        },
    });

    if(roles.length === 0){
        return [];
    }

    const roleIds = roles.map((role) => role.id);

    const assignments =
        await prisma.role_permissions.findMany({
            where:{
                role_id:{
                    in: roleIds,
                },
            },
            select:{
                role_id: true,
                permission_id: true,
            },
        });

        const permissionIds = [
            ...new Set(
                assignments.map((assignments) => assignments.permission_id),
            ),
        ];

        const permissions =
            permissionIds.length === 0
            ? []
            : await prisma.permissions.findMany({
                where:{
                    id:{
                        in: permissionIds,
                    },
                    select:{
                        id: true,
                        code: true,
                        description: true,
                    },
                    orderBy:{
                        code: 'asc',
                    },
                },
            });
        
        const permissionMap = new Map(
            permissions.map((permission) => [
                permission.id,
                permission,
            ])
        );

        const permissionsByRole = new Map();

        for(const assignment of assignments){
            const permission = permissionMap.get(
                assignment.permission_id
            );

            if(!permission){
                continue;
            }

            const rolePermissions =
                permissionsByRole.get(assignment.role_id) || [];

            rolePermissions.push(permission);

            permissionsByRole.set(
                assignment.role_id,
                rolePermissions
            );
        }

        return roles.map((role) => ({
            ...role,
            permissions:
                permissionsByRole.get(role.id) || [],
        }));
}