const { safeExceptionLog } = require("../../utils/safeLog");
const { roleIdParamSchema, createRoleSchema, updateRoleSchema, replaceRolePermissionsSchema, changeRoleStatusSchema } = require('./roles.schema');
const { getRoleById, listRoles, createRole, updateRole, replaceRolePermissions, changeRoleStatus, } = require('./roles.service');

function formatValidationErrors(error){
    return error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
    }));
}

function sendControllerError(res, error, fallbackMessage){
    if(error.statusCode){
        return res.status(error.statusCode).json({
            message: error.message
        });
    }

    safeExceptionLog("admin_role", error);

    return res.status(500).json({
        message: fallbackMessage,
    });
}

async function getRoles(req, res) {
    try{
        const roles = await listRoles();

        return res.status(200).json({
            data:{
                roles,
            },
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível listar os perfis');
    }
}

async function getRole(req, res) {
    
    const paramsValidation = roleIdParamSchema.safeParse(req.params);

    if(!paramsValidation.success){
        return res.status(400).json({
            message: 'ID de perfil inválido.',
            errors: formatValidationErrors(
                paramsValidation.error,
            ),
        });
    }

    try{
        const role = await getRoleById(paramsValidation.data.id);

        return res.status(200).json({
            data:{
                role,
            },
        });
    }
    catch(error){
        
        return sendControllerError(res, error, 'Não foi possível consultar o perfil.');
    }
}

async function createRoleHandler(req, res) {
    const validation = createRoleSchema.safeParse(req.body);

    if(!validation.success){
        return res.status(400).json({
            message: 'Dados do perfil inválidos.',
            errors: formatValidationErrors(validation.error)
        });
    }

    try{
        const role = await createRole(validation.data, req.auth.userId);

        return res.status(201).json({
            message: 'Perfil criado com sucesso.',
            data:{
                role,
            },
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível criar o perfil.');
    }
}

async function updateRoleHandler(req, res) {
    
    const paramsValidation = roleIdParamSchema.safeParse(req.params);

    if(!paramsValidation.success){
        return res.status(400).json({
            message: 'ID e perfil inválido.',
            errors: formatValidationErrors(paramsValidation.error),
        });
    }

    const bodyValidation = updateRoleSchema.safeParse(req.body);

    if(!bodyValidation.success){
        return res.status(400).json({
            message: 'Dados de atualização inválidos.',
            errors: formatValidationErrors(bodyValidation.error),
        });
    }

    try{
        const role = await updateRole(
            paramsValidation.data.id,
            bodyValidation.data,
            req.auth.userId
        );

        return res.status(200).json({
            message: 'Perfil atualizado com sucesso.',
            data:{
                role,
            },
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível atualizar o perfil');
    }
}

async function  replacePermissionsHandler(req, res) {
    
    const paramsValidation = roleIdParamSchema.safeParse(req.params);

    if(!paramsValidation.success){
        return res.status(400).json({
            message: 'ID de perfil inválido.',
            errors: formatValidationErrors(paramsValidation.error),
        });
    }

    const bodyValidation = replaceRolePermissionsSchema.safeParse(req.body);

    if(!bodyValidation.success){
        return res.status(400).json({
            message: 'Permissões do perfil inválidas.',
            errors: formatValidationErrors(bodyValidation.error),
        });
    }


    try{
        const role = await replaceRolePermissions(
            paramsValidation.data.id,
            bodyValidation.data.permissionIds,
            req.auth.userId
        );

        return res.status(200).json({
            message: 'Permissões do perfil atualizadas com sucesso.',
            data:{
                role,
            },
        });
    }
    catch(error){
        
        return sendControllerError(res, error, 'Não foi possível atualizar as permissões;.');
    }
}

async function changeStatusHandler(req, res) {
    
    const paramsValidation = roleIdParamSchema.safeParse(req.params);

    if(!paramsValidation.success){
        return res.status(400).json({
            message: 'ID de perfil inválido.',
            errors: formatValidationErrors(paramsValidation.error),
        });
    }

    const bodyValidation = changeRoleStatusSchema.safeParse(req.body);

    if(!bodyValidation.success){
        return res.status(400).json({
            message: 'Status de perfil inválido.',
            errors: formatValidationErrors(bodyValidation.error),
        });
    }

    try{
        const role = await changeRoleStatus(
            paramsValidation.data.id,
            bodyValidation.data.isActive,
            req.auth.userId
        );

        return res.status(200).json({
            message: bodyValidation.data.isActive
            ? 'Perfil ativado com sucesso.'
            : 'Perfil desativado com sucesso',

            data:{
                role,
            },
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível alterar o status do perfil.');
    }
}

module.exports = { getRole, getRoles, createRoleHandler, updateRoleHandler, replacePermissionsHandler, changeStatusHandler};
