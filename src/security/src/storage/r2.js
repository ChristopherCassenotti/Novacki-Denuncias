const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,} = require("@aws-sdk/client-s3");

const R2_ACCOUNT_ID =
    process.env.R2_ACCOUNT_ID?.trim();

const R2_ACCESS_KEY_ID =
    process.env.R2_ACCESS_KEY_ID?.trim();

const R2_SECRET_ACCESS_KEY =
    process.env.R2_SECRET_ACCESS_KEY?.trim();

const R2_BUCKET_NAME =
    process.env.R2_BUCKET_NAME?.trim();

if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET_NAME
) {
    throw new Error(
        "Configuração do Cloudflare R2 incompleta."
    );
}

const r2 = new S3Client({
    region: "auto",

    endpoint:
        `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

    credentials: {
        accessKeyId:
            R2_ACCESS_KEY_ID,

        secretAccessKey:
            R2_SECRET_ACCESS_KEY,
    },
});

async function uploadObject({
    key,
    body,
    contentType,
}) {
    await r2.send(
        new PutObjectCommand({
            Bucket:
                R2_BUCKET_NAME,

            Key:
                key,

            Body:
                body,

            ContentType:
                contentType,
        })
    );
}

async function getObject(
    key
) {
    return r2.send(
        new GetObjectCommand({
            Bucket:
                R2_BUCKET_NAME,

            Key:
                key,
        })
    );
}

async function deleteObject(
    key
) {
    await r2.send(
        new DeleteObjectCommand({
            Bucket:
                R2_BUCKET_NAME,

            Key:
                key,
        })
    );
}

module.exports = { uploadObject, getObject, deleteObject, };
