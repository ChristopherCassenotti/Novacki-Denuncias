const { z } = require("zod");

const reportLegalHoldParamSchema =
    z.object({
        id: z
            .string()
            .uuid(
                "ID da denúncia inválido."
            ),
    });

const applyLegalHoldSchema =
    z.object({
        reason: z
            .string()
            .trim()
            .min(
                10,
                "Informe o motivo do bloqueio legal."
            )
            .max(
                2000,
                "O motivo deve possuir no máximo 2000 caracteres."
            ),
    });

const releaseLegalHoldSchema =
    z.object({
        reason: z
            .string()
            .trim()
            .min(
                10,
                "Informe o motivo da remoção do bloqueio."
            )
            .max(
                2000,
                "O motivo deve possuir no máximo 2000 caracteres."
            ),
    });

module.exports = {
    reportLegalHoldParamSchema,
    applyLegalHoldSchema,
    releaseLegalHoldSchema,
};