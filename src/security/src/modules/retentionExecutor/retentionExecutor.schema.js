const { z } = require("zod");

const executionIdParamSchema =
    z.object({
        id: z
            .string()
            .uuid(
                "ID da execução de retenção inválido."
            ),
    });

module.exports = {
    executionIdParamSchema,
};
