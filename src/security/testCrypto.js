require("dotenv/config");

const {
  encryptJson,
  decryptJson,
} = require("./crypto.service");

function main() {
  const originalReport = {
    description:
      "Estou relatando uma situação de assédio moral.",

    occurredAt:
      "2026-08-01",

    location:
      "Setor administrativo",

    involvedPeople: [
      "Pessoa A",
    ],

    witnesses: [
      "Pessoa B",
    ],

    immediateRisk: false,
  };

  console.log(
    "Conteúdo original:"
  );

  console.log(originalReport);

  const encrypted =
    encryptJson(
      originalReport,
      "REPORT_CONTENT"
    );

  console.log(
    "\nCriptografia realizada:"
  );

  console.log({
    ciphertextLength:
      encrypted.ciphertext.length,

    ivLength:
      encrypted.iv.length,

    authTagLength:
      encrypted.authTag.length,

    keyVersion:
      encrypted.keyVersion,
  });

  const decrypted =
    decryptJson(
      encrypted,
      "REPORT_CONTENT"
    );

  console.log(
    "\nConteúdo descriptografado:"
  );

  console.log(decrypted);

  const isEqual =
    JSON.stringify(originalReport) ===
    JSON.stringify(decrypted);

  console.log(
    "\nConteúdo íntegro:",
    isEqual
  );

  if (!isEqual) {
    throw new Error(
      "O conteúdo descriptografado é diferente do original."
    );
  }

  const tampered =
  Buffer.from(
    encrypted.ciphertext
  );

tampered[0] =
  tampered[0] ^ 1;

try {
  decryptJson(
    {
      ...encrypted,
      ciphertext: tampered,
    },
    "REPORT_CONTENT"
  );

  throw new Error(
    "Falha grave: conteúdo adulterado foi aceito."
  );
} catch (error) {
  if (
    error.message ===
    "Falha grave: conteúdo adulterado foi aceito."
  ) {
    throw error;
  }

  console.log(
    "\n✅ Conteúdo adulterado foi rejeitado."
  );
}

try {
  decryptJson(
    encrypted,
    "REPORT_IDENTITY"
  );

  throw new Error(
    "Falha grave: purpose incorreto foi aceito."
  );
} catch (error) {
  if (
    error.message ===
    "Falha grave: purpose incorreto foi aceito."
  ) {
    throw error;
  }

  console.log(
    "✅ Purpose incorreto foi rejeitado."
  );
}
}


try {
  main();

  console.log(
    "\n✅ Teste de criptografia concluído com sucesso."
  );
} catch (error) {
  console.error(
    "\n❌ Teste de criptografia falhou:"
  );

  console.error(
    error.message
  );

  process.exitCode = 1;
}

