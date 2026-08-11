const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function createCryptoError(message){
    const error = new Error(message);
    error.code = 'CRYPTO_ERROR';

    return error;
}

function getCurrentKeyVersion(){
    const version = Number(process.env.REPORT_ENCRYPTION_KEY_VERSION);

    if(!Number.isInteger(version) || version <= 0){
        throw createCryptoError('REPORT_ENCRYPTION_KEY_VERSION inválida.');
    }

    return version;
}

function getEncryptionKey(version){
    if(!Number.isInteger(version) || version <= 0){
        throw createCryptoError('Versão da chave de criptografia inválida.');
    }

    const environmentVariable = `REPORT_ENCRYPTION_KEY_V${version}`;

    const encodeKey = process.env[environmentVariable];
    
    if(!encodeKey){
        throw createCryptoError(`Chave de criptografia versão ${version} não configurada.`);
    }

    let key;
    
    try{
        key = Buffer.from(encodeKey,'base64');
    }
    catch(error){
        throw createCryptoError(`Chave de criptografia versão ${version} inválida.`);
    }

    if(key.length !== KEY_LENGTH){
        throw createCryptoError(`A chave versão ${version} precisa possuir exatamente 32 bytes.`);
    }

    return key;
}

function createAdditionalAuthenticatedData(purpose, version){
    if(typeof purpose !== 'string' || purpose.trim() === ''){
        throw createCryptoError('O propósito da criptografia é obrigatório.');
    }

    return Buffer.from(`nvk-denuncias:${purpose}:v${version}`, 'utf8');
}

function encryptBuffer(plaintextBuffer, purpose){
    if(!Buffer.isBuffer(plaintextBuffer)){
        throw createCryptoError('O conteúdo para criptografia precisa ser um Buffer.');
    }

    const keyVersion = getCurrentKeyVersion();

    const key = getEncryptionKey(keyVersion);

    const iv = randomBytes(IV_LENGTH);

    const aad = createAdditionalAuthenticatedData(purpose, keyVersion);

    const cipher = createCipheriv(ALGORITHM, key, iv, {authTagLength: AUTH_TAG_LENGTH});

    cipher.setAAD(aad);

    const ciphertext = Buffer.concat([
        cipher.update(plaintextBuffer),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    if(authTag.length !== AUTH_TAG_LENGTH){
        throw createCryptoError('Authentication tag inválida.');
    }

    return {
        ciphertext,
        iv,
        authTag,
        keyVersion,
    }
}

function decryptBuffer({ciphertext,iv,authTag,keyVersion}, purpose){
    if(!Buffer.isBuffer(ciphertext)){
        throw createCryptoError('Ciphertext inválido.');
    }

    if(!Buffer.isBuffer(iv) || iv.length !== IV_LENGTH){
        throw createCryptoError('IV inválido.');
    }

    if(!Buffer.isBuffer(authTag) || authTag.length !== AUTH_TAG_LENGTH){
        throw createCryptoError('Authentication tag inválida.');
    }

    const key = getEncryptionKey(keyVersion);

    const aad = createAdditionalAuthenticatedData(purpose, keyVersion);
    
    try{
        const decipher = createDecipheriv(ALGORITHM, key, iv, { authTag: AUTH_TAG_LENGTH });

        decipher.setAAD(aad);
        decipher.setAuthTag(authTag);
        

        return Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]);
    }
    catch(error){
        throw createCryptoError('Não foi possível descriptografar o conteúdo.');
    }
}

function encryptJson(value, purpose){
    if(value === undefined || value === null){
        throw createCryptoError('O conteúdo para criptografia é obrigatório.');
    }

    let serialized;

    try{
        serialized = JSON.stringify(value);
    }
    catch(error){
        return createCryptoError('Não foi possível serializar o conteúdo.');
    }

    return encryptBuffer(Buffer.from(serialized,'utf8'), purpose);
}

function decryptJson(encryptedData, purpose){
    const plaintext = decryptBuffer(encryptedData, purpose);

    try{
        return JSON.parse(plaintext.toString('utf8'));
    }
    catch(error){
        throw createCryptoError('O conteúdo descriptografado não contém JSON válido.');
    }
}

module.exports = {encryptBuffer, decryptBuffer, encryptJson, decryptJson, getCurrentKeyVersion};