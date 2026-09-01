# Ajuste de anexos — download sem ClamAV

## O que mudou

- [x] Removida a rota administrativa do scanner de anexos.
- [x] Removida a execução do scanner no worker de tarefas do sistema.
- [x] Removida a variável obrigatória `ATTACHMENT_SCANNER_ENABLED` da validação de ambiente.
- [x] Removido o módulo `src/modules/attachmentScanner`.
- [x] Novos anexos passam a ficar disponíveis imediatamente após o upload.
- [x] Novos anexos continuam sendo armazenados de forma privada no R2.
- [x] Download continua passando pela API e pelas permissões já existentes.
- [x] Arquivos continuam limitados por tamanho (`MAX_ATTACHMENT_MB`).
- [x] MIME types continuam limitados à lista permitida.
- [x] Adicionada validação da extensão do arquivo contra o MIME informado.
- [x] Adicionada validação da assinatura binária/conteúdo básico do arquivo.
- [x] Extensões executáveis, scripts, compactados e formatos macro-enabled conhecidos são bloqueados.
- [x] Arquivos já marcados como `INFECTED` ou `QUARANTINED` continuam bloqueados.
- [x] Mantido `scan_status = CLEAN` internamente para compatibilidade com o banco e o frontend atual; na prática, neste modo ele significa "arquivo liberado pelas validações locais", não "verificado por antivírus".
- [x] `available_at` é preenchido no momento do upload.
- [x] Incluído comando para liberar anexos antigos presos em `PENDING`, `SCANNING` ou `FAILED`.
- [x] A montagem de `/api/admin/audit-logs` foi preservada no pacote final, considerando a correção já feita no backend.

## Para anexos antigos

Depois de publicar o backend novo e configurar as variáveis do banco, execute **uma vez**:

```bash
npm run attachments:release-legacy
```

O comando transforma anexos antigos com status `PENDING`, `SCANNING` ou `FAILED` em disponíveis para download.

Ele **não altera** arquivos `INFECTED` ou `QUARANTINED`.

## Variável que não é mais necessária

Pode remover da configuração da Hostinger:

```env
ATTACHMENT_SCANNER_ENABLED=...
```

As demais variáveis do worker continuam válidas porque o worker também cuida das rotinas de retenção.

## Fluxo novo

```text
Upload
  ↓
Limite de tamanho
  ↓
Tipo MIME permitido
  ↓
Extensão compatível
  ↓
Assinatura básica do arquivo compatível
  ↓
R2 privado
  ↓
scan_status = CLEAN
available_at = agora
  ↓
Download disponível
```

## Observação de segurança

Este ajuste remove a análise por antivírus. As validações locais reduzem o risco de arquivos obviamente incompatíveis ou executáveis disfarçados, mas **não detectam malware dentro de um PDF, documento ou outro arquivo válido**. O download deve continuar sendo tratado como arquivo recebido de terceiros.
