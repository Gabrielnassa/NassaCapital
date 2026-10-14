'use strict';

/* =========================================================
   Meu DCA — app estático, dados apenas no localStorage.
   Nenhum dado pessoal fica neste arquivo.
   ========================================================= */

const ASSETS = [
  { sym: 'BTC', id: 'bitcoin', name: 'Bitcoin', color: '#f7931a' },
  { sym: 'ETH', id: 'ethereum', name: 'Ethereum', color: '#627eea' },
  { sym: 'SOL', id: 'solana', name: 'Solana', color: '#14b8a6' },
  { sym: 'RENDER', id: 'render-token', name: 'Render', color: '#e5484d' },
  { sym: 'AVAX', id: 'avalanche-2', name: 'Avalanche', color: '#9ca3af' },
];
const SYMS = ASSETS.map(a => a.sym);
const ASSET = Object.fromEntries(ASSETS.map(a => [a.sym, a]));

const DATA_KEY = 'meudca:data:v1';
const PRICE_KEY = 'meudca:prices:v1';
const PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=' +
  ASSETS.map(a => a.id).join(',') + '&vs_currencies=usd,brl';

/* ---------- Utilidades ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function num(v, fallback = 0) {
  const n = typeof v === 'number' ? v : parseNum(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Aceita "1.234,56", "1234,56", "1234.56". */
function parseNum(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/\s|R\$|US\$|\$/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  return /^-?\d*\.?\d+$/.test(s) || /^-?\d+\.?$/.test(s) ? Number(s) : NaN;
}

const round2 = v => Math.round((v + Number.EPSILON) * 100) / 100;

const nfCache = {};
function nf(min, max) {
  const k = min + ':' + max;
  return nfCache[k] || (nfCache[k] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max }));
}
const fmtUSD = v => 'US$ ' + nf(2, 2).format(v || 0);
const fmtBRL = v => 'R$ ' + nf(2, 2).format(v || 0);
const fmtQty = v => nf(0, 8).format(v || 0);
const fmtPct = (v, signed = false) => (signed && v > 0 ? '+' : '') + nf(1, 1).format(v || 0) + '%';
const fmtPP = v => (v > 0 ? '+' : '') + nf(1, 1).format(v) + ' p.p.';
function fmtPrice(v) {
  if (!v) return 'US$ 0,00';
  if (v >= 100) return 'US$ ' + nf(2, 2).format(v);
  if (v >= 1) return 'US$ ' + nf(2, 4).format(v);
  return 'US$ ' + nf(4, 6).format(v);
}
/** Valor para preencher um input (vírgula decimal, sem milhar). */
function inputVal(v, maxDec = 2) {
  if (!Number.isFinite(v) || v === 0) return '';
  return String(Number(v.toFixed(maxDec))).replace('.', ',');
}

function pad(n) { return String(n).padStart(2, '0'); }
function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayISO() { return toISO(new Date()); }
function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmtDate(s) {
  const d = parseISO(s);
  return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : '—';
}
function fmtDateTime(ts) {
  const d = new Date(ts);
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function fmtMonth(d) { return MONTHS[d.getMonth()] + '/' + d.getFullYear(); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function storageGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

let toastTimer;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('err', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Estado ---------- */

function defaults() {
  return {
    config: {
      weeklyUSD: 50,
      startDate: todayISO(),
      targets: { BTC: 50, ETH: 25, SOL: 15, RENDER: 10, AVAX: 0 },
      renda: 0,
      gastos: 0,
      metaReserva: 0,
      metaLataria: 0,
      split: 50,
    },
    initial: Object.fromEntries(SYMS.map(s => [s, { qty: 0, cost: 0 }])),
    purchases: [],
    goals: { reserva: 0, lataria: 0, updatedAt: null },
    goalLog: [],
  };
}

/** Garante o formato esperado, aceitando backups parciais. */
function normalize(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const c = raw.config || {};
  d.config.weeklyUSD = num(c.weeklyUSD, d.config.weeklyUSD);
  d.config.startDate = parseISO(c.startDate) ? c.startDate : d.config.startDate;
  if (c.targets && typeof c.targets === 'object') {
    for (const s of SYMS) d.config.targets[s] = num(c.targets[s], 0);
  }
  for (const k of ['renda', 'gastos', 'metaReserva', 'metaLataria', 'split']) {
    d.config[k] = num(c[k], d.config[k]);
  }
  d.config.split = Math.min(100, Math.max(0, d.config.split));

  const ini = raw.initial || {};
  for (const s of SYMS) {
    const i = ini[s] || {};
    d.initial[s] = { qty: num(i.qty, 0), cost: num(i.cost, 0) };
  }

  if (Array.isArray(raw.purchases)) {
    d.purchases = raw.purchases
      .filter(p => p && parseISO(p.date) && p.items && typeof p.items === 'object')
      .map(p => {
        const items = {};
        for (const s of SYMS) {
          const it = p.items[s];
          if (!it) continue;
          const usd = num(it.usd, 0);
          const price = num(it.price, 0);
          const qty = it.qty != null ? num(it.qty, 0) : (price > 0 ? usd / price : 0);
          if (usd > 0 || qty > 0) items[s] = { usd, price, qty };
        }
        return { id: String(p.id || uid()), date: p.date, fx: num(p.fx, 0), items };
      })
      .filter(p => Object.keys(p.items).length);
  }

  const g = raw.goals || {};
  d.goals = { reserva: num(g.reserva, 0), lataria: num(g.lataria, 0), updatedAt: g.updatedAt || null };

  // goalLog: lançamentos da reserva e da lataria. Aceita o antigo reserveLog.
  const logSrc = Array.isArray(raw.goalLog) ? raw.goalLog : Array.isArray(raw.reserveLog) ? raw.reserveLog : [];
  d.goalLog = logSrc
    .filter(m => m && parseISO(m.date) && ['dep', 'ret', 'ajuste'].includes(m.type))
    .map(m => ({
      id: String(m.id || uid()), date: m.date,
      goal: m.goal === 'lataria' ? 'lataria' : 'reserva',
      type: m.type, amount: round2(num(m.amount, 0)), note: String(m.note || '').slice(0, 80),
    }))
    .filter(m => m.amount !== 0);
  return d;
}

let data = normalize(storageGet(DATA_KEY));
let prices = storageGet(PRICE_KEY); // { usd: {BTC:..}, fx, at }
let priceStatus = prices ? 'cache' : 'none'; // none | loading | ok | cache | error

function save() {
  if (!storageSet(DATA_KEY, data)) toast('Não foi possível salvar no navegador.', true);
}

function hasPrices() { return !!(prices && prices.usd && prices.usd.BTC > 0); }
function currentFx() {
  if (prices && prices.fx > 0) return prices.fx;
  const last = sortedPurchases()[0];
  return last && last.fx > 0 ? last.fx : 0;
}

/* ---------- Preços ---------- */

/** Na tela Comprar, só atualiza a linha de preços e os campos não editados. */
function afterPriceChange() {
  const form = $('#buy-form');
  if (activeTab !== 'comprar' || !form) { renderActive(); return; }
  $('#tab-comprar .card').innerHTML = priceLine();
  if (hasPrices()) {
    const fx = $('#buy-fx');
    if (!fx.dataset.touched) fx.value = inputVal(prices.fx, 4);
    for (const box of $$('.buy-asset', form)) {
      const inp = $('[data-field="price"]', box);
      if (!inp.dataset.touched) inp.value = inputVal(prices.usd[box.dataset.sym], 8);
    }
  }
  updateBuyTotals();
}

async function refreshPrices() {
  priceStatus = 'loading';
  afterPriceChange();
  try {
    const res = await fetch(PRICE_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const usd = {}, brl = {};
    for (const a of ASSETS) {
      usd[a.sym] = num(j[a.id] && j[a.id].usd, 0);
      brl[a.sym] = num(j[a.id] && j[a.id].brl, 0);
    }
    if (!(usd.BTC > 0 && brl.BTC > 0)) throw new Error('Resposta sem preço do BTC');
    // Mantém o último preço conhecido de um ativo que venha faltando.
    if (prices && prices.usd) {
      for (const s of SYMS) if (!(usd[s] > 0) && prices.usd[s] > 0) usd[s] = prices.usd[s];
    }
    prices = { usd, fx: brl.BTC / usd.BTC, at: Date.now() };
    storageSet(PRICE_KEY, prices);
    priceStatus = 'ok';
  } catch (err) {
    priceStatus = hasPrices() ? 'cache' : 'error';
    toast(hasPrices() ? 'Falha ao atualizar. Usando os últimos preços salvos.' : 'Não foi possível buscar os preços.', true);
  }
  afterPriceChange();
}

/* ---------- Cálculos ---------- */

function sortedPurchases() {
  return data.purchases.slice().sort((a, b) => (b.date.localeCompare(a.date)) || (b.id < a.id ? -1 : 1));
}

function portfolio() {
  const t = data.config.targets;
  const rows = ASSETS.map(a => {
    let qty = data.initial[a.sym].qty;
    let cost = data.initial[a.sym].cost;
    for (const p of data.purchases) {
      const it = p.items[a.sym];
      if (it) { qty += it.qty; cost += it.usd; }
    }
    const price = hasPrices() ? (prices.usd[a.sym] || 0) : 0;
    const value = qty * price;
    return {
      ...a, qty, cost, price, value,
      avg: qty > 0 ? cost / qty : 0,
      result: value - cost,
      resultPct: cost > 0 ? (value - cost) / cost * 100 : 0,
      target: t[a.sym] || 0,
    };
  });
  const total = rows.reduce((s, r) => s + r.value, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  for (const r of rows) {
    r.pct = total > 0 ? r.value / total * 100 : 0;
    r.dev = r.pct - r.target;
  }
  return { rows, total, cost, result: total - cost, resultPct: cost > 0 ? (total - cost) / cost * 100 : 0 };
}

function nextPurchaseDate() {
  const today = parseISO(todayISO());
  const start = parseISO(data.config.startDate) || today;
  const d = new Date(Math.max(today.getTime(), start.getTime()));
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  if (toISO(d) === todayISO() && data.purchases.some(p => p.date === todayISO())) d.setDate(d.getDate() + 7);
  return d;
}

/**
 * Divide o aporte entre os ativos abaixo do alvo, proporcional ao déficit:
 * déficit = alvo% × (total atual + aporte) − valor atual. Nunca vende.
 * Arredonda em centavos mantendo o total exato.
 */
function suggestSplit(aporte) {
  const pf = portfolio();
  const elig = pf.rows.filter(r => r.target > 0);
  let weights = [];
  if (hasPrices() && pf.total > 0) {
    const after = pf.total + aporte;
    weights = elig
      .filter(r => r.pct < r.target)
      .map(r => ({ sym: r.sym, w: Math.max(0, r.target / 100 * after - r.value) }))
      .filter(x => x.w > 0);
  }
  if (!weights.length) weights = elig.map(r => ({ sym: r.sym, w: r.target }));
  const sumW = weights.reduce((s, x) => s + x.w, 0);
  const out = Object.fromEntries(SYMS.map(s => [s, 0]));
  if (!(sumW > 0) || !(aporte > 0)) return out;

  const cents = Math.round(aporte * 100);
  const parts = weights.map(x => {
    const raw = x.w / sumW * cents;
    return { sym: x.sym, c: Math.floor(raw), frac: raw - Math.floor(raw) };
  });
  let rest = cents - parts.reduce((s, p) => s + p.c, 0);
  parts.slice().sort((a, b) => b.frac - a.frac).forEach(p => { if (rest > 0) { p.c++; rest--; } });
  for (const p of parts) out[p.sym] = p.c / 100;
  return out;
}

function monthlyFlow() {
  const c = data.config;
  const fx = currentFx();
  const aporteBRL = c.weeklyUSD * fx * 52 / 12;
  const sobra = c.renda - c.gastos - aporteBRL;
  const reservaDone = c.metaReserva > 0 ? data.goals.reserva >= c.metaReserva : true;
  // Em centavos: a parte da lataria é o resto, para a soma bater com a sobra.
  const toReserva = sobra > 0 && !reservaDone ? round2(sobra * c.split / 100) : 0;
  const toLataria = sobra > 0 ? round2(round2(sobra) - toReserva) : 0;
  return { fx, aporteBRL, sobra, toReserva, toLataria, reservaDone };
}

/** Simula mês a mês até cada meta fechar (máx. 50 anos). */
function forecast() {
  const c = data.config;
  const { sobra } = monthlyFlow();
  let r = data.goals.reserva, l = data.goals.lataria;
  const res = { reserva: null, lataria: null };
  const now = new Date();
  const monthAt = i => new Date(now.getFullYear(), now.getMonth() + i, 1);
  if (c.metaReserva > 0 && r >= c.metaReserva) res.reserva = 'done';
  if (c.metaLataria > 0 && l >= c.metaLataria) res.lataria = 'done';
  if (!(sobra > 0)) return res;
  for (let i = 0; i < 600 && (!res.reserva || !res.lataria); i++) {
    let toR = 0;
    if (c.metaReserva > 0 && r < c.metaReserva) {
      toR = Math.min(sobra * c.split / 100, c.metaReserva - r);
    }
    r += toR;
    l += sobra - toR;
    if (!res.reserva && c.metaReserva > 0 && r >= c.metaReserva - 0.005) res.reserva = monthAt(i);
    if (!res.lataria && c.metaLataria > 0 && l >= c.metaLataria - 0.005) res.lataria = monthAt(i);
    if (!c.metaReserva) res.reserva = res.reserva || 'none';
    if (!c.metaLataria) res.lataria = res.lataria || 'none';
  }
  return res;
}

/* ---------- Renderização ---------- */

let activeTab = 'inicio';

function renderActive() {
  const fn = { inicio: renderInicio, comprar: renderComprar, reserva: renderReserva, metas: renderMetas, historico: renderHistorico, ajustes: renderAjustes }[activeTab];
  fn();
}

function showTab(tab) {
  if (!['inicio', 'comprar', 'reserva', 'metas', 'historico', 'ajustes'].includes(tab)) tab = 'inicio';
  activeTab = tab;
  for (const sec of $$('.tab')) sec.hidden = sec.id !== 'tab-' + tab;
  for (const b of $$('.tabbar button')) {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  const titles = { inicio: 'Meu DCA', comprar: 'Comprar', reserva: 'Reserva', metas: 'Metas', historico: 'Histórico', ajustes: 'Ajustes' };
  $('#title').textContent = titles[tab];
  renderActive();
  window.scrollTo(0, 0);
}

function priceLine() {
  let info;
  if (priceStatus === 'loading') info = 'Atualizando preços…';
  else if (!hasPrices()) info = '<span class="warn">Sem preços. Toque em atualizar.</span>';
  else {
    const when = 'Preços de ' + fmtDateTime(prices.at);
    info = priceStatus === 'cache' || priceStatus === 'error'
      ? '<span class="warn">' + when + ' (salvos)</span>'
      : when;
  }
  return `<div class="price-line"><span>${info}</span>
    <button class="btn small" data-action="refresh" ${priceStatus === 'loading' ? 'disabled' : ''}>↻ Atualizar</button></div>`;
}

function devBadge(r) {
  if (r.target === 0) return '<span class="badge">fora do plano</span>';
  if (!hasPrices()) return '';
  const a = Math.abs(r.dev);
  if (a <= 2) return '<span class="badge ok">no alvo</span>';
  return `<span class="badge ${a > 10 ? 'bad' : 'mid'}">${fmtPP(r.dev)}</span>`;
}

function donutSVG(rows, total) {
  const R1 = 52, R2 = 36, C = 70;
  const ring = (r, values, width) => {
    const circ = 2 * Math.PI * r;
    const sum = values.reduce((s, v) => s + v.v, 0);
    if (!(sum > 0)) return `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${width}"/>`;
    let off = 0;
    return values.filter(v => v.v > 0).map(v => {
      const len = v.v / sum * circ;
      const gap = values.filter(x => x.v > 0).length > 1 ? Math.min(1.5, len / 3) : 0;
      const seg = `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="${v.color}" stroke-width="${width}"
        stroke-dasharray="${Math.max(0, len - gap)} ${circ}" stroke-dashoffset="${-off}" transform="rotate(-90 ${C} ${C})"/>`;
      off += len;
      return seg;
    }).join('');
  };
  const outer = ring(R1, rows.map(r => ({ v: r.value, color: r.color })), 14);
  const inner = ring(R2, rows.map(r => ({ v: r.target, color: r.color })), 8);
  return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="Alocação atual (anel externo) e alvo (anel interno)">
    ${outer}${inner}
    <text x="${C}" y="${C - 2}" text-anchor="middle" font-size="9" opacity=".65">atual × alvo</text>
    <text x="${C}" y="${C + 11}" text-anchor="middle" font-size="11" font-weight="700">${total > 0 ? 'US$ ' + nf(0, 0).format(total) : '—'}</text>
  </svg>`;
}

function renderInicio() {
  const el = $('#tab-inicio');
  const pf = portfolio();
  const fx = currentFx();
  const priced = hasPrices();
  const next = nextPurchaseDate();
  const nextLabel = toISO(next) === todayISO() ? 'hoje (segunda)' : 'segunda, ' + fmtDate(toISO(next));
  const resCls = pf.result >= 0 ? 'pos' : 'neg';

  const assetRows = pf.rows
    .filter(r => r.qty > 0 || r.target > 0)
    .map(r => `
      <div class="asset">
        <div class="asset-head">
          <span class="dot" style="background:${r.color}"></span>
          <span class="sym">${r.sym}</span>
          ${devBadge(r)}
          <span class="val num">${priced ? fmtUSD(r.value) : '—'}</span>
        </div>
        <div class="kv num">
          <div><span>Qtd.</span><span>${fmtQty(r.qty)}</span></div>
          <div><span>Preço</span><span>${priced ? fmtPrice(r.price) : '—'}</span></div>
          <div><span>Médio</span><span>${r.qty > 0 ? fmtPrice(r.avg) : '—'}</span></div>
          <div><span>Resultado</span><span class="${r.result >= 0 ? 'pos' : 'neg'}">${priced && r.cost > 0 ? fmtPct(r.resultPct, true) : '—'}</span></div>
          <div><span>Atual</span><span>${priced ? fmtPct(r.pct) : '—'}</span></div>
          <div><span>Alvo</span><span>${fmtPct(r.target)}</span></div>
        </div>
      </div>`).join('');

  el.innerHTML = `
    <div class="card">
      <div class="muted small">Valor total</div>
      <div class="hero-value num">${priced ? fmtUSD(pf.total) : '—'}</div>
      <div class="hero-sub num">${priced && fx ? fmtBRL(pf.total * fx) : '—'}</div>
      <div class="stats">
        <div class="stat"><div class="label">Investido</div><div class="value num">${fmtUSD(pf.cost)}</div></div>
        <div class="stat"><div class="label">Resultado</div><div class="value num ${priced && pf.cost > 0 ? resCls : ''}">${priced && pf.cost > 0 ? fmtPct(pf.resultPct, true) : '—'}</div></div>
      </div>
      <div class="next-buy">Próxima compra: <strong>${nextLabel}</strong></div>
    </div>

    <div class="card">${priceLine()}${priced ? `<div class="small muted" style="margin-top:4px">Dólar: ${fmtBRL(fx)}</div>` : ''}</div>

    <div class="card">
      <h2>Alocação</h2>
      <div class="donut-wrap">
        ${donutSVG(pf.rows, priced ? pf.total : 0)}
        <ul class="legend">
          ${pf.rows.filter(r => r.qty > 0 || r.target > 0).map(r => `
            <li><span class="sw" style="background:${r.color}"></span><span class="nm">${r.sym}</span>
            <span class="pc num">${priced ? fmtPct(r.pct) : '—'} <span class="muted">/ ${fmtPct(r.target)}</span></span></li>`).join('')}
        </ul>
      </div>
    </div>

    <div class="card">
      <h2>Ativos</h2>
      ${assetRows}
      <details class="legend-help">
        <summary>O que significam as etiquetas?</summary>
        <p>A etiqueta mostra a diferença entre o peso atual do ativo na carteira e o alvo, em <b>pontos percentuais (p.p.)</b>. Ex.: atual 36,7% e alvo 15% = <b>+21,7 p.p.</b></p>
        <ul>
          <li><span class="badge ok">no alvo</span> até 2 p.p. de diferença</li>
          <li><span class="badge mid">±5,0 p.p.</span> entre 2 e 10 p.p.</li>
          <li><span class="badge bad">±15,0 p.p.</span> mais de 10 p.p.</li>
          <li><span class="badge">fora do plano</span> alvo 0%, não comprar mais</li>
        </ul>
        <p><b>+</b> = acima do alvo (não recebe aporte) · <b>−</b> = abaixo do alvo (o "Sugerir divisão" manda o dinheiro para ele). Não é preciso vender: as compras semanais equilibram a carteira.</p>
        <p><b>Médio</b>: preço médio que você pagou · <b>Resultado</b>: ganho ou perda no ativo · <b>Atual / Alvo</b>: peso hoje e peso desejado na carteira.</p>
      </details>
    </div>`;
}

/* ---- Comprar ---- */

function renderComprar() {
  const el = $('#tab-comprar');
  const fx = currentFx();
  const buyable = ASSETS.filter(a => (data.config.targets[a.sym] || 0) > 0);
  el.innerHTML = `
    <div class="card">${priceLine()}</div>
    <form class="card" id="buy-form" novalidate>
      <div class="row">
        <div class="field"><label for="buy-date">Data</label><input type="date" id="buy-date" value="${todayISO()}" required></div>
        <div class="field"><label for="buy-fx">Dólar (R$)</label><input type="text" inputmode="decimal" id="buy-fx" value="${inputVal(fx, 4)}" placeholder="0,00"></div>
      </div>
      <button type="button" class="btn block" data-action="suggest">Sugerir divisão de ${fmtUSD(data.config.weeklyUSD)}</button>
      ${buyable.length ? buyable.map(a => `
        <div class="buy-asset" data-sym="${a.sym}">
          <div class="asset-head"><span class="dot" style="background:${a.color}"></span><span class="sym">${a.sym}</span>
            <span class="muted small">alvo ${fmtPct(data.config.targets[a.sym])}</span></div>
          <div class="row">
            <div><label for="usd-${a.sym}">Valor (US$)</label><input type="text" inputmode="decimal" id="usd-${a.sym}" data-field="usd" placeholder="0,00"></div>
            <div><label for="price-${a.sym}">Preço pago (US$)</label><input type="text" inputmode="decimal" id="price-${a.sym}" data-field="price" value="${hasPrices() ? inputVal(prices.usd[a.sym], 8) : ''}" placeholder="0,00"></div>
          </div>
          <div class="qty num">Quantidade: <span data-qty>0</span></div>
        </div>`).join('') : '<p class="muted">Nenhum ativo com alvo maior que 0%. Ajuste a alocação em Ajustes.</p>'}
      <div class="total-line"><span class="muted">Total</span><span class="num"><strong id="buy-total">US$ 0,00</strong> <span class="muted small" id="buy-total-brl"></span></span></div>
      <button type="submit" class="btn primary block">Registrar compra</button>
    </form>`;
  updateBuyTotals();
}

function readBuyForm() {
  const items = {};
  for (const box of $$('#buy-form .buy-asset')) {
    const usd = parseNum($('[data-field="usd"]', box).value);
    const price = parseNum($('[data-field="price"]', box).value);
    items[box.dataset.sym] = { usd, price };
  }
  return { date: $('#buy-date').value, fx: parseNum($('#buy-fx').value), items };
}

function updateBuyTotals() {
  const form = $('#buy-form');
  if (!form) return;
  const f = readBuyForm();
  let total = 0;
  for (const box of $$('.buy-asset', form)) {
    const it = f.items[box.dataset.sym];
    const ok = it.usd > 0 && it.price > 0;
    $('[data-qty]', box).textContent = ok ? fmtQty(it.usd / it.price) : '0';
    if (it.usd > 0) total += it.usd;
  }
  $('#buy-total').textContent = fmtUSD(total);
  $('#buy-total-brl').textContent = f.fx > 0 && total > 0 ? '≈ ' + fmtBRL(total * f.fx) : '';
}

function submitBuy(ev) {
  ev.preventDefault();
  const f = readBuyForm();
  const errors = [];
  $$('#buy-form input').forEach(i => i.classList.remove('invalid'));
  if (!parseISO(f.date)) { errors.push('data'); $('#buy-date').classList.add('invalid'); }
  if (!(f.fx > 0)) { errors.push('dólar'); $('#buy-fx').classList.add('invalid'); }
  const items = {};
  for (const [sym, it] of Object.entries(f.items)) {
    const filled = $('#usd-' + sym).value.trim() !== '';
    if (!filled) continue;
    if (!(it.usd > 0)) { $('#usd-' + sym).classList.add('invalid'); errors.push(sym); continue; }
    if (!(it.price > 0)) { $('#price-' + sym).classList.add('invalid'); errors.push(sym); continue; }
    const usd = round2(it.usd);
    items[sym] = { usd, price: it.price, qty: usd / it.price };
  }
  if (errors.length) { toast('Confira os campos destacados.', true); return; }
  if (!Object.keys(items).length) { toast('Informe o valor de pelo menos um ativo.', true); return; }
  data.purchases.push({ id: uid(), date: f.date, fx: f.fx, items });
  save();
  const total = Object.values(items).reduce((s, i) => s + i.usd, 0);
  toast('Compra de ' + fmtUSD(total) + ' registrada.');
  renderComprar();
}

function applySuggestion() {
  const s = suggestSplit(data.config.weeklyUSD);
  for (const box of $$('#buy-form .buy-asset')) {
    const v = s[box.dataset.sym] || 0;
    $('[data-field="usd"]', box).value = v > 0 ? inputVal(v, 2) : '';
  }
  updateBuyTotals();
  toast(hasPrices() && portfolio().total > 0 ? 'Divisão pelo déficit de cada ativo.' : 'Divisão pela alocação alvo.');
}

/* ---- Metas ---- */

function goalBlock(label, value, meta, when) {
  const pct = meta > 0 ? Math.min(100, value / meta * 100) : 0;
  const done = meta > 0 && value >= meta;
  let whenTxt;
  if (!(meta > 0)) whenTxt = 'Defina a meta em Ajustes';
  else if (done || when === 'done') whenTxt = 'Meta atingida ✓';
  else if (when instanceof Date) whenTxt = 'Previsão: ' + fmtMonth(when);
  else whenTxt = 'Sem previsão (sobra ≤ 0)';
  return `<div class="goal">
    <div class="goal-head"><strong>${label}</strong><span class="num">${meta > 0 ? fmtPct(pct) : ''}</span></div>
    <div class="bar ${done ? 'done' : ''}"><div style="width:${pct}%"></div></div>
    <div class="goal-foot num"><span>${fmtBRL(value)} de ${fmtBRL(meta)}</span><span>${whenTxt}</span></div>
  </div>`;
}

function renderMetas() {
  const el = $('#tab-metas');
  const c = data.config;
  const fl = monthlyFlow();
  const fc = forecast();
  el.innerHTML = `
    <div class="card">
      <h2>Progresso</h2>
      ${goalBlock('Lataria do carro', data.goals.lataria, c.metaLataria, fc.lataria)}
      <div class="small muted" style="margin-top:10px">${data.goals.updatedAt ? 'Saldos atualizados em ' + fmtDateTime(data.goals.updatedAt) : 'Saldos ainda não informados.'}</div>
    </div>

    ${movementForm('goal-form', 'lataria')}

    <details class="card">
      <summary>Corrigir saldo</summary>
      <form id="goals-form" novalidate style="margin-top:12px">
        <p class="small muted" style="margin-top:0">Use só se o saldo real estiver diferente. A diferença entra nos lançamentos como ajuste.</p>
        <div class="field"><label for="g-lataria">Saldo real da lataria (R$)</label><input type="text" inputmode="decimal" id="g-lataria" value="${inputVal(data.goals.lataria)}" placeholder="0,00"></div>
        <button type="submit" class="btn block">Salvar saldo</button>
      </form>
    </details>

    <div class="card">
      <h2>Lançamentos</h2>
      ${movementList(data.goalLog.filter(m => m.goal === 'lataria'), false)}
    </div>

    <div class="card">
      <h2>Fluxo do mês</h2>
      <table class="flow num">
        <tr><td>Renda</td><td>${fmtBRL(c.renda)}</td></tr>
        <tr><td>Gastos</td><td>− ${fmtBRL(c.gastos)}</td></tr>
        <tr><td>Aporte cripto<br><span class="muted small">(${fmtUSD(c.weeklyUSD)} × 52 ÷ 12${fl.fx ? ' × ' + nf(2, 2).format(fl.fx) : ''})</span></td><td>− ${fl.fx ? fmtBRL(fl.aporteBRL) : '—'}</td></tr>
        <tr class="total"><td>Sobra</td><td class="${fl.sobra >= 0 ? 'pos' : 'neg'}">${fmtBRL(fl.sobra)}</td></tr>
        <tr><td>→ Reserva ${fl.reservaDone ? '<span class="muted small">(fechada)</span>' : `<span class="muted small">(${fmtPct(c.split)})</span>`}</td><td>${fmtBRL(fl.toReserva)}</td></tr>
        <tr><td>→ Lataria</td><td>${fmtBRL(fl.toLataria)}</td></tr>
      </table>
      ${fl.fx ? '' : '<p class="small muted">Sem cotação do dólar: atualize os preços para calcular o aporte em reais.</p>'}
      <p class="small muted" style="margin-bottom:0">Enquanto a reserva não fecha, ${fmtPct(c.split)} da sobra vai para ela e o resto para a lataria. Depois, toda a sobra vai para a lataria.</p>
    </div>`;
}

function submitGoals(ev) {
  ev.preventDefault();
  const l = parseNum($('#g-lataria').value || '0');
  if (!(l >= 0)) { $('#g-lataria').classList.add('invalid'); toast('Valor inválido.', true); return; }
  logAdjust('lataria', round2(l));
  data.goals.lataria = round2(l);
  data.goals.updatedAt = Date.now();
  save();
  toast('Saldo da lataria atualizado.');
  renderMetas();
}

/* ---- Lançamentos (reserva e lataria) ---- */

const MOVE_TYPES = { dep: 'Entrada', ret: 'Saída', ajuste: 'Ajuste de saldo' };
const GOAL_NAMES = { reserva: 'Reserva', lataria: 'Lataria' };

/** Soma (ou subtrai) um lançamento no saldo da meta e guarda no histórico. */
function addMovement(goal, type, date, amount, note) {
  amount = round2(amount);
  if (!amount) return;
  data.goalLog.push({ id: uid(), date, goal, type, amount, note: (note || '').slice(0, 80) });
  data.goals[goal] = round2(data.goals[goal] + amount);
  data.goals.updatedAt = Date.now();
}

/** Registra a diferença entre o saldo novo e o atual como "ajuste". */
function logAdjust(goal, newBalance) {
  const delta = round2(newBalance - data.goals[goal]);
  if (delta !== 0) data.goalLog.push({ id: uid(), date: todayISO(), goal, type: 'ajuste', amount: delta, note: '' });
}

function sortLog(list) {
  return list.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.id < a.id ? -1 : 1));
}

/** Formulário de lançamento. goal fixo (aba Reserva) ou escolhido (aba Metas). */
function movementForm(id, goal) {
  return `<form class="card movement-form" id="${id}" data-goal="${goal || ''}" novalidate>
      <h2>Novo lançamento</h2>
      ${goal ? '' : `<div class="seg" role="radiogroup" aria-label="Meta">
        <label><input type="radio" name="${id}-goal" value="reserva" checked><span>Reserva</span></label>
        <label><input type="radio" name="${id}-goal" value="lataria"><span>Lataria</span></label>
      </div>`}
      <div class="seg" role="radiogroup" aria-label="Tipo">
        <label><input type="radio" name="${id}-type" value="dep" checked><span>Entrada</span></label>
        <label><input type="radio" name="${id}-type" value="ret"><span>Saída</span></label>
      </div>
      <div class="row">
        <div class="field"><label for="${id}-date">Data</label><input type="date" id="${id}-date" data-f="date" value="${todayISO()}"></div>
        <div class="field"><label for="${id}-amount">Valor (R$)</label><input type="text" inputmode="decimal" id="${id}-amount" data-f="amount" placeholder="0,00"></div>
      </div>
      <div class="field"><label for="${id}-note">Descrição (opcional)</label><input type="text" id="${id}-note" data-f="note" maxlength="80" placeholder="Ex.: sobra de outubro"></div>
      <button type="submit" class="btn primary block">Lançar</button>
    </form>`;
}

function movementList(list, showGoal) {
  if (!list.length) return '<div class="empty">Nenhum lançamento ainda.</div>';
  return sortLog(list).map(m => `
        <div class="purchase">
          <div class="purchase-head">
            <span class="date">${esc(fmtDate(m.date))}</span>
            <span class="num ${m.amount >= 0 ? 'pos' : 'neg'}">${(m.amount > 0 ? '+' : '−') + ' ' + fmtBRL(Math.abs(m.amount))}</span>
            <button class="btn small danger icon" data-action="del-move" data-id="${esc(m.id)}" aria-label="Excluir lançamento de ${esc(fmtDate(m.date))}" title="Excluir">✕</button>
          </div>
          <div class="small muted">${showGoal ? GOAL_NAMES[m.goal] + ' · ' : ''}${MOVE_TYPES[m.type]}${m.note ? ' · ' + esc(m.note) : ''}</div>
        </div>`).join('');
}

function submitMovement(form) {
  const id = form.id;
  const goal = form.dataset.goal || (form.querySelector(`input[name="${id}-goal"]:checked`) || {}).value || 'reserva';
  const type = (form.querySelector(`input[name="${id}-type"]:checked`) || {}).value || 'dep';
  const dateEl = $('[data-f="date"]', form), amtEl = $('[data-f="amount"]', form);
  const v = parseNum(amtEl.value);
  dateEl.classList.remove('invalid'); amtEl.classList.remove('invalid');
  if (!parseISO(dateEl.value)) { dateEl.classList.add('invalid'); toast('Informe a data.', true); return; }
  if (!(v > 0)) { amtEl.classList.add('invalid'); toast('Informe um valor maior que zero.', true); return; }
  addMovement(goal, type, dateEl.value, type === 'ret' ? -v : v, $('[data-f="note"]', form).value.trim());
  save();
  toast((type === 'ret' ? 'Saída' : 'Entrada') + ' de ' + fmtBRL(v) + ' na ' + GOAL_NAMES[goal].toLowerCase() + '. Saldo: ' + fmtBRL(data.goals[goal]));
  renderActive();
}

function launchSobra() {
  const fl = monthlyFlow();
  if (!(fl.sobra > 0)) return;
  const label = 'sobra de ' + MONTHS[new Date().getMonth()] + '/' + new Date().getFullYear();
  const already = data.goalLog.some(m => m.note === label);
  const msg = (already ? 'Você já lançou a ' + label + '. Lançar de novo?\n\n' : '') +
    'Lançar ' + fmtBRL(fl.toReserva) + ' na reserva e ' + fmtBRL(fl.toLataria) + ' na lataria?';
  if (!confirm(msg)) return;
  addMovement('reserva', 'dep', todayISO(), fl.toReserva, label);
  addMovement('lataria', 'dep', todayISO(), fl.toLataria, label);
  save();
  toast('Sobra lançada.');
  renderActive();
}

function deleteMovement(id) {
  const m = data.goalLog.find(x => x.id === id);
  if (!m) return;
  if (!confirm('Excluir este lançamento de ' + fmtBRL(Math.abs(m.amount)) + '? O saldo da ' + GOAL_NAMES[m.goal].toLowerCase() + ' será corrigido.')) return;
  data.goalLog = data.goalLog.filter(x => x.id !== id);
  data.goals[m.goal] = round2(data.goals[m.goal] - m.amount);
  data.goals.updatedAt = Date.now();
  save();
  toast('Lançamento excluído.');
  renderActive();
}

/* ---- Reserva ---- */

function renderReserva() {
  const el = $('#tab-reserva');
  const c = data.config;
  const saldo = data.goals.reserva;
  const meta = c.metaReserva;
  const falta = Math.max(0, meta - saldo);
  const fl = monthlyFlow();
  const fc = forecast();
  const meses = c.gastos > 0 ? saldo / c.gastos : 0;
  const monthKey = todayISO().slice(0, 7);
  const noMes = data.goalLog.filter(m => m.goal === 'reserva' && m.date.startsWith(monthKey) && m.type !== 'ajuste')
    .reduce((s, m) => s + m.amount, 0);

  el.innerHTML = `
    <div class="card">
      <div class="muted small">Saldo da reserva</div>
      <div class="hero-value num">${fmtBRL(saldo)}</div>
      <div class="hero-sub num">${meta > 0 ? 'Meta ' + fmtBRL(meta) : 'Defina a meta em Ajustes'}</div>
      ${meta > 0 ? `<div class="bar ${saldo >= meta ? 'done' : ''}" style="margin-top:12px"><div style="width:${Math.min(100, saldo / meta * 100)}%"></div></div>
      <div class="goal-foot num"><span>${fmtPct(Math.min(100, saldo / meta * 100))}</span><span>${saldo >= meta ? 'Meta atingida ✓' : 'Faltam ' + fmtBRL(falta)}</span></div>` : ''}
      <div class="stats">
        <div class="stat"><div class="label">Cobre</div><div class="value num">${c.gastos > 0 ? nf(1, 1).format(meses) + ' meses' : '—'}</div></div>
        <div class="stat"><div class="label">Previsão</div><div class="value num">${!(meta > 0) ? '—' : saldo >= meta ? 'fechada' : fc.reserva instanceof Date ? fmtMonth(fc.reserva) : 'sem sobra'}</div></div>
        <div class="stat"><div class="label">Guardar/mês</div><div class="value num">${fmtBRL(fl.toReserva)}</div></div>
        <div class="stat"><div class="label">Movimentado no mês</div><div class="value num ${noMes > 0 ? 'pos' : noMes < 0 ? 'neg' : ''}">${(noMes > 0 ? '+' : '') + fmtBRL(noMes)}</div></div>
      </div>
      ${c.gastos > 0 ? '' : '<p class="small muted" style="margin-bottom:0">Informe seus gastos mensais em Ajustes para ver quantos meses a reserva cobre.</p>'}
    </div>

    ${fl.sobra > 0 ? `<div class="card">
      <h2>Sobra do mês</h2>
      <p class="small muted" style="margin-top:0">Lança de uma vez a divisão da sobra: ${fmtBRL(fl.toReserva)} na reserva e ${fmtBRL(fl.toLataria)} na lataria.</p>
      <button class="btn primary block" data-action="sobra">Lançar sobra de ${fmtBRL(fl.sobra)}</button>
    </div>` : ''}

    ${movementForm('reserve-form', 'reserva')}

    <form class="card" id="reserve-set-form" novalidate>
      <h2>Corrigir saldo</h2>
      <p class="small muted" style="margin-top:0">Use se o saldo do banco estiver diferente. A diferença entra no histórico como ajuste.</p>
      <div class="field"><label for="r-set">Saldo real (R$)</label><input type="text" inputmode="decimal" id="r-set" value="${inputVal(saldo)}" placeholder="0,00"></div>
      <button type="submit" class="btn block">Salvar saldo</button>
    </form>

    <div class="card">
      <h2>Movimentações</h2>
      ${movementList(data.goalLog.filter(m => m.goal === 'reserva'), false)}
    </div>`;
}

function submitReserveSet(ev) {
  ev.preventDefault();
  const v = parseNum($('#r-set').value || '0');
  if (!(v >= 0)) { $('#r-set').classList.add('invalid'); toast('Valor inválido.', true); return; }
  logAdjust('reserva', round2(v));
  data.goals.reserva = round2(v);
  data.goals.updatedAt = Date.now();
  save();
  toast('Saldo da reserva atualizado.');
  renderReserva();
}

/* ---- Histórico ---- */

function renderHistorico() {
  const el = $('#tab-historico');
  const list = sortedPurchases();
  el.innerHTML = `
    <div class="card">
      <div class="btn-row"><button class="btn" data-action="csv" ${list.length ? '' : 'disabled'}>Exportar CSV (IR)</button></div>
    </div>
    <div class="card">
      ${list.length ? list.map(p => {
        const total = Object.values(p.items).reduce((s, i) => s + i.usd, 0);
        return `<div class="purchase">
          <div class="purchase-head">
            <span class="date">${esc(fmtDate(p.date))}</span>
            <span class="muted small num">${fmtUSD(total)}${p.fx ? ' · ' + fmtBRL(total * p.fx) : ''}</span>
            <button class="btn small danger" data-action="del" data-id="${esc(p.id)}" aria-label="Excluir compra de ${esc(fmtDate(p.date))}">Excluir</button>
          </div>
          <div class="purchase-items num">
            ${SYMS.filter(s => p.items[s]).map(s => {
              const it = p.items[s];
              return `<div><span><b>${s}</b> ${fmtQty(it.qty)}</span><span class="muted">${fmtUSD(it.usd)} @ ${fmtPrice(it.price)}</span></div>`;
            }).join('')}
            <div class="muted"><span>Dólar</span><span>${p.fx ? fmtBRL(p.fx) : '—'}</span></div>
          </div>
        </div>`;
      }).join('') : '<div class="empty">Nenhuma compra registrada ainda.</div>'}
    </div>`;
}

function deletePurchase(id) {
  const p = data.purchases.find(x => x.id === id);
  if (!p) return;
  if (!confirm('Excluir a compra de ' + fmtDate(p.date) + '? Essa ação não pode ser desfeita.')) return;
  data.purchases = data.purchases.filter(x => x.id !== id);
  save();
  toast('Compra excluída.');
  renderHistorico();
}

function csvNum(v, dec) {
  if (!Number.isFinite(v)) return '';
  return String(Number(v.toFixed(dec))).replace('.', ',');
}

function exportCSV() {
  const lines = ['data;ativo;valor_usd;preco_usd;quantidade;dolar_brl;valor_brl'];
  for (const p of sortedPurchases()) {
    for (const s of SYMS) {
      const it = p.items[s];
      if (!it) continue;
      lines.push([
        fmtDate(p.date), s,
        csvNum(it.usd, 2), csvNum(it.price, 8), csvNum(it.qty, 8),
        csvNum(p.fx, 4), csvNum(it.usd * p.fx, 2),
      ].join(';'));
    }
  }
  download('meu-dca-compras-' + todayISO() + '.csv', '﻿' + lines.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
}

/* ---- Ajustes ---- */

function renderAjustes() {
  const el = $('#tab-ajustes');
  const c = data.config;
  el.innerHTML = `
    <form class="card" id="cfg-form" novalidate>
      <h2>Plano</h2>
      <div class="row">
        <div class="field"><label for="c-weekly">Aporte semanal (US$)</label><input type="text" inputmode="decimal" id="c-weekly" value="${inputVal(c.weeklyUSD)}"></div>
        <div class="field"><label for="c-start">Data da 1ª compra</label><input type="date" id="c-start" value="${esc(c.startDate)}"></div>
      </div>

      <h2 style="margin-top:6px">Alocação alvo (%)</h2>
      <div class="alloc">
        ${ASSETS.map(a => `<div class="field"><label for="t-${a.sym}">${a.sym}</label>
          <input type="text" inputmode="decimal" id="t-${a.sym}" data-target="${a.sym}" value="${String(c.targets[a.sym]).replace('.', ',')}"></div>`).join('')}
        <div class="field"><label>Soma</label><div id="t-sum" style="padding-top:10px"></div></div>
      </div>
      <p class="hint" style="margin-top:-4px">Alvo 0% = fora do plano, não comprar mais.</p>

      <h2 style="margin-top:12px">Orçamento mensal (R$)</h2>
      <div class="row">
        <div class="field"><label for="c-renda">Renda</label><input type="text" inputmode="decimal" id="c-renda" value="${inputVal(c.renda)}" placeholder="0,00"></div>
        <div class="field"><label for="c-gastos">Gastos</label><input type="text" inputmode="decimal" id="c-gastos" value="${inputVal(c.gastos)}" placeholder="0,00"></div>
        <div class="field"><label for="c-mreserva">Meta da reserva</label><input type="text" inputmode="decimal" id="c-mreserva" value="${inputVal(c.metaReserva)}" placeholder="0,00"></div>
        <div class="field"><label for="c-mlataria">Meta da lataria</label><input type="text" inputmode="decimal" id="c-mlataria" value="${inputVal(c.metaLataria)}" placeholder="0,00"></div>
      </div>
      <div class="field"><label for="c-split">% da sobra para a reserva</label><input type="text" inputmode="decimal" id="c-split" value="${String(c.split).replace('.', ',')}"></div>

      <h2 style="margin-top:12px">Posição inicial</h2>
      <p class="hint" style="margin:-4px 0 10px">O que você já tinha antes de usar o app.</p>
      ${ASSETS.map(a => `<div class="init-asset">
        <span class="sym">${a.sym}</span>
        <div><label for="iq-${a.sym}">Quantidade</label><input type="text" inputmode="decimal" id="iq-${a.sym}" value="${inputVal(data.initial[a.sym].qty, 8)}" placeholder="0"></div>
        <div><label for="ic-${a.sym}">Custo total (US$)</label><input type="text" inputmode="decimal" id="ic-${a.sym}" value="${inputVal(data.initial[a.sym].cost)}" placeholder="0,00"></div>
      </div>`).join('')}

      <button type="submit" class="btn primary block" style="margin-top:8px">Salvar ajustes</button>
    </form>

    <div class="card">
      <h2>Backup</h2>
      <p class="small muted" style="margin-top:0">Seus dados ficam só neste navegador. Exporte um backup de vez em quando.</p>
      <div class="btn-row">
        <button class="btn" data-action="export">Exportar backup</button>
        <button class="btn" data-action="import">Importar backup</button>
      </div>
      <input type="file" id="import-file" class="file-input" accept="application/json,.json">
    </div>

    <div class="card">
      <h2>Zona de perigo</h2>
      <button class="btn danger block" data-action="wipe">Apagar tudo</button>
    </div>`;
  updateTargetSum();
}

function targetSum() {
  return SYMS.reduce((s, sym) => s + num($('#t-' + sym).value, 0), 0);
}

function updateTargetSum() {
  const el = $('#t-sum');
  if (!el) return;
  const s = targetSum();
  const ok = Math.abs(s - 100) < 0.001;
  el.className = ok ? 'sum-ok' : 'sum-bad';
  el.textContent = nf(0, 2).format(s) + '% ' + (ok ? '✓' : '(precisa ser 100%)');
}

function submitConfig(ev) {
  ev.preventDefault();
  const bad = [];
  $$('#cfg-form input').forEach(i => i.classList.remove('invalid'));
  const read = (id, { min = 0, max = Infinity, allowEmpty = true } = {}) => {
    const el = $('#' + id);
    const raw = el.value.trim();
    const v = raw === '' && allowEmpty ? 0 : parseNum(raw);
    if (!Number.isFinite(v) || v < min || v > max) { el.classList.add('invalid'); bad.push(id); return 0; }
    return v;
  };
  const weekly = read('c-weekly', { allowEmpty: false });
  const start = $('#c-start').value;
  if (!parseISO(start)) { $('#c-start').classList.add('invalid'); bad.push('start'); }
  const targets = {};
  for (const s of SYMS) targets[s] = read('t-' + s, { max: 100 });
  const sum = SYMS.reduce((s, k) => s + targets[k], 0);
  if (Math.abs(sum - 100) > 0.001) {
    SYMS.forEach(s => $('#t-' + s).classList.add('invalid'));
    toast('A alocação alvo precisa somar 100%.', true);
    return;
  }
  const cfg = {
    weeklyUSD: weekly, startDate: start, targets,
    renda: read('c-renda'), gastos: read('c-gastos'),
    metaReserva: read('c-mreserva'), metaLataria: read('c-mlataria'),
    split: read('c-split', { max: 100, allowEmpty: false }),
  };
  const initial = {};
  for (const s of SYMS) initial[s] = { qty: read('iq-' + s), cost: read('ic-' + s) };
  if (bad.length) { toast('Confira os campos destacados.', true); return; }
  data.config = cfg;
  data.initial = initial;
  save();
  toast('Ajustes salvos.');
  renderAjustes();
}

function exportBackup() {
  const payload = { config: data.config, initial: data.initial, purchases: data.purchases, goals: data.goals, goalLog: data.goalLog };
  download('meu-dca-backup-' + todayISO() + '.json', JSON.stringify(payload, null, 2), 'application/json');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let raw;
    try { raw = JSON.parse(String(reader.result).replace(/^﻿/, '')); } catch {
      toast('Arquivo inválido: não é um JSON.', true); return;
    }
    if (!raw || typeof raw !== 'object' || !(raw.config || raw.initial || raw.purchases || raw.goals)) {
      toast('Arquivo não parece um backup do Meu DCA.', true); return;
    }
    const next = normalize(raw);
    const n = next.purchases.length;
    if (!confirm('Importar backup com ' + n + ' compra(s)? Os dados atuais serão substituídos.')) return;
    data = next;
    save();
    toast('Backup importado.');
    renderActive();
  };
  reader.onerror = () => toast('Não foi possível ler o arquivo.', true);
  reader.readAsText(file);
}

function wipeAll() {
  if (!confirm('Apagar TODOS os dados (plano, compras, metas e preços salvos)? Exporte um backup antes se quiser guardar.')) return;
  try { localStorage.removeItem(DATA_KEY); localStorage.removeItem(PRICE_KEY); } catch { /* ignore */ }
  data = defaults();
  prices = null;
  priceStatus = 'none';
  toast('Tudo apagado.');
  renderActive();
}

/* ---------- Eventos ---------- */

document.addEventListener('click', ev => {
  const nav = ev.target.closest('.tabbar button');
  if (nav) { showTab(nav.dataset.tab); return; }
  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'refresh': refreshPrices(); break;
    case 'suggest': applySuggestion(); break;
    case 'del': deletePurchase(btn.dataset.id); break;
    case 'del-move': deleteMovement(btn.dataset.id); break;
    case 'sobra': launchSobra(); break;
    case 'csv': exportCSV(); break;
    case 'export': exportBackup(); break;
    case 'import': $('#import-file').click(); break;
    case 'wipe': wipeAll(); break;
  }
});

document.addEventListener('input', ev => {
  if (ev.target.closest('#buy-form')) {
    ev.target.dataset.touched = '1';
    updateBuyTotals();
  }
  if (ev.target.matches('[data-target]')) updateTargetSum();
});

document.addEventListener('submit', ev => {
  if (ev.target.id === 'buy-form') submitBuy(ev);
  else if (ev.target.id === 'goals-form') submitGoals(ev);
  else if (ev.target.classList.contains('movement-form')) { ev.preventDefault(); submitMovement(ev.target); }
  else if (ev.target.id === 'reserve-set-form') submitReserveSet(ev);
  else if (ev.target.id === 'cfg-form') submitConfig(ev);
});

document.addEventListener('change', ev => {
  if (ev.target.id === 'import-file' && ev.target.files && ev.target.files[0]) {
    importBackup(ev.target.files[0]);
    ev.target.value = '';
  }
});

/* ---------- Importação por link ----------
   Um link no formato  .../#importar=<JSON em base64url>  carrega um plano.
   O trecho depois de "#" nunca é enviado ao servidor nem fica no GitHub.
   O link pode continuar na URL (ex.: atalho da tela de início): cada plano
   só é importado uma vez por navegador. */

const IMPORTED_KEY = 'meudca:imported:v1';

function decodeBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function importFromLink() {
  const m = /^#importar=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return;
  const token = m[1];
  if (storageGet(IMPORTED_KEY) === token) return;
  let raw;
  try { raw = JSON.parse(decodeBase64Url(token)); } catch {
    toast('Link de importação inválido.', true); return;
  }
  if (!raw || typeof raw !== 'object' || !(raw.config || raw.initial || raw.purchases || raw.goals)) {
    toast('Link de importação inválido.', true); return;
  }
  const hasData = data.purchases.length || SYMS.some(s => data.initial[s].qty > 0);
  if (hasData && !confirm('Importar o plano deste link? Os dados atuais serão substituídos.')) {
    storageSet(IMPORTED_KEY, token);
    return;
  }
  data = normalize(raw);
  save();
  storageSet(IMPORTED_KEY, token);
  toast('Plano importado.');
}

/* ---------- Início ---------- */

importFromLink();
showTab('inicio');
refreshPrices();
