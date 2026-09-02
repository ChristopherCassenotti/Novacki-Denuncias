const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  executionIdParamSchema,
} = require("../../src/modules/retentionExecutor/retentionExecutor.schema");
const {
  reportIdParamSchema,
} = require("../../src/modules/retentionScheduler/retentionScheduler.schema");

function loadExecutorService({ prisma, deleteObject, schedule }) {
  const servicePath = require.resolve(
    "../../src/modules/retentionExecutor/retentionExecutor.service"
  );
  const prismaPath = require.resolve("../../src/database/prisma");
  const r2Path = require.resolve("../../src/storage/r2");
  const schedulerPath = require.resolve(
    "../../src/modules/retentionScheduler/retentionScheduler.service"
  );
  const executionsPath = require.resolve(
    "../../src/modules/retentionExecutions/retentionExecutions.service"
  );
  const unitScopePath = require.resolve(
    "../../src/modules/access/unitScope.service"
  );

  delete require.cache[servicePath];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prisma,
  };
  require.cache[r2Path] = {
    id: r2Path,
    filename: r2Path,
    loaded: true,
    exports: { deleteObject },
  };
  require.cache[schedulerPath] = {
    id: schedulerPath,
    filename: schedulerPath,
    loaded: true,
    exports: { scheduleRetentionForReport: schedule },
  };
  require.cache[executionsPath] = {
    id: executionsPath,
    filename: executionsPath,
    loaded: true,
    exports: {
      assertRetentionExecutionWithinActorScope: async () => true,
    },
  };
  require.cache[unitScopePath] = {
    id: unitScopePath,
    filename: unitScopePath,
    loaded: true,
    exports: {
      getActorUnitScope: async () => ({
        isAdminMaster: true,
        unitIds: [],
      }),
    },
  };

  return require(servicePath);
}

test("valida os IDs recebidos pelo scheduler e executor", () => {
  const validId = "123e4567-e89b-42d3-a456-426614174000";

  assert.equal(reportIdParamSchema.safeParse({ id: validId }).success, true);
  assert.equal(executionIdParamSchema.safeParse({ id: validId }).success, true);
  assert.equal(reportIdParamSchema.safeParse({ id: "invalido" }).success, false);
  assert.equal(executionIdParamSchema.safeParse({ id: "invalido" }).success, false);
});

test("executa ANONYMIZE e preserva auditoria e estatística agregada", async () => {
  const actorUserId = "223e4567-e89b-42d3-a456-426614174000";
  const executionId = "323e4567-e89b-42d3-a456-426614174000";
  const reportId = "423e4567-e89b-42d3-a456-426614174000";
  const unitId = "623e4567-e89b-42d3-a456-426614174000";
  const auditEntries = [];
  const auditLogUnitEntries = [];
  let findExecutionCalls = 0;
  let statisticsCalls = 0;

  const execution = {
    id: executionId,
    report_id: reportId,
    action: "ANONYMIZE",
    unit_id: unitId,
    status: "PENDING",
    scheduled_at: new Date(Date.now() - 60_000),
  };
  const transaction = {
    reports: {
      findUnique: async () => ({
        id: reportId,
        status: "CONCLUDED",
        legal_hold: false,
        category_id: "523e4567-e89b-42d3-a456-426614174000",
        mode: "ANONYMOUS",
        immediate_risk: false,
        created_at: new Date("2026-01-15T12:00:00.000Z"),
      }),
      deleteMany: async () => ({ count: 1 }),
    },
    report_attachments: {
      findMany: async () => [],
    },
    report_retention_executions: {
      findUnique: async () => ({ unit_id: unitId }),
      updateMany: async () => ({ count: 1 }),
    },
    audit_logs: {
      create: async ({ data }) => {
        auditEntries.push(data);
        return { id: `audit-${auditEntries.length}` };
      },
    },
    audit_log_units: {
      createMany: async ({ data }) => {
        auditLogUnitEntries.push(...data);
        return { count: data.length };
      },
    },
    $executeRaw: async () => {
      statisticsCalls += 1;
      return 1;
    },
  };
  const prisma = {
    report_retention_executions: {
      findUnique: async () => {
        findExecutionCalls += 1;
        return {
          ...execution,
          status: findExecutionCalls >= 3 ? "RUNNING" : "PENDING",
        };
      },
      updateMany: async () => ({ count: 1 }),
    },
    retention_object_purge_queue: {
      updateMany: async () => ({ count: 0 }),
      findMany: async () => [],
      count: async () => 0,
    },
    $transaction: async (callback) => callback(transaction),
  };
  const service = loadExecutorService({
    prisma,
    deleteObject: async () => {},
    schedule: async () => ({
      scheduled: true,
      alreadyScheduled: true,
      executionId,
    }),
  });

  const result = await service.executeRetention(executionId, actorUserId);

  assert.equal(result.executed, true);
  assert.equal(result.action, "ANONYMIZE");
  assert.equal(statisticsCalls, 1);
  assert.equal(auditEntries.length, 2);
  assert.equal(auditEntries[0].action, "REPORT_RETENTION_ANONYMIZED");
  assert.equal(auditEntries[1].actor_type, "ADMIN");
  assert.equal(auditEntries[1].actor_user_id, actorUserId);
  assert.deepEqual(JSON.parse(auditEntries[1].metadata_json), {
    action: "ANONYMIZE",
  });
  assert.equal(auditLogUnitEntries.length, 2);
  assert.deepEqual(
    auditLogUnitEntries.map((entry) => entry.unit_id),
    [unitId, unitId]
  );
});

test("recupera execução RUNNING abandonada antes de buscar o lote", async () => {
  let recoveryUpdate;
  let findManyCalls = 0;
  const prisma = {
    report_retention_executions: {
      updateMany: async (query) => {
        recoveryUpdate = query;
        return { count: 2 };
      },
      findMany: async () => {
        findManyCalls += 1;
        return [];
      },
    },
  };
  const service = loadExecutorService({
    prisma,
    deleteObject: async () => {},
    schedule: async () => ({}),
  });

  const result = await service.runRetentionExecutorBatch();

  assert.equal(result.recoveredExecutions, 2);
  assert.equal(findManyCalls, 2);
  assert.equal(recoveryUpdate.where.status, "RUNNING");
  assert.deepEqual(recoveryUpdate.where.report_id, { not: null });
  assert.equal(recoveryUpdate.data.status, "PENDING");
});
