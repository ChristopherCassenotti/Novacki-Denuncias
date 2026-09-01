const { z } = require("zod");

const relationshipTypes = [
  "EMPLOYEE",
  "FORMER_EMPLOYEE",
  "SUPPLIER",
  "CUSTOMER",
  "OTHER",
];

const reportModes = [
  "ANONYMOUS",
  "IDENTIFIED",
];

const personListSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "O nome ou descrição não pode estar vazio.")
      .max(200, "Cada item pode ter no máximo 200 caracteres.")
  )
  .max(50, "Não é possível informar mais de 50 pessoas.")
  .default([]);

const identitySchema = z
  .object({
    name: z
      .string()
      .trim()
      .max(150, "O nome pode ter no máximo 150 caracteres.")
      .optional(),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Informe um e-mail válido.")
      .max(191)
      .optional(),

    phone: z
      .string()
      .trim()
      .max(30, "O telefone pode ter no máximo 30 caracteres.")
      .optional(),

    consentToContact: z
      .boolean()
      .default(false),
  })
  .superRefine((identity, ctx) => {
    const hasIdentity =
      Boolean(identity.name) ||
      Boolean(identity.email) ||
      Boolean(identity.phone);

    if (!hasIdentity) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message:
          "Na denúncia identificada, informe pelo menos nome, e-mail ou telefone.",
      });
    }
  });

const reportContentSchema = z.object({
  occurrenceDateApprox: z
    .string()
    .trim()
    .max(
      120,
      "A data aproximada pode ter no máximo 120 caracteres."
    )
    .nullable()
    .optional(),

  location: z
    .string()
    .trim()
    .max(
      500,
      "O local pode ter no máximo 500 caracteres."
    )
    .nullable()
    .optional(),

  description: z
    .string()
    .trim()
    .min(
      20,
      "Descreva o ocorrido com pelo menos 20 caracteres."
    )
    .max(
      15000,
      "A descrição pode ter no máximo 15.000 caracteres."
    ),

  involvedPeople: personListSchema,

  witnesses: personListSchema,
});

const createPublicReportSchema = z
  .object({
    mode: z.enum(reportModes),

    relationshipType: z.enum(
      relationshipTypes
    ),

    unitId: z
      .string({
        required_error:
          "A unidade é obrigatória.",
        invalid_type_error:
          "A unidade é obrigatória.",
      })
      .uuid(
        "A unidade precisa possuir um UUID válido."
      ),

    categoryId: z
      .string()
      .uuid("A categoria precisa possuir um UUID válido."),

    immediateRisk: z
      .boolean()
      .default(false),

    content: reportContentSchema,

    identity: identitySchema
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.mode === "ANONYMOUS" &&
      data.identity
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["identity"],
        message:
          "Uma denúncia anônima não pode conter dados de identificação.",
      });
    }

    if (
      data.mode === "IDENTIFIED" &&
      !data.identity
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["identity"],
        message:
          "Informe os dados de identificação para uma denúncia identificada.",
      });
    }
  });

module.exports = {
  createPublicReportSchema,
};