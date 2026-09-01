const {
    safeErrorLog,
} = require(
    "../utils/safeLog"
);

function notFoundHandler(req, res) {
    return res
        .status(404)
        .json({
            message:
                "Rota não encontrada.",

            requestId:
                req.requestId,
        });
}

function globalErrorHandler(
    error,
    req,
    res,
    next
) {
    if (
        res.headersSent
    ) {
        return next(
            error
        );
    }

    let statusCode =
        Number(
            error.statusCode ||
            error.status ||
            500
        );

    let publicMessage =
    error.message ||
    "Não foi possível processar a solicitação.";

    if (
        error.code ===
        "LIMIT_FILE_SIZE"
    ) {
        publicMessage =
            "O arquivo excede o tamanho máximo permitido.";
    }
    
    if (
        error.code ===
        "LIMIT_FILE_COUNT"
    ) {
        publicMessage =
            "Quantidade máxima de arquivos excedida.";
    }
    
    if (
        error.code ===
        "LIMIT_UNEXPECTED_FILE"
    ) {
        publicMessage =
            "Campo de arquivo inválido.";
    }
    
    if (
        error.code ===
        "FILE_TYPE_NOT_ALLOWED"
    ) {
        publicMessage =
            "Tipo de arquivo não permitido.";
    }

    if (
        error.type ===
        "entity.parse.failed"
    ) {
        statusCode =
            400;

        publicMessage =
            "JSON inválido.";
    }

    if (
        error.type ===
        "entity.too.large"
    ) {
        statusCode =
            413;

        publicMessage =
            "Corpo da requisição muito grande.";
    }

    if (
        error.name ===
        "MulterError"
    ) {
        const fileTooLarge =
            error.code ===
            "LIMIT_FILE_SIZE";

        statusCode =
            fileTooLarge
                ? 413
                : 400;

        publicMessage =
            fileTooLarge
                ? "Arquivo muito grande."
                : "Upload de arquivo inválido.";
    }

    if (
        statusCode < 400 ||
        statusCode > 599
    ) {
        statusCode =
            500;
    }

    const isServerError =
        statusCode >= 500;

    /*
     * Não registrar:
     *
     * req.body
     * cookies
     * Authorization
     * protocolo
     * segredo da denúncia
     * IP
     *
     * req.path também não possui
     * query string.
     */
    safeErrorLog({
        level:
            "error",

        requestId:
            req.requestId,

        method:
            req.method,

        path:
            req.path,

        statusCode,

        errorCode:
            error.code ||
            null,

        errorName:
            error.name,

        errorMessage:
            process.env.NODE_ENV ===
            "development"
                ? error.message
                : undefined,
    });
    
    if (
        error.code ===
        "LIMIT_FILE_SIZE"
    ) {
        statusCode =
            413;
    }
    
    if (
        error.code ===
        "LIMIT_FILE_COUNT"
    ) {
        statusCode =
            400;
    }
    
    if (
        error.code ===
        "LIMIT_UNEXPECTED_FILE"
    ) {
        statusCode =
            400;
    }
    
    if (
        error.code ===
        "FILE_TYPE_NOT_ALLOWED"
    ) {
        statusCode =
            400;
    }
        return res
        .status(statusCode)
        .json({
            message:
                isServerError
                    ? "Erro interno do servidor."
                    : publicMessage,
        
            requestId:
                req.requestId,
        
            ...(
                !isServerError &&
                error.code
                    ? {
                        code:
                            error.code,
                    }
                    : {}
            ),
        });
}

module.exports = {
    notFoundHandler,
    globalErrorHandler,
};
