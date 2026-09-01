const { findReporterSession, } = require('./reportAccess.service');
const {
    reporterCookieName,
} = require('../../config/cookies');
const { safeExceptionLog } = require('../../utils/safeLog');

async function requireReporterAuth(req, res, next) {
    try{
        const token = req.cookies?.[reporterCookieName()];

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
        safeExceptionLog("reporter_session_validation", error);

        return res.status(500).json({message:'Não foi possível validar a sessão.'});
    }
}

module.exports = {requireReporterAuth};
