require("dotenv/config");

const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");

const prisma = require("../src/database/prisma");

const requiredEnvironmentVariables = [
  "SEED_ADMIN_NAME",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
];

function validateEnvironment() {
  const missingVariables = requiredEnvironmentVariables.filter(
    (variable) => !process.env[variable]
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Variáveis ausentes no .env: ${missingVariables.join(", ")}`
    );
  }

  if (process.env.SEED_ADMIN_PASSWORD.length < 12) {
    throw new Error(
      "SEED_ADMIN_PASSWORD precisa possuir pelo menos 12 caracteres."
    );
  }
}

const permissionsData = [
  {
    code: "REPORT_LIST",
    description: "Listar denúncias permitidas ao usuário.",
  },
  {
    code: "REPORT_VIEW",
    description: "Visualizar o conteúdo de denúncias permitidas.",
  },
  {
    code: "REPORT_ASSIGN",
    description: "Atribuir denúncias a usuários ou equipes.",
  },
  {
    code: "REPORT_CHANGE_PRIORITY",
    description: "Alterar a prioridade de uma denúncia.",
  },
  {
    code: "REPORT_CHANGE_STATUS",
    description: "Alterar o status de uma denúncia.",
  },
  {
    code: "REPORT_MESSAGE",
    description: "Enviar mensagens ao denunciante.",
  },
  {
    code: "REPORT_REQUEST_INFO",
    description: "Solicitar informações complementares.",
  },
  {
    code: "REPORT_INTERNAL_NOTE",
    description: "Adicionar anotações internas.",
  },
  {
    code: "REPORT_ATTACHMENT",
    description: "Adicionar e consultar anexos permitidos.",
  },
  {
    code: "REPORT_MANAGE_ACCESS",
    description: "Gerenciar acessos específicos a denúncias.",
  },
  {
    code: "REPORT_RESTRICT_USER",
    description: "Impedir o acesso de usuários envolvidos no caso.",
  },
  {
    code: "REPORT_CONCLUDE",
    description: "Concluir denúncias.",
  },
  {
    code: "REPORT_ARCHIVE",
    description: "Arquivar denúncias.",
  },
  {
    code: "REPORT_STATS_VIEW",
    description: "Visualizar indicadores estatísticos.",
  },
  {
    code: "REPORT_EXPORT",
    description: "Exportar relatórios autorizados.",
  },
  {
    code: "AUDIT_VIEW",
    description: "Consultar registros de auditoria.",
  },
  {
    code: "USER_MANAGE",
    description: "Gerenciar usuários administrativos.",
  },
  {
    code: "ROLE_MANAGE",
    description: "Gerenciar perfis e permissões.",
  },
  {
    code: "TEAM_MANAGE",
    description: "Gerenciar equipes.",
  },
  {
    code: "UNIT_MANAGE",
    description: "Gerenciar empresas, unidades e setores.",
  },
  {
    code: "CATEGORY_MANAGE",
    description: "Gerenciar categorias de denúncia.",
  },
  {
    code: "ROUTING_MANAGE",
    description: "Gerenciar regras de encaminhamento.",
  },
  {
    code: "RETENTION_MANAGE",
    description: "Gerenciar políticas de retenção.",
  },
  {
    code: "SETTINGS_MANAGE",
    description: "Gerenciar configurações do sistema.",
  },
];

const rolesData = [
  {
    code: "ADMIN_TECHNICAL",
    name: "Administrador técnico",
    description:
      "Configura usuários, permissões e o sistema sem acesso automático ao conteúdo das denúncias.",
  },
  {
    code: "TRIAGE",
    name: "Responsável pela triagem",
    description:
      "Recebe, classifica, prioriza e encaminha as denúncias.",
  },
  {
    code: "INVESTIGATOR",
    name: "Responsável pela apuração",
    description:
      "Conduz a investigação dos casos atribuídos.",
  },
  {
    code: "MANAGER",
    name: "Gestor autorizado",
    description:
      "Consulta indicadores e casos expressamente permitidos.",
  },
  {
    code: "AUDITOR",
    name: "Auditor",
    description:
      "Consulta históricos e registros de auditoria sem realizar alterações.",
  },
];

const rolePermissions = {
  ADMIN_TECHNICAL: [
    "AUDIT_VIEW",
    "USER_MANAGE",
    "ROLE_MANAGE",
    "TEAM_MANAGE",
    "UNIT_MANAGE",
    "CATEGORY_MANAGE",
    "ROUTING_MANAGE",
    "RETENTION_MANAGE",
    "SETTINGS_MANAGE",
  ],

  TRIAGE: [
    "REPORT_LIST",
    "REPORT_VIEW",
    "REPORT_ASSIGN",
    "REPORT_CHANGE_PRIORITY",
    "REPORT_CHANGE_STATUS",
    "REPORT_MESSAGE",
    "REPORT_REQUEST_INFO",
    "REPORT_ATTACHMENT",
    "REPORT_MANAGE_ACCESS",
    "REPORT_RESTRICT_USER",
    "REPORT_ARCHIVE",
  ],

  INVESTIGATOR: [
    "REPORT_LIST",
    "REPORT_VIEW",
    "REPORT_CHANGE_STATUS",
    "REPORT_MESSAGE",
    "REPORT_REQUEST_INFO",
    "REPORT_INTERNAL_NOTE",
    "REPORT_ATTACHMENT",
    "REPORT_CONCLUDE",
    "REPORT_ARCHIVE",
  ],

  MANAGER: [
    "REPORT_LIST",
    "REPORT_VIEW",
    "REPORT_STATS_VIEW",
    "REPORT_EXPORT",
  ],

  AUDITOR: [
    "REPORT_LIST",
    "REPORT_VIEW",
    "AUDIT_VIEW",
  ],
};

const categoriesData = [
  {
    code: "MORAL_HARASSMENT",
    name: "Assédio moral",
    description:
      "Condutas abusivas, humilhações, constrangimentos ou perseguições.",
    default_priority: "HIGH",
  },
  {
    code: "SEXUAL_HARASSMENT",
    name: "Assédio sexual",
    description:
      "Condutas, propostas ou comportamentos de natureza sexual indesejada.",
    default_priority: "HIGH",
  },
  {
    code: "DISCRIMINATION",
    name: "Discriminação",
    description:
      "Tratamento desigual ou ofensivo baseado em características pessoais.",
    default_priority: "HIGH",
  },
  {
    code: "AGGRESSION_OR_THREAT",
    name: "Agressão ou ameaça",
    description:
      "Agressões físicas, verbais, intimidações ou ameaças.",
    default_priority: "CRITICAL",
  },
  {
    code: "UNSAFE_WORKING_CONDITIONS",
    name: "Condições inseguras de trabalho",
    description:
      "Situações que possam oferecer risco à saúde ou à integridade física.",
    default_priority: "HIGH",
  },
  {
    code: "FRAUD_OR_CORRUPTION",
    name: "Fraude ou corrupção",
    description:
      "Fraudes, desvios, subornos ou outras práticas ilícitas.",
    default_priority: "HIGH",
  },
  {
    code: "INTERNAL_POLICY_VIOLATION",
    name: "Violação de normas internas",
    description:
      "Descumprimento de políticas, códigos ou procedimentos internos.",
    default_priority: "NORMAL",
  },
  {
    code: "CONFLICT_OF_INTEREST",
    name: "Conflito de interesses",
    description:
      "Interesses pessoais que possam interferir em decisões profissionais.",
    default_priority: "NORMAL",
  },
  {
    code: "OTHER_IRREGULARITIES",
    name: "Outras irregularidades",
    description:
      "Situações não classificadas nas demais categorias.",
    default_priority: "NORMAL",
  },
];

async function upsertPermissions() {
  const permissionMap = new Map();

  for (const permission of permissionsData) {
    const savedPermission = await prisma.permissions.upsert({
      where: {
        code: permission.code,
      },
      update: {
        description: permission.description,
      },
      create: {
        id: randomUUID(),
        code: permission.code,
        description: permission.description,
      },
    });

    permissionMap.set(savedPermission.code, savedPermission);
  }

  return permissionMap;
}

async function upsertRoles() {
  const roleMap = new Map();

  for (const role of rolesData) {
    const savedRole = await prisma.roles.upsert({
      where: {
        code: role.code,
      },
      update: {
        name: role.name,
        description: role.description,
        is_system: true,
        is_active: true,
      },
      create: {
        id: randomUUID(),
        code: role.code,
        name: role.name,
        description: role.description,
        is_system: true,
        is_active: true,
      },
    });

    roleMap.set(savedRole.code, savedRole);
  }

  return roleMap;
}

async function assignPermissionsToRoles(roleMap, permissionMap) {
  const assignments = [];

  for (const [roleCode, permissionCodes] of Object.entries(
    rolePermissions
  )) {
    const role = roleMap.get(roleCode);

    if (!role) {
      throw new Error(`Perfil não encontrado: ${roleCode}`);
    }

    for (const permissionCode of permissionCodes) {
      const permission = permissionMap.get(permissionCode);

      if (!permission) {
        throw new Error(
          `Permissão não encontrada: ${permissionCode}`
        );
      }

      assignments.push({
        role_id: role.id,
        permission_id: permission.id,
      });
    }
  }

  await prisma.role_permissions.createMany({
    data: assignments,
    skipDuplicates: true,
  });
}

async function upsertTeams() {
  const triageTeam = await prisma.teams.upsert({
    where: {
      name: "Triagem",
    },
    update: {
      description: "Equipe responsável pela análise inicial.",
      is_independent: false,
      is_active: true,
    },
    create: {
      id: randomUUID(),
      name: "Triagem",
      description: "Equipe responsável pela análise inicial.",
      is_independent: false,
      is_active: true,
    },
  });

  const independentTeam = await prisma.teams.upsert({
    where: {
      name: "Comitê independente",
    },
    update: {
      description:
        "Equipe independente para denúncias envolvendo RH ou administradores.",
      is_independent: true,
      is_active: true,
    },
    create: {
      id: randomUUID(),
      name: "Comitê independente",
      description:
        "Equipe independente para denúncias envolvendo RH ou administradores.",
      is_independent: true,
      is_active: true,
    },
  });

  return {
    triageTeam,
    independentTeam,
  };
}

async function upsertCompanyUnit() {
  const companyCode = process.env.SEED_COMPANY_CODE || "NVK";
  const companyName = process.env.SEED_COMPANY_NAME || "Novacki";

  return prisma.units.upsert({
    where: {
      code: companyCode,
    },
    update: {
      name: companyName,
      type: "COMPANY",
      is_active: true,
    },
    create: {
      id: randomUUID(),
      code: companyCode,
      name: companyName,
      type: "COMPANY",
      is_active: true,
    },
  });
}

async function upsertCategories() {
  for (const category of categoriesData) {
    await prisma.report_categories.upsert({
      where: {
        code: category.code,
      },
      update: {
        name: category.name,
        description: category.description,
        default_priority: category.default_priority,
        is_active: true,
      },
      create: {
        id: randomUUID(),
        code: category.code,
        name: category.name,
        description: category.description,
        default_priority: category.default_priority,
        is_active: true,
      },
    });
  }
}

async function createInitialAdministrator(roleMap, triageTeam) {
  const adminEmail = process.env.SEED_ADMIN_EMAIL
    .trim()
    .toLowerCase();

  const passwordHash = await bcrypt.hash(
    process.env.SEED_ADMIN_PASSWORD,
    12
  );

  const user = await prisma.users.upsert({
    where: {
      email: adminEmail,
    },
    update: {
      name: process.env.SEED_ADMIN_NAME,
      is_active: true,
    },
    create: {
      id: randomUUID(),
      name: process.env.SEED_ADMIN_NAME,
      email: adminEmail,
      password_hash: passwordHash,
      is_active: true,
      must_change_password: true,
    },
  });

  const administratorRole = roleMap.get("ADMIN_TECHNICAL");
  const triageRole = roleMap.get("TRIAGE");

  await prisma.user_roles.createMany({
    data: [
      {
        user_id: user.id,
        role_id: administratorRole.id,
      },
      {
        user_id: user.id,
        role_id: triageRole.id,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.team_members.createMany({
    data: [
      {
        team_id: triageTeam.id,
        user_id: user.id,
        role: "COORDINATOR",
      },
    ],
    skipDuplicates: true,
  });

  return user;
}

async function main() {
  validateEnvironment();

  console.log("Iniciando seed do Canal de Denúncias...");

  const permissionMap = await upsertPermissions();
  console.log("Permissões cadastradas.");

  const roleMap = await upsertRoles();
  console.log("Perfis cadastrados.");

  await assignPermissionsToRoles(roleMap, permissionMap);
  console.log("Permissões atribuídas aos perfis.");

  const teams = await upsertTeams();
  console.log("Equipes cadastradas.");

  await upsertCompanyUnit();
  console.log("Unidade principal cadastrada.");

  await upsertCategories();
  console.log("Categorias cadastradas.");

  const administrator = await createInitialAdministrator(
    roleMap,
    teams.triageTeam
  );

  console.log("Administrador inicial cadastrado.");
  console.log(`E-mail: ${administrator.email}`);
  console.log("Seed finalizado com sucesso.");
}

main()
  .catch((error) => {
    console.error("Erro ao executar o seed:");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });