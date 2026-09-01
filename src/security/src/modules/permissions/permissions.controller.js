const { safeExceptionLog } = require("../../utils/safeLog");
const { listPermissions } = require('./permissions.service');

async function getPermissions(req, res) {
    try{
        const permission = await listPermissions();

        return res.status(200).json({
            data:{
                permission,
            },
        });
    }
    catch(error){
        safeExceptionLog("admin_permission_list", error);

        return res.status(500).json({
            message: 'Não foi possível listar as permissões.',
        });
    }
}

module.exports = {getPermissions};
