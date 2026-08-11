const { z } = require("zod");

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Informe um e-mail válido.")
    .max(191),

  password: z
    .string()
    .min(1, "Informe a senha.")
    .max(72, "A senha é muito longa."),
});

const changeInitialPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(
        12,
        "A nova senha precisa ter pelo menos 12 caracteres."
      )
      .max(72, "A nova senha é muito longa.")
      .regex(/[a-z]/, "Inclua uma letra minúscula.")
      .regex(/[A-Z]/, "Inclua uma letra maiúscula.")
      .regex(/[0-9]/, "Inclua um número.")
      .regex(
        /[^a-zA-Z0-9]/,
        "Inclua um caractere especial."
      ),

    confirmPassword: z.string(),
  })
  .refine(
    ({ newPassword, confirmPassword }) =>
      newPassword === confirmPassword,
    {
      message: "As senhas não coincidem.",
      path: ["confirmPassword"],
    }
  );

const completeCredentialSetupSchema = z
  .object({
    token: z
      .string()
      .min(40, "Token de credencial inválido.")
      .max(200, "Token de credencial inválido."),
    newPassword: z
      .string()
      .min(12, "A nova senha precisa ter pelo menos 12 caracteres.")
      .max(72, "A nova senha é muito longa.")
      .regex(/[a-z]/, "Inclua uma letra minúscula.")
      .regex(/[A-Z]/, "Inclua uma letra maiúscula.")
      .regex(/[0-9]/, "Inclua um número.")
      .regex(/[^a-zA-Z0-9]/, "Inclua um caractere especial."),
    confirmPassword: z.string(),
  })
  .refine(
    ({ newPassword, confirmPassword }) =>
      newPassword === confirmPassword,
    {
      message: "As senhas não coincidem.",
      path: ["confirmPassword"],
    }
  );

module.exports = {
  loginSchema,
  changeInitialPasswordSchema,
  completeCredentialSetupSchema,
};
