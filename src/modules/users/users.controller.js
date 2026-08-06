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