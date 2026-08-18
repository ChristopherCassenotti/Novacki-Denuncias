const { findReporterSession, } = require('./reportAccess.service');

const REPORTER_COOKIE_NAME = 'nvk_reporter_session';

async function requireReporterAuth(req, res, next) {
    try{
        const token = req.cookies?.[REPORTER_COOKIE_NAME];

        if(!token){
            return res.status(401).json({
                message: 'Autenticação da denúncia necessária.'
            });
        }

        const session = await findReporterSession(token);

        if(!session){
            return res.status(401).json({
                message:'Sessão inválida ou expirada.',
            });
        }

        req.reporterAuth = {
            sessionId: session.id,
            reportId: session.report_id,
        };

        return next();
    }
    catch(error){
        console.error('Erro ao validar sessão do denunciante:', error.message);

        return res.status(500).json({message:'Não foi possível validar a sessão.'});
    }
}

module.exports = {REPORTER_COOKIE_NAME, requireReporterAuth};
