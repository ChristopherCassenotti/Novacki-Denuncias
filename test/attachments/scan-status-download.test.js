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

function loadAttachmentService(servicePath, prisma, onGetObject) {
  const resolvedService = require.resolve(servicePath);
  delete require.cache[resolvedService];

  mockModule("../../src/database/prisma", prisma);
  mockModule("../../src/security/crypto.service", {
    encryptJson: () => {
      throw new Error("criptografia não deveria ser chamada");
    },
    decryptJson: () => {
      throw new Error("descriptografia não deveria ser chamada");
    },
  });
  mockModule("../../src/storage/r2", {
    uploadObject: async () => {},
    deleteObject: async () => {},
    getObject: async () => {
      onGetObject();
      return {};
    },
  });

  return require(resolvedService);
}

const blockedStatuses = [
  ["PENDING", 409],
  ["SCANNING", 409],
  ["FAILED", 409],
  ["INFECTED", 423],
  ["QUARANTINED", 423],
];

test("download administrativo bloqueia SCANNING e mantém os demais estados", async () => {
  let scanStatus = "SCANNING";
  let getObjectCalls = 0;
  const prisma = {
    reports: {
      findUnique: async () => ({ id: "report-id", status: "RECEIVED" }),
    },
    report_attachments: {
      findFirst: async () => ({
        id: "attachment-id",
        scan_status: scanStatus,
      }),
    },
  };
  const service = loadAttachmentService(
    "../../src/modules/adminReportAttachments/adminReportAttachments.service",
    prisma,
    () => {
      getObjectCalls += 1;
    }
  );

  for (const [status, expectedStatusCode] of blockedStatuses) {
    scanStatus = status;

    await assert.rejects(
      () => service.prepareAttachmentDownload(
        "report-id",
        "attachment-id",
        "actor-id"
      ),
      (error) => error.statusCode === expectedStatusCode,
      `status não bloqueado corretamente: ${status}`
    );
  }

  assert.equal(getObjectCalls, 0);
});

test("download público bloqueia SCANNING e mantém os demais estados", async () => {
  let scanStatus = "SCANNING";
  let getObjectCalls = 0;
  const prisma = {
    reports: {
      findUnique: async () => ({ id: "report-id", status: "RECEIVED" }),
    },
    report_attachments: {
      findFirst: async () => ({
        id: "attachment-id",
        scan_status: scanStatus,
        visibility: "REPORTER_AND_ADMIN",
      }),
    },
  };
  const service = loadAttachmentService(
    "../../src/modules/publicReportAttachments/publicReportAttachments.service",
    prisma,
    () => {
      getObjectCalls += 1;
    }
  );

  for (const [status, expectedStatusCode] of blockedStatuses) {
    scanStatus = status;

    await assert.rejects(
      () => service.prepareReporterAttachmentDownload(
        "report-id",
        "attachment-id"
      ),
      (error) => error.statusCode === expectedStatusCode,
      `status não bloqueado corretamente: ${status}`
    );
  }

  assert.equal(getObjectCalls, 0);
});
