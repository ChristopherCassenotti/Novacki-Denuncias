const app = require('./app');
require('dotenv').config();

const prisma = require('./database/prisma');

const port = Number(process.env.PORT || 3000);

const startServer = async () => {
  try {
    await prisma.$connect();

    app.listen(port, () => {
      console.log(`Servidor rodando em http://localhost:${port}`);
      console.log("Banco de dados conectado.");
    });
  } catch (error) {
    console.error("Erro ao iniciar o servidor:", error);
    process.exit(1);
  }
};

startServer();