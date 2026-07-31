const { loginSchema } = require('./auth.schema');
const { authenticateAdmin } = require('./auth.service');

async function login(req, res) {
    const validate = loginSchema.safeParse(req.body);

    if(!validate.success) {
        return res.status(400).json({
            message: "Dados de login inválidos.",
            errors: validate.error.issues.map((issues)=>({
                field: issues.path.join("."),
                message: issues.message,
            })),
        });
    };

    try{
        const result = await authenticateAdmin(validate.data);

        if(!result){
            return res.status(401).json({
                message: "E-mail ou senha inválidos.",
            });
        }

        return res.status(200).json({
            message: "Crendenciais validadas com sucesso.",
            data: result,
        });
    }
    catch(error){
        console.log("Erro no login administrativo:", error);

        return res.status(500).json({
            message: "Não foi possível realizar o login."
        });
    }
}

module.exports = {login};