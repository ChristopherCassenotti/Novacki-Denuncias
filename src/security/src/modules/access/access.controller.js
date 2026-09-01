const { safeExceptionLog } = require("../../utils/safeLog");
const { getUserAccessContext } = require('./access.service');

async function getMyAccess(req, res){
    try{
        const accessContext = await getUserAccessContext(req.auth.userId);

        return res.status(200).json({
            data:{
                user: req.auth.user,
                roles: accessContext.roles,
                permissions: accessContext.permissions,
            },
        });
    }
    catch(error){
        safeExceptionLog("admin_access_context", error);

        return res.status(500).json({ message: "Não foi possível consultar os perfis e permissões." });
    }
}

module.exports = {getMyAccess};
