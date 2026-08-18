const { createReporterMessageSchema, } = require("./reporterMessages.schema");
const { listReporterMessages, createReporterMessage, } = require("./reporterMessages.service");
const { getReporterHistory, } = require("./reporterHistory.service");

function formatValidationErrors(error){
    return error.issues.map((issue)=>({
        field: issue.path.join('.'),
        message: issue.message,
    }));
}

function sendError(res, error, fallbackMessage){
    if(error && Number.isInteger(error.statusCode)){
        return res.status(error.statusCode).json({message: error.message});
    }

    console.error(fallbackMessage, error);

    return res.status(500).json({
        message: fallbackMessage,
    });
}

async function getMessagesHandler(req, res) {
    try{
        const messages = await listReporterMessages(req.reporterAuth.reportId);

        return res.status(200).json({
            data:{
                messages,
            },
        });
    }
    catch(error){
        return sendError(res, error, 'Não foi possível carregar as mensagens.');
    }
}

async function createMessageHandler(req, res) {
    const validation = createReporterMessageSchema.safeParse(req.body);

    if(!validation.success){
        return res.status(400).json({
            message: 'Mensagem inválida.',
            errors: formatValidationErrors(validation.error),
        });
    }

    try{
        const message = await createReporterMessage(req.reporterAuth.reportId, validation.data.body);

        return res.status(201).json({
            message: 'Mensagem enviada com sucesso.',

            data:{
                message,
            }
        });
    }
    catch(error){
        return sendError(res,error,'Não foi possível enviar a mensagem');
    }
}

async function getHistoryHandler(req, res) {
    try{
        const history = await getReporterHistory(req.reporterAuth.reportId);

        return res.status(200).json({
            data:{
                history
            },
        });
    }
    catch(error){
        return sendError(res, error, 'Não foi possível carregar o histórico.');
    }
}

module.exports = {getMessagesHandler, createMessageHandler, getHistoryHandler}
