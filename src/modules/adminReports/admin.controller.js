const { reportIdParamSchema, listReportsQuerySchema } = require('./adminReports.schema');
const { listAdminReports, getAdminReport } = require('./adminReports.service');

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

    console.error(fallbackMessage, error);

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
        const result = await listAdminReports(validation.data);

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

module.exports = { getReportsHandler, getReportHandler, updateReportStatusSchema, updateReportPrioritySchema, assignReportSchema };