const prisma = require('../../database/prisma');
const { decryptJson, encryptJson } = require('../../security/crypto.service');
const { randomUUID } = require('node:crypto');

function createServiceError(message, statusCode){
    const error = new Error(message);

    error.statusCode = statusCode;

    return error;
}

function auditMetadata(data){
    return JSON.stringify(data);
}

async function attachReferenceData(reports) {
    if(reports.length === 0){
        return [];
    }

    const categoryIds = [
        ...new Set(reports.map((report) => report.category_id).filter(Boolean)),
    ];

    const unitIds = [
        ...new Set(reports.map((report) => report.unit_id).filter(Boolean)),

    ]

    const userIds = [
        ...new Set(reports.map((report) => report.current_assignee_user_id).filter(Boolean)),
    ];

    const teamIds = [
        ...new Set(
            reports.map((report) => report.current_assignee_team_id).filter(Boolean),
        )
    ];

    const [
        categories,
        units,
        users,
        teams,
    ] = await Promise.all([categoryIds.length ? prisma.report_categories.findMany({
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

async function listAdminReports({page, limit, status, priority, categoryId, unitId, mode, immediateRisk}) {
    const where = {};

    if(status){
        where.status = status;
    }

    if(priority){
        where.priority = priority;
    }
    
    if(categoryId){
        where.categoryId = categoryId;
    }

    if(unitId){
        where.unitId = unitId;
    }

    if(mode){
        where.mode = mode;
    }

    if(immediateRisk !== undefined){
        where.immediate_risk = immediateRisk;
    }

    const skip = (page - 1) * limit;

    const [total, reports,] = await Promise.all([prisma.reports.count({where,}),

        prisma.reports.findMany({
            where,
            skip,
            take: limit,

            select:{
                id: true,
                protocol: true,
                mode: true,
                relationship_type: true,
                unit_id: true,
                category_id: true,
                immediate_risk: true,
                priority: true,
                status: true,
                current_assignee_user_id: true,
                current_assignee_team_id: true,
                last_activity_at: true,
                concluded_at: true,
                archived_at: true,
                created_at: true,
            },

            orderBy: [
                {
                    immediate_risk: 'desc',
                },
                {
                    created_at: 'desc',
                },
            ],
        }),
    ]);

    const reportsWithReferences = await attachReferenceData(reports);

    return {
        reports: reportsWithReferences,

        pagination:{
            page,
            limit,
            total,
            totalPages: 
                total === 0
                    ? 0
                    : Math.ceil(total/limit),
        },
    };
}

async function getAdminReport(reportId) {
    const report = await prisma.reports.findUnique({
        where:{
            id: reportId,
        },

        select:{
            id:true,
            protocol: true,
            mode: true,
            relationship_type: true,
            unit_id: true,
            category_id: true,
            immediate_risk: true,
            priority: true,
            status: true,
            content_ciphertext: true,
            content_iv: true,
            content_auth_tag: true,
            encryption_key_version: true,
            current_assignee_user_id: true,
            current_assignee_team_id: true,
            status_version: true,
            last_activity_at: true,
            concluded_at: true,
            archived_at: true,
            retention_until: true,
            legal_hold: true,
            created_at: true,
            updated_at: true,
        },
    });

    if(!report){
        throw createServiceError('Denúncia não encontrada.', 404);
    }

    const content = 
        decryptJson({
            ciphertext: report.content_ciphertext,
            iv: report.content_iv,
            authTag: report.content_auth_tag,
            keyVersion: report.encryption_key_version,
        },
        'REPORT_CONTENT'
    );

    const [reportWithReferences] = await attachReferenceData([report]);

    return {
        id: report.id,
        protocol: report.protocol,
        mode: report.mode,
        relationship_type: report.relationship_type,
        category: report.category,
        unit: report.unit,
        immediateRisk: report.immediate_risk,
        priority: report.priority,
        status: report.status,
        content,
        assignment: {
            user: reportWithReferences.assigneeUser,
            team: reportWithReferences.assigneeTeam,
        },
        statusVersion: report.status_version,
        lastActivityAt: report.last_activity_at,
        concludedAt: report.concluded_at,
        archivedAt: report.archived_at,
        retentionUntiol: report.retention_until,
        legalHold: report.legal_hold,
        createdAt: report.created_at,
        updatedAt: report.updated_at,
    };
}

async function updateReportStatus(reportId, {status, expectedVersion}, actorUserId) {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
        const current
    })
}

module.exports = { listAdminReports, getAdminReport, };
