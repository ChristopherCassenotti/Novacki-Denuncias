const prisma = require("./prisma");

async function main() {
  const connection = await prisma.$queryRaw`
    SELECT
      DATABASE() AS database_name,
      @@character_set_database AS database_charset,
      @@collation_database AS database_collation,
      @@character_set_connection AS connection_charset,
      @@collation_connection AS connection_collation
  `;

  const columns = await prisma.$queryRaw`
    SELECT
      COLUMN_NAME,
      COLUMN_TYPE,
      CHARACTER_SET_NAME,
      COLLATION_NAME
    FROM information_schema.COLUMNS
    WHERE
      TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME IN ('name', 'email')
  `;

  console.log("CONEXÃO:");
  console.table(connection);

  console.log("COLUNAS:");
  console.table(columns);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });