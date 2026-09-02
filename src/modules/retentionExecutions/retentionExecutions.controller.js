const {
    executionsQuerySchema,
} = require(
    "./retentionExecutions.schema"
);

const {
    listRetentionExecutions,
} = require(
    "./retentionExecutions.service"
);


async function listHandler(
    req,
    res
) {
    const validation =
        executionsQuerySchema.safeParse(
            req.query
        );

    if (
        !validation.success
    ) {
        return res
            .status(400)
            .json({
                message:
                    "Filtros inválidos.",
            });
    }

    try {
        const result =
            await listRetentionExecutions(
                validation.data,
                req.auth.userId
            );

        return res.json({
            data:
                result,
        });
    } catch (error) {
        return res
            .status(
                error.statusCode ||
                500
            )
            .json({
                message:
                    error.statusCode
                        ? error.message
                        : "Não foi possível listar as ações automáticas.",
            });
    }
}


module.exports = {
    listHandler,
};