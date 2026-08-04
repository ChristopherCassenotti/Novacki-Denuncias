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
        console.error("Erro ao consultar acesso do usuário:", error.message);

        return res.status(500).json({ message: "Não foi possível consultar os perfis e permissões." });
    }
}

module.exports = {getMyAccess};