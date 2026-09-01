const { z } = require("zod");

const unitIdSchema =
    z.object({
        id: z
            .string()
            .uuid(),
    });

const createUnitSchema =
    z.object({
        name: z
            .string()
            .trim()
            .min(
                2,
                "Informe o nome da unidade."
            )
            .max(150),

        notificationEmail: z
            .string()
            .trim()
            .email(
                "Informe um e-mail válido."
            )
            .max(255),
    });

const updateUnitSchema =
    z.object({
        name: z
            .string()
            .trim()
            .min(
                2,
                "Informe o nome da unidade."
            )
            .max(150)
            .optional(),

        notificationEmail: z
            .string()
            .trim()
            .email(
                "Informe um e-mail válido."
            )
            .max(255)
            .optional(),
    })
    .refine(
        (data) =>
            Object.keys(data)
                .length > 0,
        {
            message:
                "Informe pelo menos um campo.",
        }
    );

const unitStatusSchema =
    z.object({
        isActive:
            z.boolean(),
    });

module.exports = {
    unitIdSchema,
    createUnitSchema,
    updateUnitSchema,
    unitStatusSchema,
};