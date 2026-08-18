const prisma = require('../../database/prisma');
const { decryptJson, encryptJson } = require('../../security/crypto.service');
const { randomUUID } = require('node:crypto');
const { getReportListAccess } = require('../access/reportCapability.service');
const {scheduleRetentionForReport,cancelPendingRetentionForReport,} = require("../retentionScheduler/retentionScheduler.service");

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

async function listAdminReports(
    {
        page,
        limit,
        status,
        priority,
        categoryId,
        unitId,
        mode,
        immediateRisk,
    },
    actorUserId
) {
    const where = {};

    if (status) {
        where.status = status;
    }

    if (priority) {
        where.priority = priority;
    }

    if (categoryId) {
        where.category_id = categoryId;
    }

    if (unitId) {
        where.unit_id = unitId;
    }

    if (mode) {
        where.mode = mode;
    }

    if (immediateRisk !== undefined) {
        where.immediate_risk = immediateRisk;
    }

    const access =
        await getReportListAccess(
            actorUserId
        );

    if (access.global) {
        if (
            access.restrictedReportIds.length > 0
        ) {
            where.id = {
                notIn:
                    access.restrictedReportIds,
            };
        }
    } else {
        where.id = {
            in:
                access.grantedReportIds,
        };
    }

    const skip =
        (page - 1) * limit;

    const [
        total,
        reports,
    ] = await Promise.all([
        prisma.reports.count({
            where,
        }),

        prisma.reports.findMany({
            where,

            skip,

            take:
                limit,

            select: {
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
                    immediate_risk:
                        "desc",
                },
                {
                    created_at:
                        "desc",
                },
            ],
        }),
    ]);

    const reportsWithReferences =
        await attachReferenceData(
            reports
        );

    return {
        reports:
            reportsWithReferences,

        pagination: {
            page,
            limit,
            total,

            totalPages:
                total === 0
                    ? 0
                    : Math.ceil(
                        total / limit
                    ),
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
        relationshipType: report.relationship_type,
        category: reportWithReferences.category,
        unit: reportWithReferences.unit,
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
        retentionUntil: report.retention_until,
        legalHold: report.legal_hold,
        createdAt: report.created_at,
        updatedAt: report.updated_at,
    };
}

async function updateReportStatus(reportId, {status, expectedVersion}, actorUserId) {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
        const current = await tx.reports.findUnique({
            where:{
                id: reportId,
            },

            select:{
                id: true,
                status: true,
                status_version: true,
                concluded_at: true,
                archived_at: true,
            },
        });

        if(!current){
            throw createServiceError('Denúncia não encontrada.', 404);
        }

        if(current.status_version !== expectedVersion){
            throw createServiceError('A denúncia foi alterada por outro usuário. Atualize os dados e tente novamente.', 409);
        }

        if(current.status === status){
            throw createServiceError('A denúncia já está com este status.', 409);
        }
        
        if(current.status === 'ARCHIVED' && status !== 'ARCHIVED'){
            throw createServiceError('Uma denúncia arquivada não pode ter os status alterado.', 409);
        }

        const updateData = {
            status,

            status_version:{
                increment: 1,
            },

            last_activity_at: now,
        };

        if(status === 'CONCLUDED'){
            updateData.concluded_at = now;
        }

        if(current.status === 'CONCLUDED' && status !== 'CONCLUDED'){
            updateData.concluded_at = null;
        }

        if(status === 'ARCHIVED'){
            updateData.archived_at = now;
        }

        const result = await tx.reports.updateMany({
            where:{
                id: reportId,
            
                status_version: expectedVersion,
            },

            data: updateData,
        });

        if(result.count !== 1){
            throw createServiceError('A denúncia foi alterada por outro usuário. Atualize os dados e tente novamente', 409);
        }

        let eventType = 'STATUS_CHANGED';

        if(status === 'CONCLUDED'){
            eventType = 'REPORT_CONCLUDED';
        }

        if(status === 'ARCHIVED'){
            eventType = 'REPORT_ARCHIVED';
        }

        await tx.report_events.create({
            data:{
                id: randomUUID(),
                report_id: reportId,
                event_type: eventType,
                actor_type: 'ADMIN',
                actor_user_id: actorUserId,
                previous_status: current.status,
                new_status: status,
            },
        });

        await tx.audit_logs.create({
            data:{
                actor_type: 'ADMIN',
                actor_user_id: actorUserId,
                action: 'REPORT_STATUS_CHANGED',
                entity_type: 'REPORT',
                entity_id: reportId,
                success: true,
                request_id: randomUUID(),
                metadata_json: auditMetadata({
                    previousStatus: current.status,
                    newStatus: status,
                }),
            },
        });
    });
    try {
        if (
            [
                "CONCLUDED",
                "ARCHIVED",
            ].includes(status)
        ) {
            await scheduleRetentionForReport(
                reportId
            );
        } else {
            await cancelPendingRetentionForReport(
                reportId,
                actorUserId,
                "REPORT_STATUS_NOT_ELIGIBLE"
            );
        }
    } catch (error) {
        console.error(
            "Falha ao atualizar a retenção após mudança de status:",
            error
        );
    }
    return getAdminReport(reportId);
}

