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
        console.error('Erro ao listar permissões:', error.message);

        return res.status(500).json({
            message: 'Não foi possível listar as permissões.',
        });
    }
}

module.exports = {getPermissions};