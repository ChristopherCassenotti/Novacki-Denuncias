const { createPublicReportSchema } = require('./publicReport.schema');
const { createPublicReport } = require('./publicReport.service');

function formatValidationErrors(error){
    return error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
    }));
}

async function createPublicReportHandler(req, res) {
    const validation = createPublicReportSchema.safeParse(req.body);

    if(!validation.success){
        return res.status(400).json({
            message: 'Dados da denúncia inválidos.',
            errors: formatValidationErrors(validation.error),
        });
    }

    try{
        const result = await createPublicReport(validation.data);

        return res.status(201).json({
            message: 'Denúncia registrada com sucesso.',

            data:{
                protocol: result.protocol,
                accessSecret: result.accessSecret,
                createdAt: result.createdAt,
            },

            warning: 'Guarde o protocolo e a chave secreta. A chave não poderá ser recuperada posteriormente.',
        });
    }
    catch(error){
        if(Number.isInteger(error.statusCode)){
            return res.status(error.statusCode).json({
                message: error.message,
            });
        }
        
        console.error('Erro ao registrar denúncia:',{ 
            name: error.message,
            code: error.code,
            message: error.message,
        });

        return res.status(500).json({
            message: 'Não foi possível registrar a denúncia.',
        });
    }
}

module.exports = { createPublicReportHandler };
