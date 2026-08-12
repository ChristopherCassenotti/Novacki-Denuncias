const { z } = require("zod");

const createReporterMessageSchema =
  z.object({
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
  createReporterMessageSchema,
};