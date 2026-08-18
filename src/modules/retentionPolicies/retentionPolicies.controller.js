const {
    policyIdParamSchema,
    createRetentionPolicySchema,
    updateRetentionPolicySchema,
    changeRetentionPolicyStatusSchema,
} = require(
    "./retentionPolicies.schema"
);

const {
    listRetentionPolicies,
    getPolicyById,
    createRetentionPolicy,
    updateRetentionPolicy,
    changeRetentionPolicyStatus,
} = require(
    "./retentionPolicies.service"
);

function sendError(
    res,
    error,
    fallback
) {
    if (
        Number.isInteger(
            error?.statusCode
        )
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

    console.error(
        fallback,
        error
    );

    return res.status(500).json({
        message:
            fallback,
    });
}

async function listRetentionPoliciesHandler(
    req,
    res
) {
    try {
        const policies =
            await listRetentionPolicies();

        return res.status(200).json({
            data: {
                policies,
            },
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível carregar as políticas de retenção."
        );
    }
}

async function getRetentionPolicyHandler(
    req,
    res
) {
    const validation =
        policyIdParamSchema.safeParse(
            req.params
        );

    if (!validation.success) {
        return res.status(400).json({
            message:
                "ID da política inválido.",
        });
    }

    try {
        const policy =
            await getPolicyById(
                validation.data.id
            );

        return res.status(200).json({
            data: {
                policy,
            },
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível carregar a política."
        );
    }
}

async function createRetentionPolicyHandler(
    req,
    res
) {
    const validation =
        createRetentionPolicySchema.safeParse(
            req.body
        );

    if (!validation.success) {
        return res.status(400).json({
            message:
                "Dados da política inválidos.",

            errors:
                validation.error.issues,
        });
    }

    try {
        const policy =
            await createRetentionPolicy(
                validation.data,
                req.auth.userId
            );

        return res.status(201).json({
            message:
                "Política de retenção criada com sucesso.",

            data: {
                policy,
            },
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível criar a política."
        );
    }
}

async function updateRetentionPolicyHandler(
    req,
    res
) {
    const params =
        policyIdParamSchema.safeParse(
            req.params
        );

    const body =
        updateRetentionPolicySchema.safeParse(
            req.body
        );

    if (!params.success) {
        return res.status(400).json({
            message:
                "ID da política inválido.",
        });
    }

    if (!body.success) {
        return res.status(400).json({
            message:
                "Dados da política inválidos.",
        });
    }

    try {
        const policy =
            await updateRetentionPolicy(
                params.data.id,
                body.data,
                req.auth.userId
            );

        return res.status(200).json({
            message:
                "Política atualizada com sucesso.",

            data: {
                policy,
            },
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível atualizar a política."
        );
    }
}

async function changeRetentionPolicyStatusHandler(
    req,
    res
) {
    const params =
        policyIdParamSchema.safeParse(
            req.params
        );

    const body =
        changeRetentionPolicyStatusSchema.safeParse(
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
        const policy =
            await changeRetentionPolicyStatus(
                params.data.id,
                body.data.isActive,
                req.auth.userId
            );

        return res.status(200).json({
            message:
                "Status da política atualizado.",

            data: {
                policy,
            },
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível alterar o status da política."
        );
    }
}

module.exports = {
    listRetentionPoliciesHandler,
    getRetentionPolicyHandler,
    createRetentionPolicyHandler,
    updateRetentionPolicyHandler,
    changeRetentionPolicyStatusHandler,
};