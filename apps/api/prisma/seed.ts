import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_AI_PROMPT = [
  "Voce e o motor de precificacao interna do Nitro Pricing.",
  "Use as configuracoes cadastradas como fonte de verdade: grupos, servicos, unidades, kits de materiais e regras.",
  "Classifique a intencao antes de agir: cumprimento responde conversa, pergunta sobre regras explica a base, pedido explicito de orcamento gera proposta interna.",
  "O Nitro Pricing calcula somente mao de obra e servicos especializados.",
  "Materiais, equipamentos e dispositivos nunca possuem preco, nao afetam o total e devem aparecer apenas como lista quantitativa sugerida.",
  "Use padroes historicos Nitro: cabeamento estruturado, lancamento de cabo, identificacao de pontos, organizacao de rack, instalacao de camera, infraestrutura CFTV, fibra optica, fusao, access point, alarme/sensores e infraestrutura externa.",
  "Considere premissas e riscos de infraestrutura: dificuldade de passagem, rack desorganizado, necessidade de identificacao, trabalho em altura, PTA/plataforma, postes, eletrodutos, horario nao comercial e materiais excluidos.",
  "Se faltar informacao, registre premissas, riscos e perguntas recomendadas. Nao invente certeza.",
  "Calcule total_labor_price como quantity * difficulty_factor * unit_labor_price.",
  "A saida deve ser uma visao tecnica/comercial interna, limpa e revisavel."
].join(" ");

const groups = [
  ["CFTV", "CFTV"],
  ["RACK", "Rack técnico"],
  ["REDE", "Rede"],
  ["CABEAMENTO", "Cabeamento estruturado"],
  ["NOBREAK", "Nobreak"],
  ["INFRA_ELETRICA", "Infra elétrica"],
  ["FIBRA", "Fibra óptica"],
  ["ALARME", "Alarme e sensores"],
  ["INFRA_EXTERNA", "Infraestrutura externa"],
  ["MANUTENCAO", "Manutenção"]
] as const;

