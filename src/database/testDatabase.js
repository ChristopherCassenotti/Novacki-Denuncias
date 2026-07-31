const prisma = require("./prisma");

async function main() {
  const usersCount = await prisma.users.count();
  const reportsCount = await prisma.reports.count();
  const categoriesCount =
    await prisma.report_categories.count();

  console.log("✅ Conexão com o banco realizada.");
  console.log(`Usuários: ${usersCount}`);
  console.log(`Denúncias: ${reportsCount}`);
  console.log(`Categorias: ${categoriesCount}`);
}

main()
  .catch((error) => {
    console.error("❌ Erro ao testar o banco:");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });