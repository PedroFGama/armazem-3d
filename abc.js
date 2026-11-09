// Curva ABC pelo método da apostila (Logística 2, cap. 3 e 4).
//
// Passo a passo:
//   1. Critério:  VALOR de consumo = demanda anual x custo   (política de estoque, proteção do capital)
//                 GIRO = retiradas por mês                    (slotting: posição no armazém)
//   2. Calcular o valor de cada item e o total.
//   3. Ordenar do maior para o menor (empate: menor código).
//   4. % do total e % acumulado.
//   5. Cortes: A se o % acumulado (já incluindo o item) <= 80%; B se <= 95%; C o resto.
//      Convenção da apostila: o item que CRUZA o limite cai na classe SEGUINTE
//      (a convenção alternativa — o item que cruza fica na anterior — é um parâmetro da planilha).
//   6. Classificar.
//
// "ABC duplo": o mesmo SKU é classificado duas vezes (valor e giro) e cai numa célula da matriz 3x3.
//
// A classe que vale no app é a que vier da PLANILHA (colunas "Classe valor" e "Classe giro").
// O app também calcula a classe pelo método acima, só para conferir (gabarito).
(function (global) {
  const LIMITES = { A: 80, B: 95 };
  const EPS = 1e-9;
  const ORDEM = { A: 0, B: 1, C: 2, N: 3 };

  const classeValida = v => { const s = String(v ?? '').trim().toUpperCase(); return s === 'A' || s === 'B' || s === 'C' ? s : ''; };

  function preparar(dados) {
    return dados.map((d, id) => {
      const retEstimado = !(d.ret > 0);
      return {
        ...d, id,
        cod: d.cod || 'SKU' + String(id + 1).padStart(3, '0'),
        cat: d.cat || '',
        c: d.c ?? 20, l: d.l ?? 20, a: d.a ?? 20, peso: d.peso ?? 1, un: d.un ?? 1,
        ret: retEstimado ? d.qtd / 12 : d.ret,           // se a planilha não trouxer retiradas, usa demanda/12
        retEstimado,
        valor: d.preco * d.qtd,                          // valor de consumo anual (R$)
        giro: retEstimado ? d.qtd / 12 : d.ret,          // retiradas por mês
        cv: classeValida(d.cv), cg: classeValida(d.cg)   // classes preenchidas na planilha (podem estar vazias)
      };
    });
  }

  // chave: 'valor' ou 'giro'. cruza: 'seguinte' (apostila) ou 'anterior'
  function classificar(itens, chave, limites = LIMITES, cruza = 'seguinte') {
    const total = itens.reduce((s, i) => s + i[chave], 0);
    const ordenado = [...itens].sort((a, b) => b[chave] - a[chave] || String(a.cod).localeCompare(String(b.cod)));
    let acum = 0;
    return ordenado.map((it, idx) => {
      const antes = acum, pct = (it[chave] / total) * 100;
      acum += pct;
      const classe = cruza === 'seguinte'
        ? (acum <= limites.A + EPS ? 'A' : acum <= limites.B + EPS ? 'B' : 'C')
        : (antes < limites.A - EPS ? 'A' : antes < limites.B - EPS ? 'B' : 'C');
      return { ...it, base: it[chave], rank: idx + 1, pct, acum, classeCalc: classe, classe };
    });
  }

  function resumo(rows) {
    const total = rows.reduce((s, i) => s + i.base, 0), n = rows.length, out = {};
    for (const c of ['A', 'B', 'C', 'N']) {
      const g = rows.filter(i => i.classe === c), soma = g.reduce((s, i) => s + i.base, 0);
      out[c] = { itens: g.length, pctItens: n ? g.length / n * 100 : 0, soma, pctCriterio: total ? soma / total * 100 : 0 };
    }
    return out;
  }

  // Matriz 3x3 (linhas = classe de valor, colunas = classe de giro) e taxa de concordância (diagonal)
  function matriz(porValor, porGiro) {
    const cg = new Map(porGiro.map(i => [i.id, i.classe]));
    const m = { A: { A: 0, B: 0, C: 0 }, B: { A: 0, B: 0, C: 0 }, C: { A: 0, B: 0, C: 0 } };
    let n = 0, diag = 0;
    porValor.forEach(i => {
      const g = cg.get(i.id);
      if (!(i.classe in m) || !(g in m[i.classe])) return;                // ignora SKUs sem classe
      m[i.classe][g]++; n++; if (i.classe === g) diag++;
    });
    return { m, n, concordancia: n ? diag / n * 100 : 0 };
  }

  // opc = { limites, cruza }
  function analisar(dados, opc = {}) {
    const limites = opc.limites || LIMITES, cruza = opc.cruza || 'seguinte';
    const itens = preparar(dados);
    const calc = { valor: classificar(itens, 'valor', limites, cruza), giro: classificar(itens, 'giro', limites, cruza) };
    const usaPlanilha = { valor: itens.some(i => i.cv), giro: itens.some(i => i.cg) };
    const out = { itens, limites, cruza, usaPlanilha, conferencia: {}, semClasse: {} };
    for (const k of ['valor', 'giro']) {
      const sk = k === 'valor' ? 'cv' : 'cg';
      out[k] = calc[k].map(r => {
        const planilha = r[sk];
        return { ...r, classePlanilha: planilha, classe: usaPlanilha[k] ? (planilha || 'N') : r.classeCalc };
      });
      out.conferencia[k] = usaPlanilha[k] ? out[k].filter(r => r.classePlanilha && r.classePlanilha !== r.classeCalc) : [];
      out.semClasse[k] = usaPlanilha[k] ? out[k].filter(r => !r.classePlanilha).length : 0;
    }
    out.resumo = { valor: resumo(out.valor), giro: resumo(out.giro) };
    const mx = matriz(out.valor, out.giro);
    out.matriz = mx.m; out.matrizN = mx.n; out.concordancia = mx.concordancia;
    return out;
  }

  // Ordem em que os SKUs disputam as melhores posições: classe A, depois B, depois C (sem classe por último);
  // dentro da classe, maior valor do critério primeiro (popularidade).
  const ordemAlocacao = rows => [...rows].sort((a, b) => ORDEM[a.classe] - ORDEM[b.classe] || a.rank - b.rank).map(r => r.id);

  const api = { LIMITES, preparar, classificar, resumo, matriz, analisar, ordemAlocacao, classeValida };
  global.ABC = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
