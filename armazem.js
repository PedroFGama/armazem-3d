// Motor do armazém: geometria, empilhamento de caixas nos paletes e endereçamento.
//
// Layout (vista de cima): a DOCA fica em z = 0 (recebimento + expedição). Depois vem uma área de manobra
// (FZ) e então as filas de porta-paletes, que correm ao longo de z. Os blocos têm 2 filas "costas com
// costas"; entre os blocos há ruas (corredores). Cada fila tem M módulos; cada módulo tem 4 níveis e
// 2 posições de palete por nível (ou 1 posição DUPLA para itens maiores que o palete).
//
// Endereço:  F{fila}-M{módulo}-N{nível}-P{posição}   ex.: F2-M03-N1-P2
//
// Do produto ao palete (tudo com as medidas reais da planilha):
//   1. Caixa master  = agrupamento de "un" unidades no formato mais próximo de um cubo.
//   2. Arranjo       = quantas caixas cabem no palete (120 x 100 cm, altura máx. 120 cm), testando as duas
//                      orientações da caixa. Se a caixa não cabe no palete, usa posição dupla (250 x 100 cm).
//   3. Capacidade    = o menor entre o que cabe pela GEOMETRIA e o que o PESO permite (1000 kg por palete).
//   4. Estoque       = demanda diária x dias de cobertura  ->  caixas  ->  paletes (cheios + 1 parcial).
//
// Endereçamento ABC: os paletes são alocados na ordem da curva ABC (A primeiro) nas posições de menor
// "custo" = distância até a doca + penalidade do nível. Paletes pesados não vão para níveis altos.
(function (global) {
  const G = {
    NIVEIS_MAX: 6, POS: 2,                             // nº de níveis é configurável (cfg.N, de 1 a 6)
    AISLE: 3.2, DEPTH: 1.1, GAP: 0.1, BLOCK: 2.3, MOD: 2.7, FZ: 9, MARG: 1.5, BACK: 2,
    PAL_Z: 1.2, PAL_X: 1.0, PAL_H: 0.14,              // palete PBR (m): comprimento (ao longo do módulo), largura, altura
    ALT_CARGA: 1.2,                                    // altura máxima da carga (m)
    ZMAX: { 1: 120, 2: 250 }, XMAX: 100, HMAX: 120,    // espaço útil (cm) por tipo de posição (1 = simples, 2 = dupla)
    PESO_PAL: { 1: 1000, 2: 1600 },                    // kg por posição
    ALT_NIVEL: 1.5,
    PESO_NIVEL: [1000, 900, 700, 500, 400, 300],       // peso máximo do palete em cada nível (kg, posição simples)
    PEN_NIVEL: [0, 2.5, 6, 10, 14, 18]                 // penalidade de acesso por nível (equivale a metros)
  };

  // ---- Parâmetros fixos do armazém (vêm da aba "Parâmetros" da planilha; estes são os valores padrão) ----
  const PADRAO = {
    PALETE_COMPRIMENTO_CM: 120, PALETE_LARGURA_CM: 100, PALETE_ALTURA_CM: 14,
    CARGA_ALTURA_MAX_CM: 120, POSICAO_DUPLA_COMPRIMENTO_CM: 250,
    PESO_MAX_POSICAO_SIMPLES_KG: 1000, PESO_MAX_POSICAO_DUPLA_KG: 1600,
    PESO_MAX_N0_KG: 1000, PESO_MAX_N1_KG: 900, PESO_MAX_N2_KG: 700, PESO_MAX_N3_KG: 500, PESO_MAX_N4_KG: 400, PESO_MAX_N5_KG: 300,
    PENALIDADE_N0_M: 0, PENALIDADE_N1_M: 2.5, PENALIDADE_N2_M: 6, PENALIDADE_N3_M: 10, PENALIDADE_N4_M: 14, PENALIDADE_N5_M: 18,
    RUA_LARGURA_M: 3.2, FILA_PROFUNDIDADE_M: 1.1, FILAS_FOLGA_M: 0.1, MODULO_COMPRIMENTO_M: 2.7,
    DOCA_PROFUNDIDADE_M: 9, FUNDO_FOLGA_M: 2, NIVEL_ALTURA_M: 1.5,
    ABC_LIMITE_A_PCT: 80, ABC_LIMITE_B_PCT: 95,
    ABC_CRUZA_CLASSE_SEGUINTE: 1,                      // 1 = o item que cruza o limite vai para a classe seguinte (apostila); 0 = fica na anterior
    FATOR_IDA_VOLTA: 2                                 // percurso de uma retirada = ida e volta
  };
  const PODE_ZERO = k => /^PENALIDADE_|^FILAS_FOLGA_M$|^FUNDO_FOLGA_M$|^ABC_CRUZA_/.test(k);

  // Aplica um conjunto (parcial) de parâmetros; o que faltar usa o padrão. Devolve { params, limites, avisos }.
  function configurar(entrada = {}) {
    const p = { ...PADRAO }, avisos = [];
    for (const k of Object.keys(entrada)) {
      if (!(k in PADRAO)) continue;
      const v = Number(entrada[k]);
      if (Number.isFinite(v) && (v > 0 || (v === 0 && PODE_ZERO(k)))) p[k] = v;
      else avisos.push(`${k}: valor inválido (${entrada[k]}); usei o padrão ${PADRAO[k]}.`);
    }
    G.PAL_Z = p.PALETE_COMPRIMENTO_CM / 100; G.PAL_X = p.PALETE_LARGURA_CM / 100; G.PAL_H = p.PALETE_ALTURA_CM / 100;
    G.AISLE = p.RUA_LARGURA_M; G.GAP = p.FILAS_FOLGA_M; G.FZ = p.DOCA_PROFUNDIDADE_M; G.BACK = p.FUNDO_FOLGA_M; G.ALT_NIVEL = p.NIVEL_ALTURA_M;

    G.DEPTH = p.FILA_PROFUNDIDADE_M;
    if (G.DEPTH < G.PAL_X + 0.1) { G.DEPTH = G.PAL_X + 0.1; avisos.push(`Profundidade da fila ajustada para ${G.DEPTH.toFixed(2)} m (o palete tem ${G.PAL_X.toFixed(2)} m de largura).`); }
    G.BLOCK = 2 * G.DEPTH + G.GAP;
    G.MOD = p.MODULO_COMPRIMENTO_M;
    if (G.MOD < 2 * G.PAL_Z + 0.1) { G.MOD = 2 * G.PAL_Z + 0.1; avisos.push(`Comprimento do módulo ajustado para ${G.MOD.toFixed(2)} m (precisa caber 2 paletes de ${G.PAL_Z.toFixed(2)} m).`); }

    G.ZMAX = { 1: p.PALETE_COMPRIMENTO_CM, 2: p.POSICAO_DUPLA_COMPRIMENTO_CM };
    const zDuploMax = Math.floor(G.MOD * 100 - 10);
    if (G.ZMAX[2] > zDuploMax) { G.ZMAX[2] = zDuploMax; avisos.push(`Comprimento da posição dupla limitado a ${zDuploMax} cm (tamanho do módulo).`); }
    if (G.ZMAX[2] < G.ZMAX[1]) G.ZMAX[2] = G.ZMAX[1];
    G.XMAX = p.PALETE_LARGURA_CM;

    let h = p.CARGA_ALTURA_MAX_CM;
    const hMax = Math.floor((G.ALT_NIVEL - 0.1 - G.PAL_H) * 100);              // o que cabe entre uma longarina e a de cima
    if (h > hMax) { h = hMax; avisos.push(`Altura máxima da carga limitada a ${hMax} cm (altura entre níveis menos o palete).`); }
    G.HMAX = h; G.ALT_CARGA = h / 100;

    G.PESO_PAL = { 1: p.PESO_MAX_POSICAO_SIMPLES_KG, 2: Math.max(p.PESO_MAX_POSICAO_DUPLA_KG, p.PESO_MAX_POSICAO_SIMPLES_KG) };
    G.PESO_NIVEL = [0, 1, 2, 3, 4, 5].map(n => p['PESO_MAX_N' + n + '_KG']);
    G.PEN_NIVEL = [0, 1, 2, 3, 4, 5].map(n => p['PENALIDADE_N' + n + '_M']);

    let la = p.ABC_LIMITE_A_PCT, lb = p.ABC_LIMITE_B_PCT;
    if (!(la > 0 && la < lb && lb <= 100)) { la = PADRAO.ABC_LIMITE_A_PCT; lb = PADRAO.ABC_LIMITE_B_PCT; avisos.push('Limites da curva ABC inválidos; usei 80% e 95%.'); }
    G.IDA_VOLTA = p.FATOR_IDA_VOLTA;
    return { params: p, limites: { A: la, B: lb }, cruza: p.ABC_CRUZA_CLASSE_SEGUINTE >= 0.5 ? 'seguinte' : 'anterior', avisos };
  }
  configurar();

  // cfg = { B: nº de blocos (2 filas cada), M: módulos por fila, N: níveis por estante }
  const xA = k => G.MARG + G.AISLE / 2 + k * (G.AISLE + G.BLOCK);
  const filaX = f => {
    const ini = xA(f >> 1) + G.AISLE / 2;
    return f % 2 === 0 ? ini + G.DEPTH / 2 : ini + G.DEPTH + G.GAP + G.DEPTH / 2;
  };
  const ruaDe = f => xA((f >> 1) + (f % 2));
  const beamY = n => 0.1 + n * G.ALT_NIVEL;
  const dims = cfg => {
    const W = G.MARG * 2 + (cfg.B + 1) * G.AISLE + cfg.B * G.BLOCK;
    return { W, L: G.FZ + cfg.M * G.MOD + G.BACK, dockX: W / 2, filas: cfg.B * 2 };
  };
  const codigo = s => `F${s.f + 1}-M${String(s.m + 1).padStart(2, '0')}-N${s.n}-P${s.p + 1}`;

  function criarSlots(cfg) {
    const { dockX, filas } = dims(cfg), slots = [];
    for (let f = 0; f < filas; f++) for (let m = 0; m < cfg.M; m++)
      for (let n = 0; n < cfg.N; n++) for (let p = 0; p < G.POS; p++) {
        const gp = (G.MOD - 2 * G.PAL_Z) / 3;                                  // folga entre paletes dentro do módulo
        const z = G.FZ + m * G.MOD + (p === 0 ? gp + G.PAL_Z / 2 : 2 * gp + 1.5 * G.PAL_Z);
        const dist = Math.abs(ruaDe(f) - dockX) + z;
        const s = { i: slots.length, f, m, n, p, x: filaX(f), y: beamY(n) + 0.06, z, zMod: G.FZ + m * G.MOD + G.MOD / 2, acessoX: ruaDe(f), dist, score: dist + G.PEN_NIVEL[n] };
        s.codigo = codigo(s);
        slots.push(s);
      }
    return slots;
  }

  // ---- caixa master: agrupa "un" unidades no formato mais próximo de um cubo ----
  function caixaMaster(it) {
    const n = Math.max(1, Math.round(it.un || 1));
    if (n === 1) return { n, gx: 1, gy: 1, gz: 1, c: it.c, l: it.l, a: it.a, peso: it.peso };
    let best = null;
    for (let gx = 1; gx <= n; gx++) for (let gy = 1; gy <= n; gy++) {
      const gz = Math.ceil(n / (gx * gy));
      if (gx * gy * gz > n * 1.3) continue;
      const C = gx * it.c, L = gy * it.l, A = gz * it.a;
      const key = [Math.max(C, L, A), C * L * A];
      if (!best || key[0] < best.key[0] - 1e-9 || (Math.abs(key[0] - best.key[0]) < 1e-9 && key[1] < best.key[1])) best = { key, gx, gy, gz, c: C, l: L, a: A };
    }
    return { n, gx: best.gx, gy: best.gy, gz: best.gz, c: best.c, l: best.l, a: best.a, peso: n * it.peso * 1.03 + 0.2 };
  }

  // ---- arranjo da caixa no palete ----
  function arranjar(C, L, A) {
    const perms = [[C, L, A], [L, C, A], [C, A, L], [A, C, L], [L, A, C], [A, L, C]];   // as 2 primeiras = "este lado para cima"
    const tenta = (tipo, lista) => {
      let best = null;
      for (const [pz, px, ph] of lista) {
        const nz = Math.floor(G.ZMAX[tipo] / pz), nx = Math.floor(G.XMAX / px), ny = Math.floor(G.HMAX / ph);
        const cap = nz * nx * ny;
        if (cap > 0 && (!best || cap > best.cap)) best = { tipo, pz, px, ph, nz, nx, ny, cap, deitada: lista === perms };
      }
      return best;
    };
    const up = perms.slice(0, 2);
    return tenta(1, up) || tenta(2, up) || tenta(1, perms) || tenta(2, perms) ||
      { tipo: 2, pz: C, px: L, ph: A, nz: 1, nx: 1, ny: 1, cap: 1, fora: true };      // fora de gabarito (ocupa uma posição dupla)
  }

  function planejar(itens, dias) {
    const plano = new Map();
    for (const it of itens) {
      const cx = caixaMaster(it), arr = arranjar(cx.c, cx.l, cx.a);
      const estoque = Math.max(1, Math.ceil(it.qtd / 365 * dias));
      const caixas = Math.ceil(estoque / cx.n);
      const capPeso = Math.max(1, Math.floor(G.PESO_PAL[arr.tipo] / cx.peso));
      const cap = Math.min(arr.cap, capPeso);
      const paletes = [];
      for (let rest = caixas; rest > 0; rest -= cap) { const n = Math.min(cap, rest); paletes.push({ n, peso: n * cx.peso }); }
      plano.set(it.id, {
        id: it.id, estoque, caixas, cx, arr, cap, capGeo: arr.cap, capPeso,
        limitante: capPeso < arr.cap ? 'peso' : 'volume',
        paletes, peso: caixas * cx.peso, vol: caixas * cx.c * cx.l * cx.a / 1e6
      });
    }
    return plano;
  }

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ocup[i] = { id, k, n, peso, tipo } na posição principal; { ref } na 2ª metade de uma posição dupla
  function alocar(plano, ordemIds, ordemSlots, nSlots) {
    const ocup = new Array(nSlots).fill(null), sem = [];
    for (const id of ordemIds) {
      const pl = plano.get(id), tipo = pl.arr.tipo;
      pl.paletes.forEach((pal, k) => {
        const lim = tipo === 1 ? 1 : G.PESO_PAL[2] / G.PESO_PAL[1];
        const s = ordemSlots.find(s => !ocup[s.i] && pal.peso <= G.PESO_NIVEL[s.n] * lim &&
          (tipo === 1 || (s.p === 0 && !ocup[s.i + 1])));
        if (!s) { sem.push({ id, k }); return; }
        ocup[s.i] = { id, k, n: pal.n, peso: pal.peso, tipo };
        if (tipo === 2) ocup[s.i + 1] = { ref: s.i };
      });
    }
    return { ocup, sem };
  }

  function metricas(aloc, plano, itens, slots, nN) {
    const item = new Map(itens.map(i => [i.id, i]));
    let num = 0, den = 0, peso = 0, posOcup = 0, paletes = 0;
    const pesoNivel = Array(nN).fill(0), ocupNivel = Array(nN).fill(0), percursoPorItem = new Map();
    aloc.ocup.forEach((o, i) => {
      if (!o) return;
      const s = slots[i]; posOcup++; ocupNivel[s.n]++;
      if (o.ref !== undefined) return;
      // giro = retiradas por mês (linhas de separação), repartidas entre os paletes do SKU conforme as caixas de cada um
      const mov = item.get(o.id).giro * o.n / plano.get(o.id).caixas;
      num += mov * s.dist; den += mov; peso += o.peso; paletes++; pesoNivel[s.n] += o.peso;
      percursoPorItem.set(o.id, (percursoPorItem.get(o.id) || 0) + mov * s.dist * G.IDA_VOLTA);
    });
    const dist = den ? num / den : 0;
    return {
      dist,                                   // distância média por retirada, só ida (m)
      distIV: dist * G.IDA_VOLTA,             // idem, ida e volta
      percurso: num * G.IDA_VOLTA,            // percurso total no mês (m/mês, ida e volta)
      retiradas: den, percursoPorItem,
      ocupadas: posOcup, paletes, total: slots.length, peso, pesoNivel, ocupNivel, semEndereco: aloc.sem.length
    };
  }

  const CL = { A: 0, B: 1, C: 2, N: 3 };
  // Ordem em que os SKUs disputam as melhores posições: classe A, B, C (as classes vêm da planilha); dentro da classe, maior critério primeiro
  const ordemPorClasse = rows => [...rows].sort((a, b) => CL[a.classe] - CL[b.classe] || a.rank - b.rank).map(r => r.id);

  // Cenários:  giro / valor = "depois" (endereçamento pela curva ABC, critério giro ou valor);
  //            codigo = "antes" como na apostila (SKU k na posição k, em ordem do código, preenchendo módulo a módulo);
  //            aleatorio = "antes" sem critério (posição livre sorteada).
  function simular(analise, cfg, dias) {
    const itens = analise.itens, slots = criarSlots(cfg);
    const plano = planejar(itens, dias);
    const porScore = [...slots].sort((a, b) => a.score - b.score || a.i - b.i);
    const fisica = [...slots].sort((a, b) => a.m - b.m || a.n - b.n || a.f - b.f || a.p - b.p);
    const rnd = mulberry32(42), emb = [...slots];
    for (let i = emb.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [emb[i], emb[j]] = [emb[j], emb[i]]; }
    const porCodigo = [...itens].sort((a, b) => String(a.cod).localeCompare(String(b.cod), 'pt', { numeric: true })).map(i => i.id);
    const rodar = (ids, ordem) => { const a = alocar(plano, ids, ordem, slots.length); return { ...a, met: metricas(a, plano, itens, slots, cfg.N) }; };
    return {
      cfg, dias, slots, plano,
      cenarios: {
        giro: rodar(ordemPorClasse(analise.giro), porScore),
        valor: rodar(ordemPorClasse(analise.valor), porScore),
        codigo: rodar(porCodigo, fisica),
        aleatorio: rodar(itens.map(i => i.id), emb)
      }
    };
  }

  const api = { G, PADRAO, configurar, xA, filaX, ruaDe, beamY, dims, criarSlots, caixaMaster, arranjar, planejar, alocar, metricas, simular };
  global.ARM = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
