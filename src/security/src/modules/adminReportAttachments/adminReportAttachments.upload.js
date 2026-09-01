const multer = require("multer");
const { getMaxAttachmentBytes, attachmentFileFilter } = require("../../config/upload");

const singleUpload =
    multer({
        storage:
            multer.memoryStorage(),

        limits: {
            fileSize:
                getMaxAttachmentBytes(),

            files:
                1,
        },

        fileFilter:
            attachmentFileFilter,
    });

const multipleUpload =
    multer({
        storage:
            multer.memoryStorage(),

        limits: {
            fileSize:
                getMaxAttachmentBytes(),

            files:
                5,
        },

        fileFilter:
            attachmentFileFilter,
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
