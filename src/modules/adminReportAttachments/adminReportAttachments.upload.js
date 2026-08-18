const multer =
    require("multer");

const MAX_FILE_SIZE =
    25 * 1024 * 1024;

const allowedMimeTypes =
    new Set([
        "application/pdf",

        "application/msword",

        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

        "application/vnd.ms-excel",

        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

        "image/jpeg",
        "image/png",
        "image/webp",

        "audio/mpeg",
        "audio/wav",
        "audio/x-wav",

        "video/mp4",
        "video/webm",
    ]);

function fileFilter(
    req,
    file,
    callback
) {
    if (
        !allowedMimeTypes.has(
            file.mimetype
        )
    ) {
        const error =
            new Error(
                "Tipo de arquivo não permitido."
            );

        error.statusCode = 400;

        return callback(
            error
        );
    }

    return callback(
        null,
        true
    );
}

const singleUpload =
    multer({
        storage:
            multer.memoryStorage(),

        limits: {
            fileSize:
                MAX_FILE_SIZE,

            files:
                1,
        },

        fileFilter,
    });

const multipleUpload =
    multer({
        storage:
            multer.memoryStorage(),

        limits: {
            fileSize:
                MAX_FILE_SIZE,

            files:
                5,
        },

        fileFilter,
    });

module.exports = {
    uploadAttachment:
        singleUpload.single(
            "file"
        ),

    uploadInitialAttachments:
        multipleUpload.array(
            "files",
            5
        ),
};