async function updateReportPriority(reportId, {priority}, actorUserId) {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
        const current = await tx.reports.findUnique({
            where:{
                id: reportId,
            },

            select:{
                id: true,
                priority: true,
                status: true,
            },
        });

        if(!current){
            throw createServiceError('Denúncia não encontrada.', 404);
        }

        if(current.status === 'ARCHIVED'){
            throw createServiceError('Uma denúncia arquivada não pode ter a prioridade alterada.', 409);
        }

        if(current.priority === priority){
            throw createServiceError('A denúncia já possui esta prioridade.', 409);
        }

        const metadata = encryptJson({
            previousPriority: current.priority,
            newPriority: priority,
        },
        'REPORT_EVENT_METADATA'
        );
    
        await tx.reports.update({
            where:{
                id: reportId,
            },

            data:{
                priority,

                last_activity_at: now,
            },
        });

        await tx.report_events.create({
            data:{
                id: randomUUID(),
                report_id: reportId,
                event_type: 'PRIORITY_CHANGED',
                actor_type: 'ADMIN',
                actor_user_id: actorUserId,
                metadata_ciphertext: metadata.ciphertext,
                metadata_iv: metadata.iv,
                metadata_auth_tag: metadata.authTag,
                metadata_key_version: metadata.keyVersion,
            },
        });

        await tx.audit_logs.create({
            data:{
                actor_type: 'ADMIN',
                actor_user_id: actorUserId,
                action: 'REPORT_PRIORITY_CHANGED',
                entity_type: 'REPORT',
                entity_id: reportId,
                success: true,
                request_id: randomUUID(),
                metadata_json: auditMetadata({
                    previousPriority: current.priority,
                    newPriority: priority,
                }),
            },
        });
    });

    return getAdminReport(reportId);
}

