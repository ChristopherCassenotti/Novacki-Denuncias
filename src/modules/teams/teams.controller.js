const { tr } = require('zod/locales');
const { teamIdParamSchema, createTeamSchema, updateTeamSchema, replaceMembersSchema, changeTeamStatusScham } = require('./teams.schema');
const { getTeamById, listTeams, createTeam, updateTeam, replaceTeamMembers, changeTeamStatus } = require('./teams.service');

function formatValidationErrors(error){
    return error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
    }));
}

function sendControllerError(res, error, fallbackMessage){
    if(error.statusCode){
        return res.status(error.statusCode).json({message: error.message});
    }
    
    if(error.code === 'P2002'){
        return res.status(409).json({
            message: 'Já existe uma equipe com esses dados.'
        });
    }

    console.error(fallbackMessage, error.message);

    return res.status(500).json({
        message: fallbackMessage,
    });
}

async function getTeams(req, res) {
    try{
        const teams = await listTeams();

        return res.status(200).json({
            data:{
                teams,
            },
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível listar as equipes');
    }
}

async function getTeam(req, res){
    const validation = teamIdParamSchema.safeParse(req.params);

    if(!validation.success){
        return res.status(400).json({
            message: 'ID de equipe inválido.',
            errors: formatValidationErrors(validation.error),
        });
    }

    try{
        const team = await getTeamById(validation.data.id);

        return res.status(200).json({
            data:{
                team,
            }
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível consultar a equipe.');
    }
}

async function createTeamHandler(req, res) {
  const validation = createTeamSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      message:
        "Dados da equipe inválidos.",
      errors:
        formatValidationErrors(
          validation.error
        ),
    });
  }

  try{
    const team = await createTeam(validation.data, req.auth.userId);

    return res.status(201).json({
        message:'Equipe criada com sucesso.',
        data:{
            team,
        },
    });
  }
  catch(error){
    return sendControllerError(res, error, 'Não foi possível criar a equipe.');
  }
}

async function updateTeamHandler(req, res) {
    const paramsValidation = teamIdParamSchema.safeParse(req.params);

    if(!paramsValidation.success){
        return res.status(400).json({
            message: 'ID de equipe inválido.',
            errors: formatValidationErrors(paramsValidation.error),
        });
    }

    const bodyValidation = updateTeamSchema.safeParse(req.body);

    if(!bodyValidation.success){
        return res.status(400).json({
            message: 'Dados de atualização inválidos.',
            errors: formatValidationErrors(bodyValidation.error),
        });
    }

    try{
        const team = await updateTeam(
            paramsValidation.data.id,
            bodyValidation.data,
            req.auth.userId
        )

        return res.status(200).json({
            message: 'Equipe atualizada com sucesso.',
            data:{
                team
            },
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível atualizar a equipe.');
    }
}

async function replaceMembersHandler(req, res) {
    const paramsValidation = teamIdParamSchema.safeParse(req.params);

    if(!paramsValidation.success){
        return res.status(400).json({
            message: "ID de equipe inválido.",
            errors: formatValidationErrors(paramsValidation.error)
        })
    }

    const bodyValidation = replaceMembersSchema.safeParse(req.body);

    if(!bodyValidation.success){
        return res.status(400).json({
            message: 'Membros da equipe inválidos.',
            errors: formatValidationErrors(bodyValidation.error)
        })
    }

    try{
        const team = await replaceMembersHandler (paramsValidation.data.id, bodyValidation.data.members, req.auth.userId);

        return res.status(200).json({
            message: 'Membros atualizados com sucesso.',
            data:{
                team,
            },
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível atualizar os membros.');
    }
}

async function changeStatusHandler(req, res) {
    const paramsValidation = teamIdParamSchema.safeParse(req.params);

    if(!paramsValidation.success){
        return res.status(400).json({
            message:'ID da equipe inválido',
            erros: formatValidationErrors(paramsValidation.error),
        })
    }

    const bodyValidation = teamIdParamSchema.safeParse(req.body);

    if(!bodyValidation.success){
        return res.status(400).json({
            message: 'Status da equipe inválido',
            errors: formatValidationErrors(bodyValidation.error)
        })
    }

    try{
        const team = await changeTeamStatus(paramsValidation.data.id, bodyValidation.data.isActive, req.auth.userId);

        return res.status(200).json({
            message: bodyValidation.data.isActive
                ? 'Equipe ativada com sucesso'
                : 'Equipe desativada com sucesso',

            data:{
                team,
            }
        })
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível alterar os status da equipe.');
    }
}
