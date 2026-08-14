const { z } = require("zod");

const createInternalNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(
      2,
      "A anotação precisa ter pelo menos 2 caracteres."
    )
    .max(
      20000,
      "A anotação pode ter no máximo 20.000 caracteres."
    ),
});

module.exports = {
  createInternalNoteSchema,
};