async function assignReport(
  reportId,
  {
    targetType,
    targetId,
    reason,
  },
  actorUserId
) {
  const now = new Date();

  await prisma.$transaction(
    async (tx) => {
      const report =
        await tx.reports.findUnique({
          where: {
            id: reportId,
          },

          select: {
            id: true,
            status: true,

            current_assignee_user_id:
              true,

            current_assignee_team_id:
              true,
          },
        });

      if (!report) {
        throw createServiceError(
          "Denúncia não encontrada.",
          404
        );
      }

      if (
        report.status ===
        "ARCHIVED"
      ) {
        throw createServiceError(
          "Uma denúncia arquivada não pode ser atribuída.",
          409
        );
      }

      /*
       * Valida usuário quando o destino
       * da atribuição for USER.
       */
      if (
        targetType === "USER"
      ) {
        const user =
          await tx.users.findUnique({
            where: {
              id: targetId,
            },

            select: {
              id: true,
              is_active: true,
            },
          });

        if (
          !user ||
          !user.is_active
        ) {
          throw createServiceError(
            "Usuário responsável inválido ou inativo.",
            400
          );
        }
      }

      /*
       * Valida equipe quando o destino
       * da atribuição for TEAM.
       *
       * IMPORTANTE:
       * Este if fica fora do if USER.
       */
      if (
        targetType === "TEAM"
      ) {
        const team =
          await tx.teams.findUnique({
            where: {
              id: targetId,
            },

            select: {
              id: true,
              is_active: true,
            },
          });

        if (
          !team ||
          !team.is_active
        ) {
          throw createServiceError(
            "Equipe responsável inválida ou inativa.",
            400
          );
        }
      }

      /*
       * Criptografa o motivo da atribuição,
       * caso tenha sido informado.
       */
      const normalizedReason =
        reason?.trim() || null;

      let encryptedReason =
        null;

      if (normalizedReason) {
        encryptedReason =
          encryptJson(
            {
              reason:
                normalizedReason,
            },
            "REPORT_ASSIGNMENT_REASON"
          );
      }

      /*
       * Encerra atribuição atual.
       */
      await tx.report_assignments.updateMany({
        where: {
          report_id:
            reportId,

          ended_at:
            null,
        },

        data: {
          ended_at:
            now,
        },
      });

      /*
       * Registra a nova atribuição
       * no histórico.
       */
      await tx.report_assignments.create({
        data: {
          id:
            randomUUID(),

          report_id:
            reportId,

          assigned_user_id:
            targetType === "USER"
              ? targetId
              : null,

          assigned_team_id:
            targetType === "TEAM"
              ? targetId
              : null,

          assigned_by_user_id:
            actorUserId,

          type:
            targetType === "USER"
              ? "PRIMARY"
              : "TEAM",

          reason_ciphertext:
            encryptedReason
              ?.ciphertext ?? null,

          reason_iv:
            encryptedReason
              ?.iv ?? null,

          reason_auth_tag:
            encryptedReason
              ?.authTag ?? null,

          reason_key_version:
            encryptedReason
              ?.keyVersion ?? null,

          started_at:
            now,
        },
      });

      /*
       * Atualiza o responsável atual
       * na denúncia.
       */
      await tx.reports.update({
        where: {
          id: reportId,
        },

        data: {
          current_assignee_user_id:
            targetType === "USER"
              ? targetId
              : null,

          current_assignee_team_id:
            targetType === "TEAM"
              ? targetId
              : null,

          last_activity_at:
            now,
        },
      });

      /*
       * Evento histórico da denúncia.
       */
      const metadata =
        encryptJson(
          {
            targetType,
            targetId,
          },
          "REPORT_EVENT_METADATA"
        );

      await tx.report_events.create({
        data: {
          id:
            randomUUID(),

          report_id:
            reportId,

          event_type:
            "ASSIGNED",

          actor_type:
            "ADMIN",

          actor_user_id:
            actorUserId,

          metadata_ciphertext:
            metadata.ciphertext,

          metadata_iv:
            metadata.iv,

          metadata_auth_tag:
            metadata.authTag,

          metadata_key_version:
            metadata.keyVersion,
        },
      });

      /*
       * Auditoria administrativa.
       */
      await tx.audit_logs.create({
        data: {
          actor_type:
            "ADMIN",

          actor_user_id:
            actorUserId,

          action:
            "REPORT_ASSIGNED",

          entity_type:
            "REPORT",

          entity_id:
            reportId,

          success:
            true,

          request_id:
            randomUUID(),

          metadata_json:
            auditMetadata({
              targetType,
              targetId,
            }),
        },
      });
    }
  );

  return getAdminReport(
    reportId
  );
}

async function unassignReport(reportId, actorUserId) {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
        const report = await tx.reports.findUnique({
            where:{
                id: reportId,
            },

            select:{
                id: true,
                status: true,
                current_assignee_user_id: true,
                current_assignee_team_id: true,
            },
        });

        if(!report){
            throw createServiceError('Denúncia não encontrada.', 404);
        }

        if(!report.current_assignee_user_id && !report.current_assignee_team_id){
            throw createServiceError('A denúncia não possui responsável atribuído.', 409);
        }

        await tx.report_assignments.updateMany({
            where:{
                report_id: reportId,
                ended_at: null,
            },
            data:{
                ended_at: now,
            },
        });

        await tx.reports.update({
            where:{
                id: reportId,
            },

            data:{
                current_assignee_user_id: null,
                current_assignee_team_id: null,
                last_activity_at: now,
            },
        });

        await tx.report_events.create({
            data:{
                id: randomUUID(),
                report_id: reportId,
                event_type: 'UNASSIGNED',
                actor_type: 'ADMIN',
                actor_user_id: actorUserId,
            },
        });

        await tx.audit_logs.create({
            data:{
                actor_type: 'ADMIN',
                actor_user_id: actorUserId,
                action: 'REPORT_UNASSIGNED',
                entity_type: 'REPORT',
                entity_id: reportId,
                success: true,
                request_id: randomUUID(),
                metadata_json: null,
            },
        });
    });
    
    return getAdminReport(reportId);
}

module.exports = { listAdminReports, getAdminReport, updateReportStatus, updateReportPriority, assignReport, unassignReport };
