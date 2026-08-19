const { safeExceptionLog } = require("../../utils/safeLog");
const {
    createRoutingRuleSchema,
    updateRoutingRuleSchema,
    routingRuleStatusSchema,
    routingRuleIdSchema,
} = require(
    "./routingRules.schema"
);

const {
    listRoutingRules,
    getRoutingRule,
    createRoutingRule,
    updateRoutingRule,
    changeRoutingRuleStatus,
} = require(
    "./routingRules.service"
);

function validationError(
    res,
    validation
) {
    return res.status(400).json({
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

    safeExceptionLog("routing_rule", error);

    return res.status(500).json({
        message:
            "Erro interno ao processar a regra de roteamento.",
    });
}

async function listHandler(
    req,
    res
) {
    try {
        return res.json({
            data:
                await listRoutingRules(),
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
        routingRuleIdSchema
            .safeParse(
                req.params
            );

    if (!validation.success) {
        return validationError(
            res,
            validation
        );
    }

    try {
        return res.json({
            data:
                await getRoutingRule(
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
        createRoutingRuleSchema
            .safeParse(
                req.body
            );

    if (!validation.success) {
        return validationError(
            res,
            validation
        );
    }

    try {
        const rule =
            await createRoutingRule(
                validation.data,
                req.auth.userId
            );

        return res
            .status(201)
            .json({
                data:
                    rule,
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
        routingRuleIdSchema
            .safeParse(
                req.params
            );

    const body =
        updateRoutingRuleSchema
            .safeParse(
                req.body
            );

    if (!params.success) {
        return validationError(
            res,
            params
        );
    }

    if (!body.success) {
        return validationError(
            res,
            body
        );
    }

    try {
        return res.json({
            data:
                await updateRoutingRule(
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
        routingRuleIdSchema
            .safeParse(
                req.params
            );

    const body =
        routingRuleStatusSchema
            .safeParse(
                req.body
            );

    if (
        !params.success ||
        !body.success
    ) {
        return res.status(400).json({
            message:
                "Dados inválidos.",
        });
    }

    try {
        return res.json({
            data:
                await changeRoutingRuleStatus(
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
