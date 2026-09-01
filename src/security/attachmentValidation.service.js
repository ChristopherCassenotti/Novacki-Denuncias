const path = require("node:path");

const MIME_EXTENSIONS = new Map([
    ["application/pdf", new Set([".pdf"])],
    ["image/jpeg", new Set([".jpg", ".jpeg"])],
    ["image/png", new Set([".png"])],
    ["image/webp", new Set([".webp"])],
    ["audio/mpeg", new Set([".mp3"])],
    ["audio/mp4", new Set([".m4a", ".mp4"])],
    ["audio/wav", new Set([".wav"])],
    ["video/mp4", new Set([".mp4"])],
    ["video/webm", new Set([".webm"])],
    ["application/msword", new Set([".doc"])],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Set([".docx"])],
    ["application/vnd.ms-excel", new Set([".xls"])],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new Set([".xlsx"])],
]);

const DANGEROUS_EXTENSIONS = new Set([
    ".exe", ".com", ".bat", ".cmd", ".msi", ".msp", ".scr",
    ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse", ".jar",
    ".sh", ".bash", ".zsh", ".dll", ".cpl", ".hta", ".reg",
    ".lnk", ".iso", ".img", ".apk", ".app", ".dmg",
    ".zip", ".rar", ".7z", ".tar", ".gz",
    ".docm", ".xlsm", ".pptm",
]);

function createValidationError(message, code = "FILE_CONTENT_NOT_ALLOWED") {
    const error = new Error(message);
    error.statusCode = 400;
    error.code = code;
    return error;
}

function startsWith(buffer, bytes) {
    if (!Buffer.isBuffer(buffer) || buffer.length < bytes.length) {
        return false;
    }

    return bytes.every((byte, index) => buffer[index] === byte);
}

function asciiAt(buffer, start, value) {
    if (!Buffer.isBuffer(buffer) || buffer.length < start + value.length) {
        return false;
    }

    return buffer.subarray(start, start + value.length).toString("ascii") === value;
}

function isZipContainer(buffer) {
    return startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
        startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
        startsWith(buffer, [0x50, 0x4b, 0x07, 0x08]);
}

function hasZipEntryName(buffer, needle) {
    return buffer.includes(Buffer.from(needle, "utf8"));
}

function validateSignature(mimeType, buffer) {
    switch (mimeType) {
        case "application/pdf":
            return asciiAt(buffer, 0, "%PDF-");

        case "image/jpeg":
            return startsWith(buffer, [0xff, 0xd8, 0xff]);

        case "image/png":
            return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

        case "image/webp":
            return asciiAt(buffer, 0, "RIFF") && asciiAt(buffer, 8, "WEBP");

        case "audio/mpeg":
            return asciiAt(buffer, 0, "ID3") ||
                (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);

        case "audio/mp4":
        case "video/mp4":
            return buffer.length >= 12 && asciiAt(buffer, 4, "ftyp");

        case "audio/wav":
            return asciiAt(buffer, 0, "RIFF") && asciiAt(buffer, 8, "WAVE");

        case "video/webm":
            return startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]);

        case "application/msword":
        case "application/vnd.ms-excel":
            return startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

        case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            return isZipContainer(buffer) &&
                hasZipEntryName(buffer, "[Content_Types].xml") &&
                hasZipEntryName(buffer, "word/");

        case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            return isZipContainer(buffer) &&
                hasZipEntryName(buffer, "[Content_Types].xml") &&
                hasZipEntryName(buffer, "xl/");

        default:
            return false;
    }
}

function validateAttachmentFile(file) {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
        throw createValidationError("O arquivo enviado está vazio ou inválido.", "INVALID_FILE_CONTENT");
    }

    const originalName = String(file.originalname || "").trim();
    if (!originalName || originalName.includes("\0") || originalName.includes("/") || originalName.includes("\\")) {
        throw createValidationError("O nome do arquivo é inválido.", "INVALID_FILE_NAME");
    }

    const extension = path.extname(originalName).toLowerCase();
    if (!extension || DANGEROUS_EXTENSIONS.has(extension)) {
        throw createValidationError("Este tipo de arquivo não é permitido.", "FILE_EXTENSION_NOT_ALLOWED");
    }

    const expectedExtensions = MIME_EXTENSIONS.get(file.mimetype);
    if (!expectedExtensions || !expectedExtensions.has(extension)) {
        throw createValidationError("A extensão do arquivo não corresponde ao tipo informado.", "FILE_EXTENSION_MISMATCH");
    }

    if (!validateSignature(file.mimetype, file.buffer)) {
        throw createValidationError("O conteúdo do arquivo não corresponde ao tipo informado.", "FILE_SIGNATURE_MISMATCH");
    }

    return true;
}

module.exports = {
    validateAttachmentFile,
};
