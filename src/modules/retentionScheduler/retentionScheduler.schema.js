const { z } = require("zod");

const reportIdParamSchema =
    z.object({
        id: z
            .string()
            .uuid(
                "ID da denúncia inválido."
            ),
    });

module.exports = {
    reportIdParamSchema,
};
