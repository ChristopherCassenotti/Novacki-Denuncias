const prisma =
    require(
        "../../database/prisma"
    );

function createServiceError(
    message,
    statusCode
) {
    const error =
        new Error(message);

    error.statusCode =
        statusCode;

    return error;
}

function normalizeMetadata(
    value
) {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    /*
     * Dependendo da introspecção atual
     * do Prisma, metadata_json pode
     * chegar como objeto ou string.
     */
    if (
        typeof value ===
        "object"
    ) {
        return value;
    }

    if (
        typeof value ===
        "string"
    ) {
        try {
            return JSON.parse(
                value
            );
        } catch {
            return null;
        }
    }

    return null;
}

function serializeAuditLog(
    log,
    actor = null
) {
    return {
        /*
         * BigInt não pode ser enviado
         * diretamente por JSON.stringify.
         */
        id:
            log.id.toString(),

        actorType:
            log.actor_type,

        actor:
            actor
                ? {
                    id:
                        actor.id,

                    name:
                        actor.name,

                    email:
                        actor.email,
                }
                : null,

        action:
            log.action,

        entityType:
            log.entity_type,

        entityId:
            log.entity_id,

        success:
            log.success,

        requestId:
            log.request_id,

        metadata:
            normalizeMetadata(
                log.metadata_json
            ),

        createdAt:
            log.created_at,
    };
}

async function attachActors(
    logs
) {
    const actorIds = [
        ...new Set(
            logs
                .map(
                    (log) =>
                        log.actor_user_id
                )
                .filter(Boolean)
        ),
    ];

    if (!actorIds.length) {
        return new Map();
    }

    const users =
        await prisma.users.findMany({
            where: {
                id: {
                    in:
                        actorIds,
                },
            },

            select: {
                id: true,
                name: true,
                email: true,
            },
        });

    return new Map(
        users.map(
            (user) => [
                user.id,
                user,
            ]
        )
    );
}

function buildWhere({
    actorUserId,
    action,
    entityType,
    entityId,
    success,
    requestId,
    dateFrom,
    dateTo,
}) {
    const where = {};

    if (actorUserId) {
        where.actor_user_id =
            actorUserId;
    }

    if (action) {
        where.action =
            action;
    }

    if (entityType) {
        where.entity_type =
            entityType;
    }

    if (entityId) {
        where.entity_id =
            entityId;
    }

    if (
        success !==
        undefined
    ) {
        where.success =
            success;
    }

    if (requestId) {
        where.request_id =
            requestId;
    }

    if (
        dateFrom ||
        dateTo
    ) {
        where.created_at =
            {};

        if (dateFrom) {
            where.created_at.gte =
                new Date(
                    dateFrom
                );
        }

        if (dateTo) {
            where.created_at.lte =
                new Date(
                    dateTo
                );
        }
    }

    return where;
}

async function listAuditLogs({
    page,
    limit,
    ...filters
}) {
    const where =
        buildWhere(
            filters
        );

    const skip =
        (page - 1) *
        limit;

    const [
        total,
        logs,
    ] =
        await Promise.all([
            prisma.audit_logs.count({
                where,
            }),

            prisma.audit_logs.findMany({
                where,

                skip,

                take:
                    limit,

                select: {
                    id: true,

                    actor_type:
                        true,

                    actor_user_id:
                        true,

                    action:
                        true,

                    entity_type:
                        true,

                    entity_id:
                        true,

                    success:
                        true,

                    request_id:
                        true,

                    metadata_json:
                        true,

                    created_at:
                        true,
                },

                orderBy: {
                    created_at:
                        "desc",
                },
            }),
        ]);

    const actors =
        await attachActors(
            logs
        );

    return {
        logs:
            logs.map(
                (log) =>
                    serializeAuditLog(
                        log,
                        log.actor_user_id
                            ? actors.get(
                                log.actor_user_id
                            ) || null
                            : null
                    )
            ),

        pagination: {
            page,
            limit,
            total,

            totalPages:
                total === 0
                    ? 0
                    : Math.ceil(
                        total /
                        limit
                    ),
        },
    };
}

async function getAuditLogById(
    id
) {
    /*
     * Prisma usa BigInt aqui.
     */
    const auditId =
        BigInt(id);

    const log =
        await prisma.audit_logs.findUnique({
            where: {
                id:
                    auditId,
            },

            select: {
                id: true,

                actor_type:
                    true,

                actor_user_id:
                    true,

                action:
                    true,

                entity_type:
                    true,

                entity_id:
                    true,

                success:
                    true,

                request_id:
                    true,

                metadata_json:
                    true,

                created_at:
                    true,
            },
        });

    if (!log) {
        throw createServiceError(
            "Registro de auditoria não encontrado.",
            404
        );
    }

    let actor =
        null;

    if (
        log.actor_user_id
    ) {
        actor =
            await prisma.users.findUnique({
                where: {
                    id:
                        log.actor_user_id,
                },

                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            });
    }

    return serializeAuditLog(
        log,
        actor
    );
}

module.exports = {
    listAuditLogs,
    getAuditLogById,
};