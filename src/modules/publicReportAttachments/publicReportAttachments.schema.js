const { z } = require("zod");

const attachmentIdParamSchema =
    z.object({
        attachmentId: z
            .string()
            .uuid(
                "ID do anexo inválido."
            ),
    });

const uploadAttachmentBodySchema =
    z.object({
        messageId: z
            .string()
            .uuid(
                "ID da mensagem inválido."
            )
            .optional()
            .nullable(),
    });

module.exports = {
    attachmentIdParamSchema,
    uploadAttachmentBodySchema,
};