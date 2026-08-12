const { z } = require("zod");

const reportIdParamSchema = z.object({
  id: z
    .string()
    .uuid(
      "O ID da denúncia precisa ser um UUID válido."
    ),
});

const listReportsQuerySchema = z.object({
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

  status: z
    .enum([
      "RECEIVED",
      "INITIAL_REVIEW",
      "WAITING_REPORTER_INFORMATION",
      "INVESTIGATING",
      "FORWARDED",
      "CONCLUDED",
      "ARCHIVED",
    ])
    .optional(),

  priority: z
    .enum([
      "LOW",
      "NORMAL",
      "HIGH",
      "CRITICAL",
    ])
    .optional(),

  categoryId: z
    .string()
    .uuid(
      "O ID da categoria precisa ser válido."
    )
    .optional(),

  unitId: z
    .string()
    .uuid(
      "O ID da unidade precisa ser válido."
    )
    .optional(),

  mode: z
    .enum([
      "ANONYMOUS",
      "IDENTIFIED",
    ])
    .optional(),

  immediateRisk: z
    .enum(["true", "false"])
    .transform(
      (value) =>
        value === "true"
    )
    .optional(),
});

module.exports = {
  reportIdParamSchema,
  listReportsQuerySchema,
};