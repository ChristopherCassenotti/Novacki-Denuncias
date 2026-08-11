const { randomUUID } = require('node:crypto');

const prisma = require('../../database/prisma');

function createServiceError(message, statusCode){
    const error = new Error(message);
    error.statusCode = statusCode;

    return error;
}

function serializeAuditMetadata(metadata){
    return metadata == null
        ? null
        : JSON.stringify(metadata);
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

async function findTeamOrFail(database, teamId) {
    const team = await database.teams.findUnique({
        where: {
            id: teamId,
        },
        select:{
            id: true,
            name: true,
            description: true,
            is_independent: true,
            is_active: true,
            created_at: true,
            updated_at: true,
        }
    });

    if(!team){
        throw createServiceError('Equipe não encontrada.', 404);
    }

    return team;
}

async function validateMembers(database, members) {
    if(members.length === 0){
        return [];
    }

    const userIds = members.map((member) => member.userId);

    const users = await database.users.findMany({
        where:{
            id: {
                in: userIds,
            },
        },
        select:{
            id: true,
            is_active: true,
        },
    });

    if(users.length !== userIds.length){
        throw createServiceError('Um ou mais usuários informados não existem', 400);
    }

    const inactiveUsers = users.filter((user) => !user.is_active);

    if(inactiveUsers.length > 0){
        throw createServiceError('Usuários inativos não podem ser adicionados à equipe.', 400);
    }

    return members;
}

async function attachMembers(team) {
    const assignments = await prisma.team_members.findMany({
        where:{
            team_id: team.id,
        },
        select:{
            user_id: true,
            role: true,
            joined_at: true,
        },
    });

    if(assignments.length === 0){
        return {...team, members: [],};
    }

    const userIds = assignments.map((assignment) => assignment.user_id);

    const users = await prisma.users.findMany({
        where:{
            id:{
                in: userIds,
            },
        },
        select:{
            id: true,
            name: true,
            email: true,
            is_active: true,
        },
    });

    const userMap = new Map(users.map((user) => [user.id, user]));

    const members = assignments.map((assignment) => {
        const user = userMap.get(assignment.user_id);
    
        if(!user){
            return null
        }

        return {
            ...user,
            teamRole: assignment.role,
            joinedAt: assignment.joined_at,
        }
    })
    .filter(Boolean);

    return {
        ...team,
        members,
    };
}

async function getTeamById(teamId) {
    const team = await findTeamOrFail(prisma, teamId);

    return attachMembers(team);
}

async function listTeams() {
    const teams = await prisma.teams.findMany({
        select:{
            id: true,
            name: true,
            description: true,
            is_independent: true,
            is_active: true,
            created_at: true,
            updated_at: true,
        },
        orderBy:{
            name:'asc',
        },
    });

    return Promise.all(teams.map((team) => attachMembers(team)));
}

async function createTeam({name, description, isIndependent, members}, actorUserId) {
    const existingTeam = await prisma. teams.findUnique({
        where:{
            name,
        },
        select:{
            id:true,
        },
    });

    if(existingTeam){
        throw createServiceError('Já existe uma equipe com esse nome.', 409);
    }

    const teamId = randomUUID();

    await prisma.$transaction(async(tx) => {
        const validMembers = await validateMembers(tx, members);
    
        await tx.teams.create({
            data:{
                id: teamId,
                name,
                description: normalizeDescription(description) ?? null,
                is_independent: isIndependent,
                is_active: true,
            },
        });

        if(validMembers.length > 0){
            await tx.team_members.createMany({
                data: validMembers.map((member) => ({
                    team_id: teamId,
                    user_id: member.userId,
                    role: member.role,
                })),
                skipDuplicates: true,
            });
        }

        await tx.audit_logs.create({
            data:{
                actor_type: 'ADMIN',
                actor_user_id: actorUserId,
                action: 'TEAM_CREATED',
                entity_type: 'TEAM',
                entity_id: teamId,
                success: true,
                request_id: randomUUID(),
                metadata_json: serializeAuditMetadata({name, isIndependent, members: validMembers}),
            },
        });
    });

    return getTeamById(teamId);
}

async function updateTeam(teamId, data, actorUserId) {
    const currentTeam = await findTeamOrFail(prisma, teamId);

    const updateData = {};

    if(data.name !== undefined){
        updateData.name = data.name;
    }

    if(data.description !== undefined){
        updateData.description = normalizeDescription(data.description);
    }

    if(data.isIndependent !== undefined){
        updateData.is_independent = data.isIndependent;
    }

    await prisma.$transaction(async (tx) => {
        await tx.teams.update({
            where:{
                id: teamId,
            },
            data: updateData,
        });

        await tx.audit_logs.create({
            data:{
                actor_type: 'ADMIN',
                actor_user_id: actorUserId,
                action: 'TEAM_UPDATED',
                entity_type: 'TEAM',
                entity_id: teamId,
                success: true,
                request_id: randomUUID(),
                metadata_json: serializeAuditMetadata({
                    previous: {
                        name: currentTeam.name,
                        description: currentTeam.description,
                        isIndependent: currentTeam.is_independent,
                    },
                    current: updateData
                })
            }
        });
    });

    return getTeamById(teamId)
}

async function replaceTeamMembers(teamId, members, actorUserId) {
    await findTeamOrFail(prisma, teamId);

    await prisma.$transaction(async (tx) => {
        const validMembers = await validateMembers(tx, members);

        const previousMembers =
            await tx.team_members.findMany({
                where:{
                    team_id: teamId,
                },
                select:{
                    user_id: true,
                    role: true,
                },
            });

            await tx.team_members.deleteMany({
                where: {
                    team_id: teamId,
                },
            });

            if(validMembers.length > 0){
                await tx.team_members.createMany({
                    data: validMembers.map((member) => ({
                        team_id: teamId,
                        user_id: member.userId,
                        role: member.role,
                    })),
                    skipDuplicates: true,
                });
            }

            await tx.audit_logs.create({
                data:{
                    actor_type: 'ADMIN',
                    actor_user_id: actorUserId,
                    action: 'TEAM_MEMBERS_REPLACED',
                    entity_type: 'TEAM',
                    entity_id: teamId,
                    success: true,
                    request_id: randomUUID(),
                    metadata_json: serializeAuditMetadata({
                        previousMembers,
                        currentMembers: validMembers,
                    }),
                },
            });
    });

    return getTeamById(teamId);
}

async function changeTeamStatus(teamId, isActive, actorUserId) {
    const currentTeam = await findTeamOrFail(prisma, teamId);

    if(currentTeam.is_active === isActive){
        return getTeamById(teamId);
    }

    await prisma.$transaction(async (tx) => {
        await tx.teams.update({
            where:{
                id: teamId,
            },
            data:{
                is_active: isActive,
            },
        });

        await tx.audit_logs.create({
            data:{
                actor_type: 'ADMIN',
                actor_user_id: actorUserId,
                action: isActive
                    ? 'TEAM_ACTIVED'
                    : 'TEAM_DEACTIVATED',
                entity_type: 'TEAM',
                entity_id: teamId,
                success: true,
                request_id: randomUUID(),
                metadata_json: serializeAuditMetadata({
                    previousStatus: currentTeam.is_active,
                    currentStatus: isActive,
                }),
            },
        });
    });

    return getTeamById(teamId);
}

module.exports = {getTeamById, listTeams, createTeam, updateTeam, replaceTeamMembers, changeTeamStatus};
