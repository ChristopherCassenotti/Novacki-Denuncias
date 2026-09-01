const {
    randomUUID,
} = require("node:crypto");

const prisma =
    require(
        "../../database/prisma"
    );
const {
    createScopedAuditLog,
} = require(
    "../adminAuditLogs/auditScope.service"
);
const {
    getActorUnitScope,
    assertUnitWithinActorScope,
    assertAdminMaster,
} = require(
    "../access/unitScope.service"
);
function serviceError(
    message,
    statusCode
) {
    const error =
        new Error(message);

    error.statusCode =
        statusCode;

    return error;
}

function serializeUnit(
    unit
) {
    return {
        id:
            unit.id,

        code:
            unit.code,

        name:
            unit.name,

        notificationEmail:
            unit.notification_email,

        isActive:
            unit.is_active,

        createdAt:
            unit.created_at,

        updatedAt:
            unit.updated_at,
    };
}

function buildUnitCode(
    name
) {
    return name
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toUpperCase()
        .replace(
            /[^A-Z0-9]+/g,
            "_"
        )
        .replace(
            /^_+|_+$/g,
            ""
        )
        .slice(
            0,
            80
        );
}

async function findUnitOrFail(
    id,
    database = prisma
) {
    const unit =
        await database
            .units
            .findUnique({
                where: {
                    id,
                },
            });

    if (
        !unit ||
        unit.type !== "UNIT"
    ) {
        throw serviceError(
            "Unidade não encontrada.",
            404
        );
    }

    return unit;
}

async function assertNameAvailable(
    database,
    name,
    excludeId = null
) {
    const existing =
        await database
            .units
            .findFirst({
                where: {
                    name,

                    ...(excludeId
                        ? {
                            id: {
                                not:
                                    excludeId,
                            },
                        }
                        : {}),
                },

                select: {
                    id: true,
                },
            });

    if (existing) {
        throw serviceError(
            "Já existe uma unidade com este nome.",
            409
        );
    }
}

async function assertCodeAvailable(
    database,
    code
) {
    const existing =
        await database
            .units
            .findUnique({
                where: {
                    code,
                },

                select: {
                    id: true,
                },
            });

    if (existing) {
        throw serviceError(
            "Já existe uma unidade com código equivalente a este nome.",
            409
        );
    }
}

async function listUnits(
    actorUserId
) {
    const scope =
        await getActorUnitScope(
            actorUserId
        );

    if (
        !scope.isAdminMaster &&
        scope.unitIds.length === 0
    ) {
        return [];
    }

    const where = {
        type:
            "UNIT",
    };

    if (
        !scope.isAdminMaster
    ) {
        where.id = {
            in:
                scope.unitIds,
        };
    }

    const units =
        await prisma.units.findMany({
            where,

            orderBy: {
                name:
                    "asc",
            },
        });

    return units.map(
        serializeUnit
    );
}

async function getUnit(
    id,
    actorUserId
) {
    await assertUnitWithinActorScope(
        actorUserId,
        id
    );

    return serializeUnit(
        await findUnitOrFail(
            id
        )
    );
}

async function createUnit(
    data,
    actorUserId
) {
        await assertAdminMaster(
        actorUserId
    );
    const code =
        buildUnitCode(
            data.name
        );

    if (!code) {
        throw serviceError(
            "Não foi possível gerar o código da unidade.",
            400
        );
    }

    const created =
        await prisma.$transaction(
            async (tx) => {
                await assertNameAvailable(
                    tx,
                    data.name
                );

                await assertCodeAvailable(
                    tx,
                    code
                );

                const unit =
                    await tx.units.create({
                        data: {
                            id:
                                randomUUID(),

                            parent_id:
                                null,

                            code,

                            name:
                                data.name,

                            type:
                                "UNIT",

                            notification_email:
                                data.notificationEmail
                                    .trim()
                                    .toLowerCase(),

                            is_active:
                                true,
                        },
                    });

                await createScopedAuditLog(
                    tx,
                    {
                        actor_type:
                            "ADMIN",

                        actor_user_id:
                            actorUserId,

                        action:
                            "UNIT_CREATED",

                        entity_type:
                            "UNIT",

                        entity_id:
                            unit.id,

                        success:
                            true,

                        request_id:
                            randomUUID(),

                        metadata_json:
                            JSON.stringify({
                                code:
                                    unit.code,

                                name:
                                    unit.name,

                                isActive:
                                    true,
                            }),
                    }
                );

                return unit;
            }
        );

    return serializeUnit(
        created
    );
}

async function updateUnit(
    id,
    patch,
    actorUserId
) {
        await assertUnitWithinActorScope(
        actorUserId,
        id
    );
    const updated =
        await prisma.$transaction(
            async (tx) => {
                const current =
                    await findUnitOrFail(
                        id,
                        tx
                    );

                const nextName =
                    patch.name ??
                    current.name;

                if (
                    patch.name !==
                    undefined &&
                    patch.name !==
                    current.name
                ) {
                    await assertNameAvailable(
                        tx,
                        patch.name,
                        id
                    );
                }

                const nextEmail =
                    patch.notificationEmail !==
                    undefined
                        ? patch
                            .notificationEmail
                            .trim()
                            .toLowerCase()
                        : current
                            .notification_email;

                const unit =
                    await tx.units.update({
                        where: {
                            id,
                        },

                        data: {
                            name:
                                nextName,

                            notification_email:
                                nextEmail,

                            updated_at:
                                new Date(),
                        },
                    });

                await createScopedAuditLog(
                    tx,
                    {
                        actor_type:
                            "ADMIN",

                        actor_user_id:
                            actorUserId,

                        action:
                            "UNIT_UPDATED",

                        entity_type:
                            "UNIT",

                        entity_id:
                            id,

                        success:
                            true,

                        request_id:
                            randomUUID(),

                        metadata_json:
                            JSON.stringify({
                                previousName:
                                    current.name,

                                currentName:
                                    unit.name,

                                notificationEmailChanged:
                                    current.notification_email !==
                                    unit.notification_email,
                            }),
                    }
                );

                return unit;
            }
        );

    return serializeUnit(
        updated
    );
}

async function changeUnitStatus(
    id,
    isActive,
    actorUserId
) {
        await assertAdminMaster(
        actorUserId
    );
    const updated =
        await prisma.$transaction(
            async (tx) => {
                const current =
                    await findUnitOrFail(
                        id,
                        tx
                    );

                if (
                    current.is_active ===
                    isActive
                ) {
                    return current;
                }

                const unit =
                    await tx.units.update({
                        where: {
                            id,
                        },

                        data: {
                            is_active:
                                isActive,

                            updated_at:
                                new Date(),
                        },
                    });

                await createScopedAuditLog(
                    tx,
                    {
                        actor_type:
                            "ADMIN",

                        actor_user_id:
                            actorUserId,

                        action:
                            isActive
                                ? "UNIT_ACTIVATED"
                                : "UNIT_DEACTIVATED",

                        entity_type:
                            "UNIT",

                        entity_id:
                            id,

                        success:
                            true,

                        request_id:
                            randomUUID(),

                        metadata_json:
                            JSON.stringify({
                                isActive,
                            }),
                    }
                );

                return unit;
            }
        );

    return serializeUnit(
        updated
    );
}

module.exports = {
    listUnits,
    getUnit,
    createUnit,
    updateUnit,
    changeUnitStatus,
};