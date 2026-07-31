const { z } = require("zod");

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Informe um e-mail válido.")
    .max(191, "O e-mail é muito longo."),

  password: z
    .string()
    .min(1, "Informe a senha.")
    .max(72, "A senha é muito longa."),
});

module.exports = {
  loginSchema,
};