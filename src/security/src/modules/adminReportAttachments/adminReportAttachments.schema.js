const { z } = require("zod");

const attachmentParamSchema =
    z.object({
        id: z
            .string()
            .uuid(
                "ID da denúncia inválido."
            ),

        attachmentId: z
            .string()
            .uuid(
                "ID do anexo inválido."
            ),
    });

module.exports = {
    attachmentParamSchema,
};