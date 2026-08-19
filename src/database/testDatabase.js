const prisma = require("./prisma");
const { safeExceptionLog } = require("../utils/safeLog");

async function main() {
  await prisma.users.count();
  await prisma.reports.count();
  await prisma.report_categories.count();

  console.log("Conexão com o banco validada.");
}

main()
  .catch((error) => {
    safeExceptionLog("database_connection_test", error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
