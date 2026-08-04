const { getUserAccessContext } = require('./access.service');

function requirePermissions(...requiredPermissions){
    return async function permissionMiddleware(req, res, next) {
        try{
            if(!req.auth?.userId){
                return res.status(401).json({
                    message: "Autenficação necessária"
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
            console.error("Erro ao verificar permissões:", error.message);

            return res.status(500).json({message: "Não foi possível verificar as permissões do usuário."});
        };
    }
}

module.exports = { requirePermissions };