const { safeExceptionLog } = require("../../utils/safeLog");
const { updateReportPrioritySchema, updateReportStatusSchema, assignReportSchema, reportIdParamSchema, listReportsQuerySchema } = require('./adminReports.schema');
const { listAdminReports, getAdminReport, updateReportPriority, updateReportStatus, assignReport, unassignReport } = require('./adminReports.service');

function formatValidantionErrors(error){
    return error.issues.map((issue) => ({
            field: issue.path.join('.'),

            message: issue.message,
        })
    );
}

function sendError(res, error, fallbackMessage){
    if(error && Number.isInteger(error.statusCode)){
        return res.status(error.statusCode).json({message: error.message});
    }

    safeExceptionLog("admin_report", error);

    return res.status(500).json({message: fallbackMessage});
}

async function getReportsHandler(req, res) {
    const validation = listReportsQuerySchema.safeParse(req.query);

    if(!validation.success){
        return res.status(400).json({
            message: 'Filtros de denúncias inválidos.',

            errors: formatValidantionErrors(validation.error),
        });
    }

    try{
        const result = await listAdminReports(validation.data, req.auth.userId);

        return res.status(200).json({
            data: result,
        });
    }
    catch(error){
        return sendError(res, error, 'Não foi possível listar as denúncias.');
    }
}

async function getReportHandler(req, res) {
    const validation = reportIdParamSchema.safeParse(req.params);

    if(!validation.success){
        return res.status(400).json({
            message: 'ID de denúncia inválido.',

            errors: formatValidantionErrors(validation.error),
        });
    }

    try{
        const report = await getAdminReport(validation.data.id);

        return res.status(200).json({
            data:{
                report,
            }
        });
    }
    catch(error){
        return sendError(res, error, 'Não foi possível consultar a denúncia.');
    }
}

async function updateStatusHandler(req, res) {
    const params = reportIdParamSchema.safeParse(req.params);

    const body = updateReportStatusSchema.safeParse(req.body);

    if(!params.success){
        return res.status(400).json({
            message: 'ID da denúncia inválido.',
        });
    }

    if(!body.success){
        return res.status(400).json({
            message: 'Dados de status inválidos.',

            errors: formatValidantionErrors(body.error),
        });
    }
    
    try{
        const report = await updateReportStatus(params.data.id, body.data, req.auth.userId);

        return res.status(200).json({
            message: 'Status atualizado com sucesso.',

            data:{
                report,
            }
        });
    }
    catch(error){
        return sendError(res, error, 'Não foi possível alterar o status.');
    }
}

async function updatePriorityHandler(req, res) {
    const params = reportIdParamSchema.safeParse(req.params);

    const body = updateReportPrioritySchema.safeParse(req.body);

    if(!params.success || !body.success){
        return res.status(400).json({
            message: 'Dados inválidos.'
        });
    }

    try{
        const report = await updateReportPriority(params.data.id, body.data, req.auth.userId);

        return res.status(200).json({
            message: 'Prioridade atualizada com sucesso.',

            data:{
                report,
            }
        });
    }
    catch(error){
        return sendError(res, error, 'Não foi possível alterar a prioridade.');
    }
}

async function assignReportHandler(req, res) {
    const params = reportIdParamSchema.safeParse(req.params);

    const body = assignReportSchema.safeParse(req.body);

    if(!params.success || !body.success){
        return res.status(400).json({
            message: 'Dados de atribuição inválidos.',
        });
    }

    try{
        const report = 
            await assignReport(params.data.id, body.data, req.auth.userId);

        return res.status(200).json({
            message: 'Denúncia atribuída com sucesso.',

            data:{
                report,
            },
        });
    }
    catch(error){
        return sendError(res, error, 'Não foi possível atribuir a denúncia.');
    }
}

async function unassignReportHandler(req, res) {
    const params = reportIdParamSchema.safeParse(req.params);

    if(!params.success){
        return res.status(400).json({
            message: 'ID da denúncia inválido.',
        });
    }

    try{
        const report =
            await unassignReport(params.data.id, req.auth.userId);

        return res.status(200).json({
            message: 'Responsável removido com sucesso.',

            data:{
                report,
            },
        });
    }
    catch(error){
        return sendError(res, error, 'Não foi possível remover o responsável.');
    }
}

module.exports = { getReportsHandler, getReportHandler, updateStatusHandler, updatePriorityHandler, assignReportHandler, unassignReportHandler };
