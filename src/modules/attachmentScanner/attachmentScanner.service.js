const {
    randomUUID,
    createHash,
} = require("node:crypto");

const {
    spawn,
} = require(
    "node:child_process"
);

const {
    createWriteStream,
    createReadStream,
} = require("node:fs");

const {
    unlink,
} = require(
    "node:fs/promises"
);

const os =
    require("node:os");

const path =
    require("node:path");

const {
    pipeline,
} = require(
    "node:stream/promises"
);

const prisma =
    require(
        "../../database/prisma"
    );

/*
 * Ajuste somente o nome deste helper
 * caso no seu r2.js ele tenha outro nome.
 *
 * O importante é retornar o resultado
 * do GetObject com Body.
 */
const {
    getObject,
} = require(
    "../../storage/r2"
);

const SCANNER_TIMEOUT =
    Number(
        process.env
            .CLAMAV_TIMEOUT_MS ||
        60000
    );

function getActorType(
    actorUserId
) {
    return actorUserId
        ? "ADMIN"
        : "SYSTEM";
}

function createServiceError(
    message,
    statusCode,
    code = null
) {
    const error =
        new Error(message);

    error.statusCode =
        statusCode;

    error.code =
        code;

    return error;
}

async function sha256File(
    filePath
) {
    return new Promise(
        (
            resolve,
            reject
        ) => {
            const hash =
                createHash(
                    "sha256"
                );

            const stream =
                createReadStream(
                    filePath
                );

            stream.on(
                "data",
                (chunk) =>
                    hash.update(
                        chunk
                    )
            );

            stream.on(
                "error",
                reject
            );

            stream.on(
                "end",
                () => {
                    resolve(
                        hash.digest(
                            "hex"
                        )
                    );
                }
            );
        }
    );
}

function runClamAV(
    filePath
) {
    return new Promise(
        (
            resolve,
            reject
        ) => {
            const command =
                process.env
                    .CLAMAV_COMMAND ||
                "clamdscan";

            const mode =
                process.env
                    .CLAMAV_MODE ||
                "daemon";

            /*
             * clamdscan --stream envia o
             * conteúdo ao daemon.
             *
             * clamscan lê diretamente o
             * arquivo temporário.
             */
            const args =
                mode ===
                "daemon"
                    ? [
                        "--no-summary",
                        "--stream",
                        filePath,
                    ]
                    : [
                        "--no-summary",
                        filePath,
                    ];

            const child =
                spawn(
                    command,
                    args,
                    {
                        shell:
                            false,

                        windowsHide:
                            true,
                    }
                );

            let stdout = "";
            let stderr = "";

            let timedOut =
                false;

            const MAX_OUTPUT =
                8192;

            const timeout =
                setTimeout(
                    () => {
                        timedOut =
                            true;

                        child.kill();
                    },
                    SCANNER_TIMEOUT
                );

            child.stdout.on(
                "data",
                (chunk) => {
                    if (
                        stdout.length <
                        MAX_OUTPUT
                    ) {
                        stdout +=
                            chunk.toString();
                    }
                }
            );

            child.stderr.on(
                "data",
                (chunk) => {
                    if (
                        stderr.length <
                        MAX_OUTPUT
                    ) {
                        stderr +=
                            chunk.toString();
                    }
                }
            );

            child.on(
                "error",
                (error) => {
                    clearTimeout(
                        timeout
                    );

                    reject(
                        createServiceError(
                            "O scanner de malware não está disponível.",
                            500,
                            error.code ===
                            "ENOENT"
                                ? "CLAMAV_NOT_FOUND"
                                : "CLAMAV_PROCESS_ERROR"
                        )
                    );
                }
            );

            child.on(
                "close",
                (code) => {
                    clearTimeout(
                        timeout
                    );

                    if (
                        timedOut
                    ) {
                        return reject(
                            createServiceError(
                                "O scanner excedeu o tempo limite.",
                                500,
                                "CLAMAV_TIMEOUT"
                            )
                        );
                    }

                    /*
                     * ClamAV:
                     *
                     * 0 = limpo
                     * 1 = detecção
                     * 2 = erro
                     */
                    if (
                        code === 0
                    ) {
                        return resolve({
                            result:
                                "CLEAN",
                        });
                    }

                    if (
                        code === 1
                    ) {
                        return resolve({
                            result:
                                "INFECTED",
                        });
                    }

                    return reject(
                        createServiceError(
                            "O scanner não conseguiu analisar o arquivo.",
                            500,
                            "CLAMAV_SCAN_ERROR"
                        )
                    );
                }
            );
        }
    );
}

async function markFailed(
    attachmentId,
    errorCode,
    actorUserId = null
) {
    await prisma.$transaction(
        async (tx) => {
            await tx
                .report_attachments
                .updateMany({
                    where: {
                        id:
                            attachmentId,

                        scan_status:
                            "SCANNING",
                    },

                    data: {
                        scan_status:
                            "FAILED",

                        available_at:
                            null,

                        scan_completed_at:
                            new Date(),
                    },
                });

            await tx.audit_logs.create({
                data: {
                    actor_type:
                        getActorType(
                            actorUserId
                        ),

                    actor_user_id:
                        actorUserId,

                    action:
                        "ATTACHMENT_SCAN_FAILED",

                    entity_type:
                        "REPORT_ATTACHMENT",

                    entity_id:
                        attachmentId,

                    success:
                        false,

                    request_id:
                        randomUUID(),

                    metadata_json:
                        JSON.stringify({
                            errorCode,
                        }),
                },
            });
        }
    );
}

