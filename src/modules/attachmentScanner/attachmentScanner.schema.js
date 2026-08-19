const { z } =
    require("zod");

const attachmentIdParamSchema =
    z.object({
        id: z
            .string()
            .uuid(
                "ID do anexo inválido."
            ),
    });

module.exports = {
    attachmentIdParamSchema,
};