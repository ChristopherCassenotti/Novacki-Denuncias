const { safeExceptionLog } = require("../../utils/safeLog");
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
        safeExceptionLog("public_report_category_list", error);

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
        safeExceptionLog("public_unit_list", error);

        return res.status(500).json({
            message: 'Não foi possível carregar as unidades.',
        });
    }
}

module.exports = { getReportCategories, getUnits };
