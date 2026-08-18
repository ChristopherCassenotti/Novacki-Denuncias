const prisma = require('../../database/prisma');

function createServiceError(message, statusCode){
    const error = new Error(message);

    error.statusCode = statusCode;

    return error;
}

async function getReporterReport(reportId) {
    const report = await prisma.reports.findUnique({
        where:{
            id: reportId,
        },
        select:{
            id: true,
            protocol: true,
            status: true,
            last_activity_at: true,
            concluded_at: true,
            archived_at: true,
            created_at: true,
        },
    });

    if(!report){
        throw createServiceError('Denúncia não encontrada.', 404);
    }

    return {
        protocol:report.protocol,
        status: report.status,
        createdAt: report.created_at,
        lastActivityAt: report.last_activity_at,
        concludedAt: report.concluded_at,
        archivedAt: report.archived_at,
    };
}

module.exports = {getReporterReport,};
