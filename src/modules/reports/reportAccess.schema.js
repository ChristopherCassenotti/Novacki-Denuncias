const { z } = require("zod");

const accessReportSchema = z.object({
  protocol: z
    .string()
    .trim()
    .min(10, "Informe um protocolo válido.")
    .max(40, "Informe um protocolo válido.")
    .transform((value) =>
      value.toUpperCase()
    ),

  accessSecret: z
    .string()
    .trim()
    .min(20, "Informe a chave secreta.")
    .max(120, "Chave secreta inválida."),
});

module.exports = {
  accessReportSchema,
};