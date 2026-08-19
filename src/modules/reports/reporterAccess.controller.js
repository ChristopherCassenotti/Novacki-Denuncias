const { accessReportSchema } = require('./reportAccess.schema');
const { authenticateReporter, revokeReporterSession } = require('./reportAccess.service');
const { getReporterReport } = require('./reporterReport.service');
const {
    reporterCookieOptions,
    reporterCookieName,
    reporterSessionDurationMs,
} = require('../../config/cookies');
const { safeExceptionLog } = require('../../utils/safeLog');

function formatValidationErrors(error){
    return error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
    }));
}

async function accessReportHandler(req, res) {
    const validation = accessReportSchema.safeParse(req.body);

    if(!validation.success){
        return res.status(400).json({
            message: 'Dados de acesso inválidos.',
            errors: formatValidationErrors(validation.error),
        });
    }

    try{
        const result = await authenticateReporter(validation.data);

        res.cookie(
            reporterCookieName(),
            result.sessionToken,
            {
                ...reporterCookieOptions(),
                maxAge: reporterSessionDurationMs(),
            }
        );

        return res.status(200).json({
            message: 'Acesso autorizado.',
            data:{
                report: result.report,
                sessionExpiresAt: result.expiresAt,
            },
        });
    }
    catch(error){
        if(error && Number.isInteger(error.statusCode)){
            return res.status(error.statusCode).json({message: error.message});
        }

        safeExceptionLog("reporter_access", error);

        return res.status(500).json({message: 'Não foi possível validar o acesso.'});
    }
}

async function getCurrentReportHandler(req, res) {
    try{
        const report = await getReporterReport(req.reporterAuth.reportId);

        return res.status(200).json({
            data:{
                report,
            },
        });
    }
    catch(error){
        if(error.statusCode){
            return res.status(error.statusCode).json({message: error.message});
        }

        safeExceptionLog("reporter_report_query", error);
        
        return res.status(500).json({
            message: 'Não foi possível consultar a denúncia.',
        });
    }
}

async function logoutReporterHandler(req, res) {
    try{
        await revokeReporterSession(req.reporterAuth.sessionId);

        res.clearCookie(
            reporterCookieName(),
            reporterCookieOptions()
        );

        return res.status(200).json({
            message:'Sessão encerrada com sucesso.'
        });
    }
    catch(error){
        safeExceptionLog("reporter_logout", error);

        return res.status(500).json({
            message: 'Não foi possível encerrar a sessão.',
        });
    }
}

module.exports = {accessReportHandler, getCurrentReportHandler, logoutReporterHandler};
