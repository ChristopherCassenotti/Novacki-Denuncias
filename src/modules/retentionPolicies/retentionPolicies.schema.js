const { z } = require("zod");

const policyIdParamSchema =
    z.object({
        id: z
            .string()
            .uuid(
                "ID da política inválido."
            ),
    });

const createRetentionPolicySchema =
    z.object({
        name: z
            .string()
            .trim()
            .min(3)
            .max(150),

        categoryId: z
            .string()
            .uuid()
            .nullable()
            .optional(),

        appliesToStatus: z
            .enum([
                "CONCLUDED",
                "ARCHIVED",
            ]),

        retentionDays: z.coerce
            .number()
            .int()
            .min(1)
            .max(36500),

        action: z
            .enum([
                "ANONYMIZE",
                "DELETE",
            ]),

        isActive: z
            .boolean()
            .optional()
            .default(true),
    });

const updateRetentionPolicySchema =
    z.object({
        name: z
            .string()
            .trim()
            .min(3)
            .max(150)
            .optional(),

        categoryId: z
            .string()
            .uuid()
            .nullable()
            .optional(),

        appliesToStatus: z
            .enum([
                "CONCLUDED",
                "ARCHIVED",
            ])
            .optional(),

        retentionDays: z.coerce
            .number()
            .int()
            .min(1)
            .max(36500)
            .optional(),

        action: z
            .enum([
                "ANONYMIZE",
                "DELETE",
            ])
            .optional(),
    })
    .refine(
        (data) =>
            Object.keys(data).length > 0,
        {
            message:
                "Informe pelo menos um campo para alteração.",
        }
    );

const changeRetentionPolicyStatusSchema =
    z.object({
        isActive:
            z.boolean(),
    });

module.exports = {
    policyIdParamSchema,
    createRetentionPolicySchema,
    updateRetentionPolicySchema,
    changeRetentionPolicyStatusSchema,
};