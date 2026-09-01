const { z } = require("zod");

const createAdminMessageSchema = z.object({
  type: z.enum([
    "STANDARD",
    "QUESTION",
    "FINAL_RESPONSE",
  ]),

  body: z
    .string()
    .trim()
    .min(
      2,
      "A mensagem precisa ter pelo menos 2 caracteres."
    )
    .max(
      10000,
      "A mensagem pode ter no máximo 10.000 caracteres."
    ),
});

module.exports = {
  createAdminMessageSchema,
};