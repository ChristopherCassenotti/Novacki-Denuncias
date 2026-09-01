function getMaxAttachmentBytes() {
    const mb =
        Number(
            process.env
                .MAX_ATTACHMENT_MB ||
            20
        );

    if (
        !Number.isFinite(mb) ||
        mb <= 0 ||
        mb > 100
    ) {
        throw new Error(
            "MAX_ATTACHMENT_MB inválido."
        );
    }

    return Math.floor(
        mb *
        1024 *
        1024
    );
}

const ALLOWED_MIME_TYPES =
    new Set([
        "application/pdf",

        "image/jpeg",
        "image/png",
        "image/webp",

        "audio/mpeg",
        "audio/mp4",
        "audio/wav",

        "video/mp4",
        "video/webm",

        "application/msword",

        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

        "application/vnd.ms-excel",

        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]);

function attachmentFileFilter(
    req,
    file,
    callback
) {
    if (
        !ALLOWED_MIME_TYPES.has(
            file.mimetype
        )
    ) {
        const error =
            new Error(
                "Tipo de arquivo não permitido."
            );

        error.statusCode =
            400;

        error.code =
            "FILE_TYPE_NOT_ALLOWED";

        return callback(
            error
        );
    }

    callback(
        null,
        true
    );
}

module.exports = {
    getMaxAttachmentBytes,
    attachmentFileFilter,
};