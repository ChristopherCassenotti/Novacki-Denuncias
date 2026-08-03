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

const changeInitialPasswordSchema = z
  .object({
    newPassoword: z
     .string()
     .min(12, "A nova senha deve ter no mínimo 12 caracteres.")
     .max(72, "A nova senha é muito longa.")
     .regex(/[a-z]/, "Inclua pelo menos uma letra minúscula.")
     .regex(/[A-Z]/, "Inclua pelo menos uma letra maiúscula.")
     .regex(/[0-9]/, "Inclua pelo menos um número.")
     .regex(
       /[^a-zA-Z0-9]/,
       "Inclua pelo menos um caractere especial."
      ),

      confirmPassord: z.string(),
  })
  .refine((data) => data.newPassoword === data.confirmPassord,
  {
    message: "As senha não coincidem.",
    path: ["confirmPassoword"],
  });

module.exports = {
  loginSchema, changeInitialPasswordSchema,
};