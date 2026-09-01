const { z } = require("zod");

const createRestrictionSchema = z.object({
  userId: z
    .string()
    .uuid("Usuário inválido."),

  reason: z.enum([
    "MENTIONED_IN_REPORT",
    "CONFLICT_OF_INTEREST",
    "HR_INVOLVEMENT",
    "ADMIN_INVOLVEMENT",
    "MANUAL",
  ]),

  notes: z
    .string()
    .trim()
    .max(
      5000,
      "A justificativa pode ter no máximo 5.000 caracteres."
    )
    .optional()
    .nullable(),
});

const restrictionUserParamSchema = z.object({
  id: z
    .string()
    .uuid(),

  userId: z
    .string()
    .uuid(),
});

module.exports = {
  createRestrictionSchema,
  restrictionUserParamSchema,
};