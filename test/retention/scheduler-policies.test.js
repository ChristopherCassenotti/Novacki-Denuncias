const assert = require("node:assert/strict");
const { test } = require("node:test");

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

test("scheduler percorre todas as páginas de denúncias elegíveis", async () => {
  const servicePath = require.resolve(
    "../../src/modules/retentionScheduler/retentionScheduler.service"
  );
  const pageQueries = [];
  const pages = {
    start: [{ id: "report-a" }, { id: "report-b" }],
    "report-b": [{ id: "report-c" }],
    "report-c": [],
  };
  const prisma = {
    reports: {
      findMany: async (query) => {
        pageQueries.push(query);
        const cursor = query.cursor?.id || "start";
        return pages[cursor];
      },
      findUnique: async ({ where }) => ({
        id: where.id,
        category_id: "category-id",
        status: "CONCLUDED",
        concluded_at: new Date("2026-01-01T00:00:00.000Z"),
        archived_at: null,
        retention_until: null,
        legal_hold: false,
      }),
    },
    retention_policies: {
      findFirst: async () => null,
    },
    report_retention_executions: {
      findMany: async () => [],
    },
  };

  delete require.cache[servicePath];
  mockModule("../../src/database/prisma", prisma);
  mockModule("../../src/security/crypto.service", {
    encryptJson: () => {
      throw new Error("não deveria criptografar sem política");
    },
  });
  mockModule("../../src/modules/access/unitScope.service", {
    getActorUnitScope: async () => ({
      isAdminMaster: true,
      unitIds: [],
    }),
    assertUnitIdsWithinActorScope: async () => true,
  });
  const service = require(servicePath);

  const result = await service.scheduleRetentionBatch({ limit: 2 });

  assert.equal(result.processed, 3);
  assert.equal(result.skipped, 3);
  assert.equal(result.failed, 0);
  assert.equal(pageQueries.length, 3);
  assert.equal(pageQueries[0].take, 2);
  assert.equal(pageQueries[0].where.unit_id, undefined);
  assert.equal(pageQueries[1].cursor.id, "report-b");
  assert.equal(pageQueries[2].cursor.id, "report-c");
});

test("scheduler respeita o escopo regional do ator", async () => {
  const servicePath = require.resolve(
    "../../src/modules/retentionScheduler/retentionScheduler.service"
  );
  const pageQueries = [];
  const prisma = {
    reports: {
      findMany: async (query) => {
        pageQueries.push(query);
        return [];
      },
    },
  };

  delete require.cache[servicePath];
  mockModule("../../src/database/prisma", prisma);
  mockModule("../../src/security/crypto.service", {
    encryptJson: () => null,
  });
  mockModule("../../src/modules/access/unitScope.service", {
    getActorUnitScope: async (actorUserId) => {
      if (actorUserId === "master-user") {
        return {
          isAdminMaster: true,
          unitIds: [],
        };
      }

      return {
        isAdminMaster: false,
        unitIds:
          actorUserId === "regional-user"
            ? ["unit-a", "unit-b"]
            : [],
      };
    },
  });
  const service = require(servicePath);

  await service.scheduleRetentionBatch({
    actorUserId: "master-user",
  });
  await service.scheduleRetentionBatch({
    actorUserId: "regional-user",
  });
  const emptyScopeResult =
    await service.scheduleRetentionBatch({
      actorUserId: "regional-without-units",
    });

  assert.equal(pageQueries.length, 2);
  assert.equal(pageQueries[0].where.unit_id, undefined);
  assert.deepEqual(
    pageQueries[1].where.unit_id,
    {
      in: ["unit-a", "unit-b"],
    }
  );
  assert.equal(emptyScopeResult.processed, 0);
  assert.equal(emptyScopeResult.scheduled, 0);
  assert.equal(emptyScopeResult.skipped, 0);
  assert.equal(emptyScopeResult.failed, 0);
});

test("política verifica conflito dentro de transação serializável", async () => {
  const servicePath = require.resolve(
    "../../src/modules/retentionPolicies/retentionPolicies.service"
  );
  let conflictChecks = 0;
  let creates = 0;
  let transactionOptions;
  const transaction = {
    retention_policies: {
      findMany: async () => {
        conflictChecks += 1;
        return [
          { id: "concurrent-policy", name: "Concorrente" },
        ];
      },
      create: async () => {
        creates += 1;
      },
    },
    retention_policy_units: {
      findMany: async () => [],
    },
  };
  const prisma = {
    retention_policies: transaction.retention_policies,
    $transaction: async (callback, options) => {
      transactionOptions = options;
      return callback(transaction);
    },
  };

  delete require.cache[servicePath];
  mockModule("../../src/database/prisma", prisma);
  mockModule("../../src/modules/access/unitScope.service", {
    getActorUnitScope: async () => ({
      isAdminMaster: true,
      unitIds: [],
    }),
    assertUnitIdsWithinActorScope: async () => true,
  });
  const service = require(servicePath);

  await assert.rejects(
    () => service.createRetentionPolicy(
      {
        name: "Política concorrente",
        categoryId: null,
        appliesToStatus: "CONCLUDED",
        retentionDays: 365,
        action: "DELETE",
        isActive: true,
      },
      "123e4567-e89b-42d3-a456-426614174000"
    ),
    (error) => error.statusCode === 409
  );

  assert.equal(conflictChecks, 1);
  assert.equal(creates, 0);
  assert.equal(transactionOptions.isolationLevel, "Serializable");
});
