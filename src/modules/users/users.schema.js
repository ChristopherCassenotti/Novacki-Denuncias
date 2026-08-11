const { z } = require('zod');

const userIdParamSchema = z.object({
  id: z
    .string()
    .uuid("O ID do usuário precisa ser um UUID válido."),
});

const roleIdsSchema = z
  .array(
    z
      .string()
      .uuid("Cada perfil precisa possuir um UUID válido.")
  )
  .min(1, "O usuário precisa possuir pelo menos um perfil.")
  .max(20, "Não é possível atribuir mais de 20 perfis.")
  .transform((roleIds) => [...new Set(roleIds)]);

const strongPasswordSchema = z
  .string()
  .min(12, "A senha precisa ter pelo menos 12 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.")
  .regex(/[a-z]/, "A senha precisa conter uma letra minúscula.")
  .regex(/[A-Z]/, "A senha precisa conter uma letra maiúscula.")
  .regex(/[0-9]/, "A senha precisa conter um número.")
  .regex(
    /[^a-zA-Z0-9]/,
    "A senha precisa conter um caractere especial."
  );

const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "O nome precisa ter pelo menos 3 caracteres.")
    .max(150, "O nome pode ter no máximo 150 caracteres."),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Informe um e-mail válido.")
    .max(191, "O e-mail pode ter no máximo 191 caracteres."),

  roleIds: roleIdsSchema,
});

const updateUserSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, "O nome precisa ter pelo menos 3 caracteres.")
      .max(150, "O nome pode ter no máximo 150 caracteres.")
      .optional(),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Informe um e-mail válido.")
      .max(191, "O e-mail pode ter no máximo 191 caracteres.")
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: "Informe pelo menos um campo para atualização.",
    }
  );

const replaceUserRolesSchema = z.object({
  roleIds: roleIdsSchema,
});

const changeUserStatusSchema = z.object({
  isActive: z.boolean({
    message: "O campo isActive precisa ser booleano.",
  }),
});

const resetUserPasswordSchema = z.object({}).strict();

const listUsersQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),

  search: z
    .string()
    .trim()
    .max(191)
    .optional(),

  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),

  roleId: z
    .string()
    .uuid("O filtro de perfil precisa ser um UUID válido.")
    .optional(),
});

module.exports = { userIdParamSchema, createUserSchema, updateUserSchema, replaceUserRolesSchema, changeUserStatusSchema, resetUserPasswordSchema, listUsersQuerySchema, };
