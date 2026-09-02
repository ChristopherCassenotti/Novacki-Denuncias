const {
    z,
} = require("zod");

const executionsQuerySchema =
    z.object({
        page:
            z.coerce
                .number()
                .int()
                .min(1)
                .default(1),

        limit:
            z.coerce
                .number()
                .int()
                .min(1)
                .max(100)
                .default(30),

        status:
            z.enum([
                "PENDING",
                "RUNNING",
                "COMPLETED",
                "FAILED",
                "CANCELLED",
            ])
                .optional(),

        action:
            z.enum([
                "DELETE",
                "ANONYMIZE",
            ])
                .optional(),

        unitId:
            z
                .string()
                .uuid()
                .optional(),
    });


module.exports = {
    executionsQuerySchema,
};