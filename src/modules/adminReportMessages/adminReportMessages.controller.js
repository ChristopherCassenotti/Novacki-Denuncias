const { reportIdParamSchema } = require('../adminReports/adminReports.schema');
const { createAdminMessageSchema } = require('./adminReportMessages.schema');
const { listAdminMessages, createAdminMessage} = require('./adminReportMessages.service');

function formatValidantionErrors(error){
    return error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
    }));
}

function sendControllerError(res, error, fallbackMessage){
    if(Number.isInteger(error?.statusCode)){
        return res.status(error.statusCode).json({message: error.message});
    }

    console.error(fallbackMessage, error);

    return res.status(500).json({
        message: fallbackMessage,
    });
}

async function listMessagesHandler(req, res) {
    const params = reportIdParamSchema.safeParse(req.params);

    if(!params.success){
        return res.status(400).json({
            message: 'ID da denúncia inválida.',
        });
    }

    try{
        const messages = await listAdminMessages(params.data.id);

        return res.status(200).json({
            data:{
                messages,
            },
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível carregar as messagens.');
    }
}

async function createMessageHandler(req, res) {
    const params = reportIdParamSchema.safeParse(req.params);

    if(!params.success){
        return res.status(400).json({
            message: 'ID da denúncia inválido.',
        });
    }

    const body = createAdminMessageSchema.safeParse(req.body);

    if(!body.success){
        return res.status(400).json({
            message: 'Messagem inválida.',
            errors: formatValidantionErrors(body.error),
        });
    }

    try{
        const message = await createAdminMessage(params.data.id, body.data, req.auth.userId);

        return res.status(201).json({
            message: 'Mensagem enviada com sucesso.',
            
            data:{
                message,
            }
        });
    }
    catch(error){
        return sendControllerError(res, error, 'Não foi possível enviar a mensagem.');
    }
}

module.exports = { listMessagesHandler, createMessageHandler };
