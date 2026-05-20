const SECTION_RULES = [
  {
    key: "categorias",
    patterns: [/categor[ií]as?/i, /clasificaci[oó]n/i, /personal obrero/i, /oficial especializado/i, /medio oficial/i, /ayudante/i],
  },
  {
    key: "adicionales",
    patterns: [/adicional/i, /antig[uü]edad/i, /presentismo/i, /vi[aá]tico/i, /plus/i, /bonificaci[oó]n/i],
  },
  {
    key: "escalas",
    patterns: [/escalas? salariales?/i, /escala salarial/i, /remuneraciones?/i, /b[aá]sicos?/i, /salarios?/i, /jornal(?:es)?/i],
  },
  {
    key: "formulas",
    patterns: [/f[oó]rmulas?/i, /c[aá]lculo/i, /porcentaje/i, /coeficiente/i, /base de c[aá]lculo/i, /sobre el b[aá]sico/i],
  },
  {
    key: "zonas",
    patterns: [/zona desfavorable/i, /adicional por zona/i, /zona patag[oó]nica/i, /zona austral/i, /zona/i],
  },
  {
    key: "articulosImportantes",
    patterns: [/art[íi]culo\s+\d+/i, /cl[aá]usula/i, /disposiciones?/i, /condiciones? generales/i],
  },
];

const OUTPUT_KEYS = ["categorias", "adicionales", "escalas", "formulas", "zonas"];

const cleanText = (value) => (
  value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
);

const splitBlocks = (text) => (
  cleanText(text)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
);

const scoreBlock = (block, patterns) => {
  let score = 0;

  patterns.forEach((pattern) => {
    if (pattern.test(block)) {
      score += 1;
    }
  });

  return score;
};

const buildMatch = (block, pageNumber, score) => ({
  pageNumber,
  score,
  title: block.split("\n")[0].slice(0, 120),
  text: block.slice(0, 800),
});

export const detectConvenioBlocks = (documentData) => {
  const debug = {};
  const detected = {
    categorias: [],
    adicionales: [],
    escalas: [],
    formulas: [],
    zonas: [],
  };

  SECTION_RULES.forEach((rule) => {
    debug[rule.key] = [];
  });

  documentData.pages.forEach((page) => {
    const blocks = splitBlocks(page.text);

    blocks.forEach((block) => {
      SECTION_RULES.forEach((rule) => {
        const score = scoreBlock(block, rule.patterns);

        if (score > 0) {
          const match = buildMatch(block, page.pageNumber, score);
          debug[rule.key].push(match);

          if (OUTPUT_KEYS.includes(rule.key)) {
            detected[rule.key].push(match);
          }
        }
      });
    });
  });

  Object.entries(debug).forEach(([key, matches]) => {
    console.info(`[convenio-detector] ${key}: ${matches.length} bloque(s) detectado(s)`);
  });

  return {
    ...detected,
    debug,
  };
};
