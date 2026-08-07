const { userIdParamSchema, createUserSchema, updateUserSchema, replaceUserRolesSchema, changeUserStatusSchema, resetUserPasswordSchema, listUsersQuerySchema, } = require("./users.schema");
const { getUserById, listUsers, createUser: createUserService, updateUser: updateUserService, replaceUserRoles, changeUserStatus, resetUserPassword,} = require("./users.service");

function formatValidationErrors(error){
    return error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
    }));
}

function sendControllerError(res, error, fallbackMessage){
    if(error.statusCode){
        return res.status(error.statusCode).json({
            message: error.message,
        });
    }

    if(error.code === 'P2002'){
        return res.status(409).json({
            message: 'Já existe um registro com esses dados.',
        });
    }

    console.error(fallbackMessage, error.message);

    return res.status(500).json({
        message: fallbackMessage,
    });
}

async function getUsers(req, res) {
    const validation = listUsersQuerySchema.safeParse(req.query);

    if(!validation.success){
        return res.status(400).json({
            message: 'Filtros de usuários inválidos.',

            erros: formatValidationErrors(validation.error),
        });
    }

    try{
        const result = await listUsers(validation.data);

        return res.status(200).json({
            data:result,
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível listar os usuários.');
    }
}

async function getUser(req, res) {
    const validation = userIdParamSchema.safeParse(req.params);

    if(!validation.success){
        return res.status(400).json({
            message: 'ID de usuário inválido.',

            error: formatValidationErrors(validation.error),
        });
    }

    try{
        const user = await getUserById(validation.data.id);

        return res.status(200).json({
            data:{
                user,
            },
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível consultar o usuário.');
    }
}

async function createUserHandler(req, res) {
    const validation = createUserSchema.safeParse(req.body);

    if(!validation.success){
        return res.status(400).json({
            message: 'Dados do usuário inválidos.',

            errors: formatValidationErrors(validation.error),
        });
    }

    try{
        const result = await createUserService(validation.data, req.auth.userId);

        return res.status(201).json({
            message: 'Usuário criado com sucesso.',
            data: result,
            warning: 'A senha temporária é exibida somente nesta resposta.',
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível criar o usuário.');
    }
}

async function updateUserHandler(req, res) {
  const paramsValidation =
    userIdParamSchema.safeParse(
      req.params
    );

  if (!paramsValidation.success) {
    return res.status(400).json({
      message:
        "ID de usuário inválido.",

      errors:
        formatValidationErrors(
          paramsValidation.error
        ),
    });
  }

  const bodyValidation =
    updateUserSchema.safeParse(
      req.body
    );

  if (!bodyValidation.success) {
    return res.status(400).json({
      message:
        "Dados de atualização inválidos.",

      errors:
        formatValidationErrors(
          bodyValidation.error
        ),
    });
  }

  try {
    const user =
      await updateUserService(
        paramsValidation.data.id,
        bodyValidation.data,
        req.auth.userId
      );

    return res.status(200).json({
      message:
        "Usuário atualizado com sucesso.",

      data: {
        user,
      },
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Não foi possível atualizar o usuário."
    );
  }
}

async function replaceRolesHandler(req, res) {
    const paramsValidation = userIdParamSchema.safeParse(req.params);

    if(!paramsValidation.success){
        return res.status(400).json({
            message:'ID de usuário inválido.',
        });
    }

    const bodyValidation = replaceUserRolesSchema.safeParse(req.body);

    if(!bodyValidation.success){
        return res.status(400).json({
            message: 'Lista de perfis inválida',
        
            errors: formatValidationErrors(bodyValidation.error)
        });
    }

    try{
        const user = await replaceUserRoles(paramsValidation.data.id, bodyValidation.data.roleIds, req.auth.userId);

        return res.status(200).json({
            message: 'Perfis do usuário atualizados com sucesso.',

            data:{
                user,
            }
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível atualizar os perfis do usuário.');
    }
}

async function changeStatusHandler(req, res) {
    const paramsValidation = userIdParamSchema.safeParse(req.params);

    if(!paramsValidation.success){
        return res.status(400).json({
            message: 'ID de usuário inválido',

            errors: formatValidationErrors(paramsValidation.error)
        });
    }

    const bodyValidation = changeUserStatusSchema.safeParse(req.body);

    if(!bodyValidation.success){
        return res.status(400).json({
            message: 'Status de usuário inválido.',

            errors: formatValidationErrors(bodyValidation.error)
        });
    }

    try{
        const user = await changeUserStatus(paramsValidation.data.id, bodyValidation.data.isActive, req.auth.userId);

        return res.status(200).json({
            message: bodyValidation.data.isActive
                ? 'Usuário ativado com sucesso'
                : 'Usuário desativado com sucesso',

            data:{
                user
            }
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível alterar o status do usuário.'); 
    }
}

async function resetPasswordHandler(req, res) {
    const paramsValidation = userIdParamSchema(req.params);

    if(!paramsValidation.success){
        return res.status(400).json({
            message: 'ID de usuário inválido.',
            
            errors: formatValidationErrors(paramsValidation.error),
        });
    }

    const bodyValidation = resetUserPasswordSchema(req.body);

    if(!bodyValidation.success){
        return res.status(400).json({
            message: 'Dados de redefinição de senha inválidos.',

            errors: formatValidationErrors(bodyValidation.error),
        });
    }

    try{
        const result = await resetUserPassword(paramsValidation.data.id, bodyValidation.data.temporaryPassword, req.auth.userId);

        return res.status(200).json({
            message: 'Senha redefinida com sucesso.',

            data: result,

            warning: 'A senha temporária é exibida somente nesta resposta.'
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível redefinir a senha');
    }
}

module.exports = { getUser, getUsers, createUserHandler, updateUserHandler, replaceRolesHandler, changeStatusHandler, resetPasswordHandler };