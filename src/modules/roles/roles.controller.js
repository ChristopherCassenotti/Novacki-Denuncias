const { listRoles } = require('./roles.service');

async function getRoles(req, res) {
    try{
        const roles = await listRoles();

        return res.status(200).json({
            data:{
                roles,
            },
        });
    }
    catch(error){
        console.error('Error ao listar perfis:', error.message);

        return res.status(500).json({
            message: 'Não foi possível lista os perfis.'
        });
    }
}

module.exports = { getRoles };