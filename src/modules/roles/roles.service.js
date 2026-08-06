const { randomUUID } = require('node:crypto');

const prisma = require('../../database/prisma');
const { create } = require('node:domain');
const { success } = require('zod');

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

async function createRole({code, name, description, permissionIds, actorUserId}) {
        const existingRole = await prisma.roles.findUnique({
            where:{
                code,
            },
            select:{
                id:true,
            },
        });

        if(existingRole){
            throw createServiceError('Já existe um perfil com esse', 409);
        }
        
        const roleId = randomUUID();

        await prisma.$transaction(async (tx)=>{
            const validatePermissionIds = await validatePermissionIds(tx, permissionIds);
        });

        await tx.roles.create({
            data:{
                id: roleId,
                code,
                name,
                description: normalizeDescription(description) ?? null,
                is_system: false,
                is_active: true,
            },
        });

        if(validatePermissionIds.length > 0){
            await tx.role_permissions.createMany({
                data: validatePermissionIds.map((permissionId) => ({
                    role_id: roleId,
                    permission_id: permissionId,
                })
            ),
            skipDuplicates: true,
            });
        }

        await tx.audit_logs.create({
            data:{
                actor_type: 'ADMIN',
                actor_user_id: actorUserId,
                action: 'ROLE_CREATED',
                entity_id: roleId,
                success: true,
                request_id: randomUUID(),
                metadata_json:{
                    code,
                    name,
                    permissionIds: validatePermissionIds,
                },
            },
        });

        return getRoleById(roleId);
}

async function updateRole(roleId, {name, description}, actorUserId) {
    
    const currentRole = await findeRoleOrFail(prisma,roleId);

    ensureRoleCanBeModified(currentRole);

    const updateData = {};

    if(name !== undefined){
        updateData.description = normalizeDescription(description);
    }

    await prisma.$transaction(async (tx) => {
        await tx.roles.update({
            where:{
                id: roleId,
            },
            data: updateData,
    });

    await tx.audit_logs.create({
        data:{
            actor_type: "ADMIN",
            actor_user_id: actorUserId,
            action: "ROLE_UPDATED",
            entity_type: "ROLE",
            entity_id: roleId,
            success: true,
            request_id: randomUUID(),
            metadata_json:{
                changedFields: Object.keys(updateData),
                previous:{
                    name: currentRole.name,
                    description: currentRole.description,
                },
                current: updateData,
            },
        },
    });
    });

    return getRoleById(roleId);
}

async function replaceRolePermissions(params) {
    
}