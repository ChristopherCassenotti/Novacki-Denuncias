const {
    safeExceptionLog,
} = require(
    "../../utils/safeLog"
);

const {
    unitIdSchema,
    createUnitSchema,
    updateUnitSchema,
    unitStatusSchema,
} = require(
    "./adminUnits.schema"
);

const {
    listUnits,
    getUnit,
    createUnit,
    updateUnit,
    changeUnitStatus,
} = require(
    "./adminUnits.service"
);

function validationError(
    res,
    validation
) {
    return res
        .status(400)
        .json({
            message:
                "Dados inválidos.",

            errors:
                validation.error
                    .flatten(),
        });
}

function handleError(
    res,
    error
) {
    if (
        error.statusCode
    ) {
        return res
            .status(
                error.statusCode
            )
            .json({
                message:
                    error.message,
            });
    }

    safeExceptionLog(
        "admin_unit",
        error
    );

    return res
        .status(500)
        .json({
            message:
                "Erro interno ao processar a unidade.",
        });
}

async function listHandler(
    req,
    res
) {
    try {
        return res.json({
            data:
                await listUnits(),
        });
    } catch (error) {
        return handleError(
            res,
            error
        );
    }
}

async function getHandler(
    req,
    res
) {
    const validation =
        unitIdSchema.safeParse(
            req.params
        );

    if (
        !validation.success
    ) {
        return validationError(
            res,
            validation
        );
    }

    try {
        return res.json({
            data:
                await getUnit(
                    validation.data.id
                ),
        });
    } catch (error) {
        return handleError(
            res,
            error
        );
    }
}

async function createHandler(
    req,
    res
) {
    const validation =
        createUnitSchema.safeParse(
            req.body
        );

    if (
        !validation.success
    ) {
        return validationError(
            res,
            validation
        );
    }

    try {
        return res
            .status(201)
            .json({
                data:
                    await createUnit(
                        validation.data,
                        req.auth.userId
                    ),
            });
    } catch (error) {
        return handleError(
            res,
            error
        );
    }
}

async function updateHandler(
    req,
    res
) {
    const params =
        unitIdSchema.safeParse(
            req.params
        );

    const body =
        updateUnitSchema.safeParse(
            req.body
        );

    if (
        !params.success
    ) {
        return validationError(
            res,
            params
        );
    }

    if (
        !body.success
    ) {
        return validationError(
            res,
            body
        );
    }

    try {
        return res.json({
            data:
                await updateUnit(
                    params.data.id,
                    body.data,
                    req.auth.userId
                ),
        });
    } catch (error) {
        return handleError(
            res,
            error
        );
    }
}

async function statusHandler(
    req,
    res
) {
    const params =
        unitIdSchema.safeParse(
            req.params
        );

    const body =
        unitStatusSchema.safeParse(
            req.body
        );

    if (
        !params.success
    ) {
        return validationError(
            res,
            params
        );
    }

    if (
        !body.success
    ) {
        return validationError(
            res,
            body
        );
    }

    try {
        return res.json({
            data:
                await changeUnitStatus(
                    params.data.id,
                    body.data.isActive,
                    req.auth.userId
                ),
        });
    } catch (error) {
        return handleError(
            res,
            error
        );
    }
}

module.exports = {
    listHandler,
    getHandler,
    createHandler,
    updateHandler,
    statusHandler,
};