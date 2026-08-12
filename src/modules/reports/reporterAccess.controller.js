const { accessReportSchema } = require('./reportAccess.schema');
const { authenticateReporter, revokeReporterSession } = require('./reportAccess.service');
const { getReporterReport } = require('./reporterReport.service');
const { REPORTER_COOKIE_NAME } = require('./reporterAuth.middleware');

function formatValidationErrors(error){
    return error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
    }));
}

function getReporterCookieOptions(expiresAt){
    return {
        httpOnly: true,

        secure: process.env.NODE_ENV === 'production',

        sameSite: 'strict',

        expires: expiresAt,

        path: '/api/public/reports',
    };
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

        res.cookie(REPORTER_COOKIE_NAME, result.sessionToken, getReporterCookieOptions(result.expiresAt));

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

        console.error('Erro ao acessar denúncia:', error);

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

        console.error('Erro ao consultar denúncia:', error);
        
        return res.status(500).json({
            message: 'Não foi possível consultar a denúncia.',
        });
    }
}

async function logoutReporterHandler(req, res) {
    try{
        await revokeReporterSession(req.reporterAuth.sessionId);

        res.clearCookie(REPORTER_COOKIE_NAME,
            {
                httpOnly: true,

                secure: process.env.NODE_ENV === 'production',

                sameSite: 'strict',

                path: '/api/public/reports',
            }
        );

        return res.status(200).json({
            message:'Sessão encerrada com sucesso.'
        });
    }
    catch(error){
        console.error('Erro ao encerrar sessão:', error);

        return res.status(500).json({
            message: 'Não foi possível encerrar a sessão.',
        });
    }
}

module.exports = {accessReportHandler, getCurrentReportHandler, logoutReporterHandler};