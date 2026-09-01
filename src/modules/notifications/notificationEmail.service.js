const {
    randomUUID,
} = require(
    "node:crypto"
);

const nodemailer =
    require(
        "nodemailer"
    );

const prisma =
    require(
        "../../database/prisma"
    );

const {
    safeErrorLog,
} = require(
    "../../utils/safeLog"
);

let transporter =
    null;

function notificationsEnabled() {
    return (
        process.env
            .EMAIL_NOTIFICATIONS_ENABLED ===
        "true"
    );
}

function getTransporter() {
    if (transporter) {
        return transporter;
    }

    const secure =
        process.env
            .SMTP_SECURE ===
        "true";

    transporter =
        nodemailer.createTransport({
            host:
                process.env
                    .SMTP_HOST,

            port:
                Number(
                    process.env
                        .SMTP_PORT
                ),

            secure,

            auth: {
                user:
                    process.env
                        .SMTP_USER,

                pass:
                    process.env
                        .SMTP_PASS,
            },

            /*
             * 587 usa STARTTLS.
             * Não permitimos downgrade
             * para conexão sem TLS.
             */
            requireTLS:
                !secure,

            tls: {
                rejectUnauthorized:
                    true,
            },

            connectionTimeout:
                10000,

            greetingTimeout:
                10000,

            socketTimeout:
                15000,
        });

    return transporter;
}

function escapeHtml(
    value
) {
    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}

async function getNotificationContext(
    reportId
) {
    return prisma
        .reports
        .findUnique({
            where: {
                id:
                    reportId,
            },

            select: {
                id:
                    true,

                protocol:
                    true,

                units: {
                    select: {
                        name:
                            true,

                        notification_email:
                            true,
                    },
                },
            },
        });
}

async function recordAudit({
    reportId,
    notificationType,
    success,
    reason = null,
}) {
    try {
        await prisma
            .audit_logs
            .create({
                data: {
                    actor_type:
                        "SYSTEM",

                    actor_user_id:
                        null,

                    action:
                        success
                            ? "EMAIL_NOTIFICATION_SENT"
                            : "EMAIL_NOTIFICATION_FAILED",

                    entity_type:
                        "REPORT",

                    entity_id:
                        reportId,

                    success,

                    request_id:
                        randomUUID(),

                    metadata_json:
                        JSON.stringify({
                            notificationType,
                            reason,
                        }),
                },
            });
    } catch (error) {
        safeErrorLog({
            level:
                "error",

            context:
                "email_notification_audit_failed",

            errorCode:
                error?.code ||
                null,
        });
    }
}

async function sendNotification(
    reportId,
    notificationType
) {
    if (
        !notificationsEnabled()
    ) {
        return {
            sent:
                false,

            reason:
                "DISABLED",
        };
    }

    const report =
        await getNotificationContext(
            reportId
        );

    if (!report) {
        return {
            sent:
                false,

            reason:
                "REPORT_NOT_FOUND",
        };
    }

    const unit =
        report.units;

    if (
        !unit ||
        !unit.notification_email
    ) {
        await recordAudit({
            reportId,
            notificationType,
            success:
                false,
            reason:
                "NO_RECIPIENT",
        });

        return {
            sent:
                false,

            reason:
                "NO_RECIPIENT",
        };
    }

    const isNewReport =
        notificationType ===
        "NEW_REPORT";

    const subject =
        isNewReport
            ? `Nova manifestação no Canal de Ética, protocolo ${report.protocol}`
            : `Nova mensagem no Canal de Ética, protocolo ${report.protocol}`;

    const intro =
        isNewReport
            ? "Uma nova manifestação foi registrada no Canal de Ética."
            : "O denunciante enviou uma nova mensagem no Canal de Ética.";

    const panelUrl =
        process.env
            .ADMIN_PANEL_URL;

    const text = [
        intro,
        "",
        `Protocolo: ${report.protocol}`,
        `Unidade: ${unit.name}`,
        "",
        `Acesse o painel administrativo: ${panelUrl}`,
    ].join("\n");

    const html = `
        <p>${escapeHtml(intro)}</p>

        <p>
            <strong>Protocolo:</strong>
            ${escapeHtml(report.protocol)}
        </p>

        <p>
            <strong>Unidade:</strong>
            ${escapeHtml(unit.name)}
        </p>

        <p>
            <a href="${escapeHtml(panelUrl)}">
                Acessar o painel administrativo
            </a>
        </p>
    `;

    await getTransporter()
        .sendMail({
            from:
                process.env
                    .SMTP_FROM,

            to:
                unit
                    .notification_email,

            subject,

            text,

            html,

            /*
             * O Nodemailer não poderá
             * buscar conteúdo em arquivo
             * local ou URL externa.
             */
            disableFileAccess:
                true,

            disableUrlAccess:
                true,
        });

    await recordAudit({
        reportId,
        notificationType,
        success:
            true,
    });

    return {
        sent:
            true,
    };
}

async function notifySafely(
    reportId,
    notificationType
) {
    try {
        return await sendNotification(
            reportId,
            notificationType
        );
    } catch (error) {
        /*
         * Falha de SMTP nunca pode
         * desfazer a denúncia/mensagem.
         */
        await recordAudit({
            reportId,
            notificationType,
            success:
                false,
            reason:
                "SEND_FAILED",
        });

        /*
         * Não logamos destinatário,
         * protocolo, corpo nem a
         * mensagem completa do SMTP.
         */
        safeErrorLog({
            level:
                "error",

            context:
                "email_notification_send_failed",

            notificationType,

            errorCode:
                error?.code ||
                null,
        });

        return {
            sent:
                false,

            reason:
                "SEND_FAILED",
        };
    }
}

async function notifyNewReportSafely(
    reportId
) {
    return notifySafely(
        reportId,
        "NEW_REPORT"
    );
}

async function notifyNewReporterMessageSafely(
    reportId
) {
    return notifySafely(
        reportId,
        "NEW_REPORTER_MESSAGE"
    );
}

module.exports = {
    notifyNewReportSafely,
    notifyNewReporterMessageSafely,
};