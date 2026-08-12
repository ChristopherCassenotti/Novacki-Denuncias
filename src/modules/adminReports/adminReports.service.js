const prisma = require('../../database/prisma');
const { descryptJson } = require('../../security/crypto.service');

function createServiceError(message, statusCode){
    const error = new Error(message);

    error.statusCode = statusCode;

    return error;
}

async function attachReferenceData(reports) {
    if(reports.length === 0){
        return [];
    }

    const categoryIds = [
        ...new Set(reports.map((report) => report.category_id).filter(Boolean)),
    ];

    const unitIds = [
        ...new Set(
            reports.map((report) => report.unit_id.filter(Boolean))
        ),
    ]

    const userIds = [
        ...new Set(reports.map((report) => report.current_assignee_user_id).filter(Boolean)),
    ];

    const teamIds = [
        ...new Set(
            reports.map((report) => report.current_assignee_team_id.filter(Boolean))
        )
    ];
    const [
        categories,
        units,
        users,
        teams,
    ] = await Promise.all([categoryIds.length ? prisma.report_categorias.findMany({
            where:{
                id: { in: categoryIds },
            },
            select:{
                id: true,
                code: true,
                name: true,
            },
        }) : [],

        unitIds.length
            ? prisma.units.findMany({
                where:{
                    id:{
                        in: unitIds,
                    },
                },
                select:{
                    id: true,
                    code: true,
                    name: true,
                    type: true,
                }
            }) : [],

        
        userIds.length
            ? prisma.users.findMany({
                where: {
                    id: {
                        in: userIds,
                    },
                },

                select:{
                    id: true,
                    name: true,
                    email: true,
                }
            }) : [],

        teamIds.length
            ? prisma.teams.findMany({
                where:{
                    id:{
                        in: teamIds,
                    }
                },
                select:{
                    id: true,
                    name: true,
                },
            }) : [],
    ]);

    const categoryMap = new Map(categories.map((category) => [category.id, category]));

    const unitMap = new Map(units.map((unit) => [unit.id, unit]));

    const userMap = new Map(users.map((user) => [user.id, user]));

    const teamMap = new Map(teams.map((team) => [team.id, team]));

    return reports.map((report) => ({
        ...report,

        category:
            categoryMap.get(report.category_id) || null,

        unit: report.unit_id ? unitMap.get(report.unit_id) || null : null,

        assigneeUser:
            report.current_assignee_user_id
                ? userMap.get(
                    report.current_assignee_user_id
                ) || null : null,

        assigneeTeam:
                report.current_assignee_team_id
                    ? teamMap.get(
                        report.current_assignee_team_id
                    ) || null : null,
        
        })
    );
}