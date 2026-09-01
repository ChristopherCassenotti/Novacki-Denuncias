const { z } = require("zod");

const createAccessGrantSchema =
  z.object({
    userId: z
      .string()
      .uuid("Usuário inválido."),

    scope: z.enum([
      "VIEW",
      "MESSAGE",
      "INVESTIGATE",
      "MANAGE",
    ]),

    reason: z
      .string()
      .trim()
      .max(
        5000,
        "A justificativa pode ter no máximo 5.000 caracteres."
      )
      .optional()
      .nullable(),

    expiresAt: z
      .string()
      .datetime()
      .optional()
      .nullable(),
  });

const accessGrantParamSchema =
  z.object({
    id: z
      .string()
      .uuid(),

    grantId: z
      .string()
      .uuid(),
  });

module.exports = {
  createAccessGrantSchema,
  accessGrantParamSchema,
};