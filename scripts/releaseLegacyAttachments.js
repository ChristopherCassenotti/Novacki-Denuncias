require("dotenv/config");

const prisma = require("../src/database/prisma");

async function main() {
    const now = new Date();

    const releasableStatuses = [
        "PENDING",
        "SCANNING",
        "FAILED",
    ];

    const before = await prisma.report_attachments.count({
        where: {
            purged_at: null,
            scan_status: {
                in: releasableStatuses,
            },
        },
    });

    if (before === 0) {
        console.log("Nenhum anexo antigo precisa ser liberado.");
        return;
    }

    const result = await prisma.report_attachments.updateMany({
        where: {
            purged_at: null,
            scan_status: {
                in: releasableStatuses,
            },
        },
        data: {
            scan_status: "CLEAN",
            available_at: now,
            quarantined_at: null,
        },
    });

    console.log(`${result.count} anexo(s) antigo(s) liberado(s) para download.`);
    console.log("Arquivos INFECTED ou QUARANTINED não foram alterados.");
}

main()
    .catch((error) => {
        console.error("Não foi possível liberar os anexos antigos.");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
