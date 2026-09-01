const { safeExceptionLog } = require("../../utils/safeLog");
const { getUserAccessContext } = require('./access.service');

function requirePermissions(...requiredPermissions){
    return async function permissionMiddleware(req, res, next) {
        try{
            if(!req.auth?.userId){
                return res.status(401).json({
                    message: "Autenticação necessária."
                });
            }
            
            const accessContext = await getUserAccessContext(req.auth.userId);

            const grantedPermissions = new Set(accessContext.permissions.map((permission) => permission.code));

            const missingPermissions = requiredPermissions.filter((permissionCode) => !grantedPermissions.has(permissionCode));

            if(missingPermissions.length > 0){
                return res.status(403).json({
                    message: "Você não possui permissão para realizar esta ação",
                });
            }

            req.auth.roles = accessContext.roles;
            req.auth.permissions = accessContext.permissions;

            return next();
        }
        catch(error){
            safeExceptionLog("admin_permission_validation", error);

            return res.status(500).json({message: "Não foi possível verificar as permissões do usuário."});
        };
    }
}

module.exports = { requirePermissions };
