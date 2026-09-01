const { z } = require('zod');

const roleIdParamSchema = z.object({
    id: z.string().uuid('O ID do perfil precisa ser um UUID válido.'),
});

const roleCodeSchema = z
  .string()
  .trim()
  .min(3, "O código precisa ter pelo menos 3 caracteres.")
  .max(80, "O código pode ter no máximo 80 caracteres.")
  .transform((value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
  )
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]*$/,
        "Use somente letras maiúsculas, números e underscore. O código deve começar com uma letra."
      )
  );

const permissionIdsSchema = z
    .array(
        z
         .string()
         .uuid("Cada permissão precisa possuir um UUID válido.")
        )
    .max(100, "Não é possível atribuir mais de 100 permissões.")
    .transform((permissionIds) => [
       ...new Set(permissionIds),
    ]
);

const createRoleSchema = z.object({
    code: roleCodeSchema,
    
    name: z
    .string()
    .trim()
    .min(3, 'O nome precisa ter pelo menos 3 caracteres.')
    .max(120, 'O nome pode ter no máximo 120 caracteres.'),

    description: z
    .string()
    .trim()
        .max(500, "A descrição pode ter no máximo 500 caracteres.")
    .nullable()
    .optional(),

  permissionIds: permissionIdsSchema.default([]),
});

const updateRoleSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, "O nome precisa ter pelo menos 3 caracteres.")
      .max(120, "O nome pode ter no máximo 120 caracteres.")
      .optional(),

    description: z
      .string()
      .trim()
      .max(
        500,
        "A descrição pode ter no máximo 500 caracteres."
      )
      .nullable()
      .optional(),
  })

  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message:
        "Informe pelo menos um campo para atualização.",
    }
);

const replaceRolePermissionsSchema = z.object({
  permissionIds: permissionIdsSchema.default([]),
});

const changeRoleStatusSchema = z.object({
  isActive: z.boolean({
    error: "O campo isActive precisa ser booleano.",
  }),
});

module.exports = { roleIdParamSchema, createRoleSchema, updateRoleSchema, replaceRolePermissionsSchema, changeRoleStatusSchema };
