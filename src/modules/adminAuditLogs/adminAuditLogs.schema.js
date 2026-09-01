const { z } = require("zod");

const auditLogsQuerySchema =
    z.object({
        page: z.coerce
            .number()
            .int()
            .min(1)
            .default(1),

        limit: z.coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .default(20),

        actorUserId: z
            .string()
            .uuid()
            .optional(),

        action: z
            .string()
            .trim()
            .min(1)
            .max(120)
            .optional(),

        entityType: z
            .string()
            .trim()
            .min(1)
            .max(80)
            .optional(),
        unitId: z
            .string()
            .uuid(
                "O ID da unidade precisa ser um UUID válido."
            )
            .optional(),
        entityId: z
            .string()
            .trim()
            .min(1)
            .max(80)
            .optional(),

        requestId: z
            .string()
            .trim()
            .min(1)
            .max(80)
            .optional(),

        success: z
            .enum([
                "true",
                "false",
            ])
            .transform(
                (value) =>
                    value === "true"
            )
            .optional(),

        dateFrom: z
            .string()
            .datetime()
            .optional(),

        dateTo: z
            .string()
            .datetime()
            .optional(),
    })
    .refine(
        (data) => {
            if (
                !data.dateFrom ||
                !data.dateTo
            ) {
                return true;
            }

            return (
                new Date(
                    data.dateFrom
                ) <=
                new Date(
                    data.dateTo
                )
            );
        },
        {
            message:
                "A data inicial não pode ser posterior à data final.",
        }
    );

const auditLogIdParamSchema =
    z.object({
        id: z
            .string()
            .regex(
                /^\d+$/,
                "ID de auditoria inválido."
            ),
    });

module.exports = {
    auditLogsQuerySchema,
    auditLogIdParamSchema,
};