const { z } = require("zod");

const teamIdParamSchema = z.object({
  id: z
    .string()
    .uuid("O ID da equipe precisa ser um UUID válido."),
});

const memberSchema = z.object({
  userId: z
    .string()
    .uuid("O ID do usuário precisa ser um UUID válido."),

  role: z.enum([
    "MEMBER",
    "COORDINATOR",
  ]),
});

const membersSchema = z
  .array(memberSchema)
  .max(100, "A equipe pode possuir no máximo 100 membros.")
  .superRefine((members, ctx) => {
    const userIds = new Set();

    for (const member of members) {
      if (userIds.has(member.userId)) {
        ctx.addIssue({
          code: "custom",
          path: ["members"],
          message:
            "O mesmo usuário não pode aparecer mais de uma vez na equipe.",
        });

        return;
      }

      userIds.add(member.userId);
    }
  });

const createTeamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "O nome precisa ter pelo menos 3 caracteres.")
    .max(120, "O nome pode ter no máximo 120 caracteres."),

  description: z
    .string()
    .trim()
    .max(500, "A descrição pode ter no máximo 500 caracteres.")
    .nullable()
    .optional(),

  isIndependent: z.boolean().default(false),

  members: membersSchema.default([]),
});

const updateTeamSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .optional(),

    description: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional(),

    isIndependent: z
      .boolean()
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message:
        "Informe pelo menos um campo para atualização.",
    }
  );

const replaceMembersSchema = z.object({
  members: membersSchema,
});

const changeTeamStatusSchema = z.object({
  isActive: z.preprocess(
    (value) => {
      if (value === "true") return true;
      if (value === "false") return false;

      return value;
    },
    z.boolean({
      message:
        "O campo isActive precisa ser booleano.",
    })
  ),
});

module.exports = {
  teamIdParamSchema,
  createTeamSchema,
  updateTeamSchema,
  replaceMembersSchema,
  changeTeamStatusSchema,
};