async function markClean(
    attachmentId,
    actorUserId = null
) {
    const now =
        new Date();

    await prisma.$transaction(
        async (tx) => {
            await tx
                .report_attachments
                .update({
                    where: {
                        id:
                            attachmentId,
                    },

                    data: {
                        scan_status:
                            "CLEAN",

                        available_at:
                            now,

                        quarantined_at:
                            null,

                        scan_completed_at:
                            now,
                    },
                });

            await tx.audit_logs.create({
                data: {
                    actor_type:
                        getActorType(
                            actorUserId
                        ),

                    actor_user_id:
                        actorUserId,

                    action:
                        "ATTACHMENT_SCAN_CLEAN",

                    entity_type:
                        "REPORT_ATTACHMENT",

                    entity_id:
                        attachmentId,

                    success:
                        true,

                    request_id:
                        randomUUID(),

                    metadata_json:
                        JSON.stringify({
                            result:
                                "CLEAN",
                        }),
                },
            });
        }
    );
}

async function markInfected(
    attachmentId,
    actorUserId = null
) {
    const now =
        new Date();

    await prisma.$transaction(
        async (tx) => {
            await tx
                .report_attachments
                .update({
                    where: {
                        id:
                            attachmentId,
                    },

                    data: {
                        scan_status:
                            "INFECTED",

                        available_at:
                            null,

                        quarantined_at:
                            now,

                        scan_completed_at:
                            now,
                    },
                });

            await tx.audit_logs.create({
                data: {
                    actor_type:
                        getActorType(
                            actorUserId
                        ),

                    actor_user_id:
                        actorUserId,

                    action:
                        "ATTACHMENT_SCAN_INFECTED",

                    entity_type:
                        "REPORT_ATTACHMENT",

                    entity_id:
                        attachmentId,

                    success:
                        true,

                    request_id:
                        randomUUID(),

                    metadata_json:
                        JSON.stringify({
                            result:
                                "INFECTED",

                            quarantined:
                                true,
                        }),
                },
            });
        }
    );
}

async function scanAttachment(
    attachmentId,
    actorUserId = null
) {
    const current =
        await prisma
            .report_attachments
            .findUnique({
                where: {
                    id:
                        attachmentId,
                },

                select: {
                    id: true,

                    scan_status:
                        true,

                    purged_at:
                        true,
                },
            });

    if (!current) {
        throw createServiceError(
            "Anexo não encontrado.",
            404
        );
    }

    if (
        current.purged_at
    ) {
        return {
            scanned:
                false,

            reason:
                "ATTACHMENT_PURGED",
        };
    }

    if (
        current.scan_status !==
        "PENDING"
    ) {
        return {
            scanned:
                false,

            reason:
                `STATUS_${current.scan_status}`,
        };
    }

    /*
     * Claim atômico.
     *
     * Apenas um worker consegue
     * transformar:
     *
     * PENDING -> SCANNING
     */
    const claimed =
        await prisma
            .report_attachments
            .updateMany({
                where: {
                    id:
                        attachmentId,

                    scan_status:
                        "PENDING",

                    purged_at:
                        null,
                },

                data: {
                    scan_status:
                        "SCANNING",

                    scan_started_at:
                        new Date(),

                    scan_completed_at:
                        null,

                    scan_attempts: {
                        increment:
                            1,
                    },

                    available_at:
                        null,
                },
            });

    if (
        claimed.count !== 1
    ) {
        return {
            scanned:
                false,

            reason:
                "NOT_CLAIMED",
        };
    }

    const attachment =
        await prisma
            .report_attachments
            .findUnique({
                where: {
                    id:
                        attachmentId,
                },

                select: {
                    id: true,

                    storage_key:
                        true,

                    sha256:
                        true,

                    size_bytes:
                        true,
                },
            });

    const temporaryPath =
        path.join(
            os.tmpdir(),
            `nvk-scan-${randomUUID()}.bin`
        );

    try {
        const object =
            await getObject(
                attachment.storage_key
            );

        if (
            !object ||
            !object.Body
        ) {
            throw createServiceError(
                "Arquivo não encontrado no armazenamento.",
                500,
                "R2_OBJECT_MISSING"
            );
        }

        /*
         * Nunca usamos o nome original
         * informado pelo usuário como
         * nome do arquivo temporário.
         */
        await pipeline(
            object.Body,

            createWriteStream(
                temporaryPath,
                {
                    flags:
                        "wx",
                }
            )
        );

        /*
         * Confere integridade do objeto
         * antes de passá-lo ao scanner.
         */
        const calculatedHash =
            await sha256File(
                temporaryPath
            );

        if (
            calculatedHash
                .toLowerCase() !==
            attachment.sha256
                .toLowerCase()
        ) {
            await markFailed(
                attachmentId,
                "HASH_MISMATCH",
                actorUserId
            );

            return {
                scanned:
                    false,

                reason:
                    "HASH_MISMATCH",
            };
        }

        const result =
            await runClamAV(
                temporaryPath
            );

        if (
            result.result ===
            "CLEAN"
        ) {
            await markClean(
                attachmentId,
                actorUserId
            );

            return {
                scanned:
                    true,

                result:
                    "CLEAN",
            };
        }

        if (
            result.result ===
            "INFECTED"
        ) {
            await markInfected(
                attachmentId,
                actorUserId
            );

            return {
                scanned:
                    true,

                result:
                    "INFECTED",
            };
        }

        await markFailed(
            attachmentId,
            "UNKNOWN_SCAN_RESULT",
            actorUserId
        );

        return {
            scanned:
                false,

            reason:
                "UNKNOWN_SCAN_RESULT",
        };
    } catch (error) {
        /*
         * Se já foi tratado como FAILED
         * por HASH_MISMATCH, não chegamos
         * aqui.
         */
        const errorCode =
            error.code ||
            "ATTACHMENT_SCAN_ERROR";

        await markFailed(
            attachmentId,
            errorCode,
            actorUserId
        );

        return {
            scanned:
                false,

            reason:
                errorCode,
        };
    } finally {
        try {
            await unlink(
                temporaryPath
            );
        } catch {
            /*
             * Arquivo pode nem ter sido
             * criado se o R2 falhou.
             */
        }
    }
}

