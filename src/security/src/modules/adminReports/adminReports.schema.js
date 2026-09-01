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
const updateReportStatusSchema = z.object({
  status: z.enum([
    "RECEIVED",
    "INITIAL_REVIEW",
    "WAITING_REPORTER_INFORMATION",
    "INVESTIGATING",
    "FORWARDED",
    "CONCLUDED",
    "ARCHIVED",
  ]),

  expectedVersion: z
    .number()
    .int()
    .min(1),
});

const updateReportPrioritySchema = z.object({
  priority: z.enum([
    "LOW",
    "NORMAL",
    "HIGH",
    "CRITICAL",
  ]),
});

const assignReportSchema = z.object({
  targetType: z.enum([
    "USER",
    "TEAM",
  ]),

  targetId: z
    .string()
    .uuid("Usuário ou equipe inválido."),

  reason: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable(),
});

module.exports = {
  reportIdParamSchema,
  listReportsQuerySchema,
  updateReportStatusSchema,
  updateReportPrioritySchema,
  assignReportSchema,
};