async function main() {
  await prisma.userExternal.upsert({
    where: { externalId: "dev-tecnico" },
    update: {},
    create: {
      externalId: "dev-tecnico",
      email: "tecnico@powerquote.local",
      name: "Tecnico Dev",
      roles: [UserRole.admin, UserRole.tecnico, UserRole.comercial, UserRole.gestor]
    }
  });

  await prisma.customer.upsert({
    where: { id: "seed-customer-acme" },
    update: {},
    create: {
      id: "seed-customer-acme",
      name: "Cliente Exemplo ACME",
      contactName: "Marina Operacoes",
      contactEmail: "marina@example.com",
      contactPhone: "(11) 4002-8922",
      notes: "Cliente de referencia para testes locais."
    }
  });

  for (const [code, name] of groups) {
    await prisma.group.upsert({
      where: { code },
      update: { name, active: true },
      create: { code, name, description: `Grupo de servicos de ${name}.` }
    });
  }

  const units = [
    ["unidade", "Unidade", "Use para equipamentos ou itens contáveis.", "1 câmera IP"],
    ["hora", "Hora", "Use para esforço de mão de obra por tempo.", "4 horas de organização de rack"],
    ["metro", "Metro", "Use para cabos, eletrodutos e infraestrutura linear.", "120 metros de cabo"],
    ["diária", "Diária", "Use quando o trabalho for estimado por dia de equipe.", "2 diárias técnicas"],
    ["ponto", "Ponto", "Use para pontos instalados ou certificados.", "12 pontos de rede"],
    ["kit", "Kit", "Use para conjuntos de materiais que andam juntos.", "1 kit por câmera"]
  ] as const;

  for (const [code, name, description, example] of units) {
    await prisma.unit.upsert({
      where: { code },
      update: { name, description, example, active: true },
      create: { code, name, description, example }
    });
  }

  const groupByCode = Object.fromEntries(
    (await prisma.group.findMany()).map((group) => [group.code, group])
  );

  const services = [
    ["CFTV-INST-CAM", "CFTV", "Instalacao de camera IP", "ponto", 180, "Instalacao, fixacao, ajuste de angulo e validacao basica de cameras IP."],
    ["CFTV-CONFIG-NVR", "CFTV", "Configuracao de NVR e cameras", "hora", 140, "Adocao, configuracao e validacao de gravador digital/NVR e cameras."],
    ["CFTV-INFRA", "CFTV", "Infraestrutura para CFTV", "metro", 85, "Passagem e organizacao de infraestrutura dedicada para rede de CFTV."],
    ["RACK-ORG", "RACK", "Organizacao e montagem de rack", "hora", 160, "Organizacao de cabos, acomodacao de ativos, patching, identificacao e limpeza logica do rack."],
    ["RACK-INST", "RACK", "Instalacao de rack tecnico", "unidade", 420, "Instalacao de rack de parede, rack outdoor ou mini rack para ativos de rede/CFTV."],
    ["REDE-SWITCH", "REDE", "Instalacao/configuracao de switch", "unidade", 220, "Instalacao fisica e configuracao inicial de switch ou switch PoE."],
    ["REDE-AP", "REDE", "Instalacao e configuracao de Access Point", "unidade", 280, "Instalacao, passagem de cabo, crimpagem e configuracao de access point."],
    ["CAB-LANCAMENTO", "CABEAMENTO", "Lancamento de cabo UTP", "ponto", 95, "Lancamento de cabo UTP/F-UTP/CAT5e/CAT6 para dados, CFTV ou AP."],
    ["CAB-LANCAMENTO-METRO", "CABEAMENTO", "Lancamento de cabo por metro", "metro", 7, "Estimativa linear para grandes volumes de lancamento de cabo."],
    ["CAB-CONECTORIZACAO", "CABEAMENTO", "Conectorizacao/crimpagem de cabo de rede", "unidade", 35, "Conectorizacao de pinos jack, keystone, patch panel ou pontas RJ45."],
    ["CAB-IDENTIFICACAO", "CABEAMENTO", "Identificacao e mapeamento de pontos", "ponto", 60, "Localizacao, mapeamento, etiquetagem e identificacao de cabos, portas e pontos."],
    ["CAB-CERT", "CABEAMENTO", "Certificacao de ponto de rede", "ponto", 55, "Certificacao tecnica ou validacao de ponto de rede."],
    ["FIBRA-LANCAMENTO", "FIBRA", "Lancamento de fibra optica", "metro", 9, "Lancamento de fibra optica drop, auto sustentavel ou cabo optico para link externo."],
    ["FIBRA-FUSAO", "FIBRA", "Fusao optica", "unidade", 95, "Realizacao de fusoes opticas, sangria e acabamento tecnico."],
    ["FIBRA-VALIDACAO", "FIBRA", "Validacao de cabo optico", "hora", 160, "Validacao, organizacao e testes de cabo optico em rack ou campo."],
    ["ALARME-SENSOR", "ALARME", "Instalacao de sensor de alarme", "unidade", 130, "Instalacao de sensor IVP, sirene ou periferico de alarme."],
    ["INFRA-ELETRODUTO", "INFRA_EXTERNA", "Instalacao de eletroduto/condulete", "metro", 18, "Instalacao de eletrodutos, conduletes, eletrocalhas e infraestrutura aparente."],
    ["INFRA-POSTE", "INFRA_EXTERNA", "Equipagem de poste", "unidade", 180, "Equipagem de poste com BAP, olhal, ancoragem, fixacao de rack outdoor ou passagem aerea."],
    ["INFRA-ALTURA", "INFRA_EXTERNA", "Trabalho em altura / apoio PTA", "diária", 680, "Premissa de trabalho em altura, plataforma elevatoria, PTA ou janela especial de execucao."],
    ["NOBREAK-INST", "NOBREAK", "Instalacao de nobreak", "unidade", 190, "Instalacao e organizacao de nobreak para rack tecnico."],
    ["ELETRICA-TOMADA", "INFRA_ELETRICA", "Instalacao de tomada dedicada", "ponto", 150, "Instalacao de ponto eletrico/tomada dedicada para rack, camera ou access point."],
    ["MANUT-VISITA", "MANUTENCAO", "Visita tecnica preventiva", "hora", 130, "Atendimento tecnico, validacao, reparo ou manutencao pontual."]
  ] as const;

  for (const [code, groupCode, name, unit, baseLaborPrice, description] of services) {
    await prisma.service.upsert({
      where: { code },
      update: { name, unit, baseLaborPrice, description, groupId: groupByCode[groupCode].id, active: true },
      create: {
        code,
        name,
        unit,
        baseLaborPrice,
        groupId: groupByCode[groupCode].id,
        description,
        defaultDifficulty: 1
      }
    });
  }

  const serviceByCode = Object.fromEntries(
    (await prisma.service.findMany()).map((service) => [service.code, service])
  );

  const materials = [
    ["CFTV", "Camera IP", "unidade"],
    ["CFTV", "Bucha e parafuso", "kit"],
    ["CFTV", "Fonte 12V", "unidade"],
    ["CFTV", "Caixa de passagem", "unidade"],
    ["CFTV", "NVR", "unidade"],
    ["RACK", "Rack", "unidade"],
    ["REDE", "Switch", "unidade"],
    ["CABEAMENTO", "Cabo UTP", "metro"],
    ["CABEAMENTO", "Patch Panel", "unidade"],
    ["NOBREAK", "Nobreak", "unidade"],
    ["INFRA_ELETRICA", "Tomada dedicada", "ponto"],
    ["FIBRA", "Cabo optico", "metro"],
    ["FIBRA", "DIO/caixa de terminacao optica", "unidade"],
    ["FIBRA", "Cordao optico", "unidade"],
    ["REDE", "Access Point", "unidade"],
    ["INFRA_EXTERNA", "Eletroduto galvanizado", "metro"],
    ["INFRA_EXTERNA", "Condulete", "unidade"],
    ["INFRA_EXTERNA", "BAP e olhal para poste", "kit"],
    ["ALARME", "Sensor IVP", "unidade"],
    ["ALARME", "Sirene", "unidade"]
  ] as const;

  for (const [groupCode, name, unit] of materials) {
    const existing = await prisma.suggestedMaterial.findFirst({ where: { name } });
    if (!existing) {
      await prisma.suggestedMaterial.create({
        data: { name, unit, groupId: groupByCode[groupCode].id, description: `Material sugerido: ${name}.` }
      });
    }
  }

  await prisma.materialKit.upsert({
    where: { code: "KIT_CAMERA_IP_BASICO" },
    update: {
      name: "Kit basico por camera IP",
      groupId: groupByCode.CFTV.id,
      serviceId: serviceByCode["CFTV-INST-CAM"].id,
      active: true,
      itemsJson: {
        items: [
          { material: "Camera IP", quantity_per_service: 1, unit: "unidade" },
          { material: "Bucha e parafuso", quantity_per_service: 1, unit: "kit" },
          { material: "Fonte 12V", quantity_per_service: 1, unit: "unidade" },
          { material: "Caixa de passagem", quantity_per_service: 1, unit: "unidade" },
          { material: "Conectores RJ45", quantity_per_service: 2, unit: "unidade" }
        ]
      }
    },
    create: {
      code: "KIT_CAMERA_IP_BASICO",
      name: "Kit basico por camera IP",
      description: "Materiais sugeridos automaticamente quando houver instalacao de cameras IP.",
      groupId: groupByCode.CFTV.id,
      serviceId: serviceByCode["CFTV-INST-CAM"].id,
      itemsJson: {
        items: [
          { material: "Camera IP", quantity_per_service: 1, unit: "unidade" },
          { material: "Bucha e parafuso", quantity_per_service: 1, unit: "kit" },
          { material: "Fonte 12V", quantity_per_service: 1, unit: "unidade" },
          { material: "Caixa de passagem", quantity_per_service: 1, unit: "unidade" },
          { material: "Conectores RJ45", quantity_per_service: 2, unit: "unidade" }
        ]
      }
    }
  });

  await prisma.materialKit.upsert({
    where: { code: "KIT_ACCESS_POINT_BASICO" },
    update: {
      name: "Kit basico por Access Point",
      groupId: groupByCode.REDE.id,
      serviceId: serviceByCode["REDE-AP"].id,
      active: true,
      itemsJson: {
        items: [
          { material: "Access Point", quantity_per_service: 1, unit: "unidade" },
          { material: "Cabo UTP", quantity_per_service: 30, unit: "metro" },
          { material: "Conectores RJ45", quantity_per_service: 2, unit: "unidade" }
        ]
      }
    },
    create: {
      code: "KIT_ACCESS_POINT_BASICO",
      name: "Kit basico por Access Point",
      description: "Materiais sugeridos para instalacao e configuracao de AP.",
      groupId: groupByCode.REDE.id,
      serviceId: serviceByCode["REDE-AP"].id,
      itemsJson: {
        items: [
          { material: "Access Point", quantity_per_service: 1, unit: "unidade" },
          { material: "Cabo UTP", quantity_per_service: 30, unit: "metro" },
          { material: "Conectores RJ45", quantity_per_service: 2, unit: "unidade" }
        ]
      }
    }
  });

  await prisma.materialKit.upsert({
    where: { code: "KIT_FIBRA_BASICO" },
    update: {
      name: "Kit basico para fibra optica",
      groupId: groupByCode.FIBRA.id,
      serviceId: serviceByCode["FIBRA-LANCAMENTO"].id,
      active: true,
      itemsJson: {
        items: [
          { material: "Cabo optico", quantity_per_service: 1, unit: "metro" },
          { material: "DIO/caixa de terminacao optica", quantity_per_service: 1, unit: "unidade" },
          { material: "Cordao optico", quantity_per_service: 2, unit: "unidade" }
        ]
      }
    },
    create: {
      code: "KIT_FIBRA_BASICO",
      name: "Kit basico para fibra optica",
      description: "Materiais sugeridos para lancamento e terminacao de fibra.",
      groupId: groupByCode.FIBRA.id,
      serviceId: serviceByCode["FIBRA-LANCAMENTO"].id,
      itemsJson: {
        items: [
          { material: "Cabo optico", quantity_per_service: 1, unit: "metro" },
          { material: "DIO/caixa de terminacao optica", quantity_per_service: 1, unit: "unidade" },
          { material: "Cordao optico", quantity_per_service: 2, unit: "unidade" }
        ]
      }
    }
  });

  const variables = [
    ["camera_quantity", "Quantidade de cameras", "number", "un", true],
    ["network_points", "Pontos de rede", "number", "pontos", false],
    ["rack_required", "Rack necessario", "boolean", null, false],
    ["site_distance_km", "Distancia ate o local", "number", "km", false],
    ["work_at_height", "Trabalho em altura", "boolean", null, false],
    ["fiber_meters", "Metros de fibra optica", "number", "m", false],
    ["ap_quantity", "Quantidade de Access Points", "number", "un", false],
    ["alarm_sensor_quantity", "Quantidade de sensores de alarme", "number", "un", false],
    ["work_after_hours", "Execucao fora do horario comercial", "boolean", null, false],
    ["outdoor_infra", "Infraestrutura externa/postes", "boolean", null, false]
  ] as const;

  for (const [key, label, type, unit, required] of variables) {
    await prisma.variable.upsert({
      where: { key },
      update: { label, type, unit, required },
      create: { key, label, type, unit, required, description: `Variavel de entrada: ${label}.` }
    });
  }

  await prisma.rule.upsert({
    where: { code: "CFTV_GT_8_CAMERAS" },
    update: {},
    create: {
      code: "CFTV_GT_8_CAMERAS",
      name: "CFTV acima de 8 cameras recomenda rack",
      description: "Sugere grupos e materiais para projetos com maior volume de cameras.",
      conditionJson: { field: "camera_quantity", operator: ">", value: 8 },
      actionJson: {
        suggest_groups: ["RACK", "REDE"],
        suggest_materials: ["Rack", "Switch", "Patch Panel", "Nobreak"],
        suggest_kits: ["KIT_CAMERA_IP_BASICO"],
        add_notes: ["Projeto acima de 8 cameras recomenda centralizacao em rack tecnico."]
      }
    }
  });

  await prisma.rule.upsert({
    where: { code: "CFTV_GTE_20_CAMERAS" },
    update: {},
    create: {
      code: "CFTV_GTE_20_CAMERAS",
      name: "CFTV com 20 cameras ou mais recomenda rede dedicada",
      description: "Sugere switches e nobreak para projetos maiores de CFTV.",
      conditionJson: { field: "camera_quantity", operator: ">=", value: 20 },
      actionJson: {
        suggest_groups: ["REDE", "NOBREAK"],
        suggest_materials: ["Switch PoE 24 portas", "Nobreak", "Patch Panel", "Rack"],
        suggest_kits: ["KIT_CAMERA_IP_BASICO"],
        add_notes: ["Projetos com 20 cameras ou mais devem prever switch PoE dimensionado e energia protegida."]
      }
    }
  });

  const historicalRules = [
    {
      code: "NITRO_LABOR_ONLY",
      name: "Nitro Pricing sempre calcula somente mão de obra",
      description: "Regra histórica extraída das propostas: materiais, equipamentos e dispositivos não entram no total.",
      conditionJson: { field: "always", operator: "==", value: true },
      actionJson: {
        suggest_groups: [],
        suggest_materials: [],
        add_notes: ["Orçamento interno de mão de obra especializada. Materiais são apenas referência quantitativa e não afetam o total."]
      }
    },
    {
      code: "CAB_POINTS_GTE_10_IDENTIFICATION",
      name: "Projetos com muitos pontos exigem identificação",
      description: "Propostas históricas citam localização, mapeamento e identificação de pontos/cabos.",
      conditionJson: { field: "network_points", operator: ">=", value: 10 },
      actionJson: {
        suggest_groups: ["CABEAMENTO", "RACK"],
        suggest_materials: ["Fita profissional para rotulação", "Etiquetas"],
        add_notes: ["Considerar identificação, mapeamento e organização de cabos/portas quando houver volume relevante de pontos."]
      }
    },
    {
      code: "FIBRA_GT_100_METERS",
      name: "Fibra acima de 100m exige lançamento, fusão e validação",
      description: "Padrão histórico de lançamento de fibra, fusões, organização em rack e identificação.",
      conditionJson: { field: "fiber_meters", operator: ">", value: 100 },
      actionJson: {
        suggest_groups: ["FIBRA", "RACK", "INFRA_EXTERNA"],
        suggest_materials: ["Cabo optico", "DIO/caixa de terminacao optica", "Cordao optico"],
        suggest_kits: ["KIT_FIBRA_BASICO"],
        add_notes: ["Projetos de fibra devem avaliar ancoragem, sangria/fusão, organização em rack e identificação do cabo óptico."]
      }
    },
    {
      code: "AP_GT_0_REQUIRES_CABLING_CONFIG",
      name: "Access Point exige instalação, cabeamento e configuração",
      description: "Padrão histórico de AP: instalação, passagem de CAT6, crimpagem e configuração.",
      conditionJson: { field: "ap_quantity", operator: ">", value: 0 },
      actionJson: {
        suggest_groups: ["REDE", "CABEAMENTO"],
        suggest_materials: ["Access Point", "Cabo UTP", "Conectores RJ45"],
        suggest_kits: ["KIT_ACCESS_POINT_BASICO"],
        add_notes: ["Instalação de AP deve considerar passagem de cabo, crimpagem, fixação e configuração."]
      }
    },
    {
      code: "OUTDOOR_OR_HEIGHT_REQUIRES_PTA_RISK",
      name: "Infra externa ou altura pode exigir PTA/plataforma",
      description: "Propostas históricas citam postes, rack outdoor, ancoragem e necessidade de PTA por conta do cliente.",
      conditionJson: { field: "work_at_height", operator: "==", value: true },
      actionJson: {
        suggest_groups: ["INFRA_EXTERNA"],
        suggest_materials: ["Eletroduto galvanizado", "BAP e olhal para poste"],
        add_notes: ["Validar trabalho em altura, postes, rack outdoor e eventual necessidade de PTA/plataforma/andaime antes de fechar valores."]
      }
    },
    {
      code: "AFTER_HOURS_DIFFICULTY",
      name: "Execução fora do horário comercial aumenta premissa de esforço",
      description: "Propostas históricas citam execução em horário não comercial.",
      conditionJson: { field: "work_after_hours", operator: "==", value: true },
      actionJson: {
        suggest_groups: ["MANUTENCAO"],
        add_notes: ["Execução fora do horário comercial deve ser destacada como premissa e pode aumentar fator de dificuldade."]
      }
    }
  ];

  for (const rule of historicalRules) {
    await prisma.rule.upsert({
      where: { code: rule.code },
      update: { ...rule, active: true },
      create: rule
    });
  }

  const activePrompt = await prisma.aiPrompt.findFirst({ where: { active: true } });
  if (!activePrompt) {
    await prisma.aiPrompt.create({
      data: {
        name: "Prompt padrão Nitro Pricing",
        content: DEFAULT_AI_PROMPT,
        active: true,
        version: 1
      }
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
