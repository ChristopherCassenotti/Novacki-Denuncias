const prisma = require('../../database/prisma');

async function listPublicReportCategories() {
    const categories = await prisma.report_categories.findMany({
        where:{
            is_active:true,
        },
        select:{
            id:true,
            code: true,
            name: true, 
            description: true,
            default_priority: true,
        },
        orderBy:{
            name: 'asc',
        },
    });

    return categories;
}

async function listPublicUnits() {
    const units =
        await prisma.units.findMany({
            where:{
                is_active: true,
                type: "UNIT",
            },

            select:{
                id: true,
                parent_id: true,
                code: true,
                name: true,
                type: true
            },

            orderBy: [
                {
                    type: 'asc',
                },
                {
                    name: 'asc',
                },
            ],
        });

        return units
}

module.exports = { listPublicReportCategories, listPublicUnits, };