const { listPublicReportCategories, listPublicUnits } = require('./public.service');

async function getReportCategories(req, res) {
    try{
        const categories = await listPublicReportCategories();
        
        return res.status(200).json({
            data:{
                categories,
            },
        });
    }
    catch(error){
        console.error('Não foi possível listar as categorias:', error.message);

        return res.status(500).json({
            message: 'Não foi possível carregar as categorias.',
        });
    }
}

async function getUnits(req, res) {
    try{
        const units = await listPublicUnits();

        return res.status(200).json({
            data:{
                units,
            },
        });
    }
    catch(error){
        console.error('Não foi possível listar as unidades:', error.message);

        return res.status(500).json({
            message: 'Não foi possível carregar as unidades.',
        });
    }
}

module.exports = { getReportCategories, getUnits };