async function retryAttachmentScan(
    attachmentId,
    actorUserId
) {
    const attachment =
        await prisma
            .report_attachments
            .findUnique({
                where: {
                    id:
                        attachmentId,
                },

                select: {
                    id: true,
                    scan_status: true,
                    purged_at: true,
                },
            });

    if (!attachment) {
        throw createServiceError(
            "Anexo não encontrado.",
            404
        );
    }

    if (
        attachment.purged_at
    ) {
        throw createServiceError(
            "O arquivo já foi removido.",
            409
        );
    }

    if (
        attachment.scan_status !==
        "FAILED"
    ) {
        throw createServiceError(
            "Somente verificações com falha podem ser reenviadas.",
            409
        );
    }

    await prisma.$transaction(
        async (tx) => {
            await tx
                .report_attachments
                .update({
                    where: {
                        id:
                            attachmentId,
                    },

                    data: {
                        scan_status:
                            "PENDING",

                        scan_started_at:
                            null,

                        scan_completed_at:
                            null,

                        available_at:
                            null,

                        quarantined_at:
                            null,
                    },
                });

            await tx.audit_logs.create({
                data: {
                    actor_type:
                        "ADMIN",

                    actor_user_id:
                        actorUserId,

                    action:
                        "ATTACHMENT_SCAN_RETRY_REQUESTED",

                    entity_type:
                        "REPORT_ATTACHMENT",

                    entity_id:
                        attachmentId,

                    success:
                        true,

                    request_id:
                        randomUUID(),

                    metadata_json:
                        JSON.stringify({
                            previousStatus:
                                "FAILED",

                            currentStatus:
                                "PENDING",
                        }),
                },
            });
        }
    );

    return {
        status:
            "PENDING",
    };
}

async function recoverStuckScans() {
    const fifteenMinutesAgo =
        new Date(
            Date.now() -
            15 *
            60 *
            1000
        );

    return prisma
        .report_attachments
        .updateMany({
            where: {
                scan_status:
                    "SCANNING",

                scan_started_at: {
                    lt:
                        fifteenMinutesAgo,
                },

                purged_at:
                    null,
            },

            data: {
                scan_status:
                    "FAILED",

                scan_completed_at:
                    new Date(),

                available_at:
                    null,
            },
        });
}

async function runAttachmentScannerBatch({
    limit = 10,
    actorUserId = null,
} = {}) {
    /*
     * Recupera processos que morreram
     * no meio do scan.
     */
    await recoverStuckScans();

    const attachments =
        await prisma
            .report_attachments
            .findMany({
                where: {
                    scan_status:
                        "PENDING",

                    purged_at:
                        null,
                },

                select: {
                    id: true,
                },

                orderBy: {
                    created_at:
                        "asc",
                },

                take:
                    limit,
            });

    const result = {
        processed: 0,
        clean: 0,
        infected: 0,
        failed: 0,
        skipped: 0,
    };

    for (
        const attachment
        of attachments
    ) {
        result.processed++;

        try {
            const response =
                await scanAttachment(
                    attachment.id,
                    actorUserId
                );

            if (
                response.result ===
                "CLEAN"
            ) {
                result.clean++;
            } else if (
                response.result ===
                "INFECTED"
            ) {
                result.infected++;
            } else if (
                response.reason
            ) {
                result.failed++;
            } else {
                result.skipped++;
            }
        } catch {
            result.failed++;
        }
    }

    return result;
}

module.exports = {
    scanAttachment,
    retryAttachmentScan,
    runAttachmentScannerBatch,
    recoverStuckScans,
};