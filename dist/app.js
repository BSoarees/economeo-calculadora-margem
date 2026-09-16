const STORAGE_KEY = "economeo-plan-simulator-v2";

const defaults = {
  scenarioName: "Cenário base · preços atuais",
  monthlyPrice: 29.9,
  monthlyActive: 120,
  annualPixPrice: 290,
  annualPixActive: 100,
  annualPixSales: 12,
  annualCardPrice: 315,
  annualCardActive: 80,
  annualCardSales: 10,
  taxPercent: 6,
  variableCostPerUser: 3.1,
  fixedMonthlyCost: 7700,
  monthlyCardRate: 4.99,
  monthlyCardFixed: 0.49,
  pixRate: 0.99,
  pixFixed: 0,
  annualCardRate: 4.99,
  annualCardFixed: 0.49,
  installments: 12,
  anticipationRate: 1.49,
  anticipate: true
};

let state = loadState();
let toastTimer;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function cloneDefaults() { return JSON.parse(JSON.stringify(defaults)); }

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...cloneDefaults(), ...saved } : cloneDefaults();
  } catch { return cloneDefaults(); }
}

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function cardSettlement(gross, ratePercent, fixedFee, installments, anticipationPercent, anticipate) {
  const count = Math.max(1, Math.round(n(installments)));
  const afterAcquirer = Math.max(0, gross * (1 - n(ratePercent) / 100) - n(fixedFee));
  if (!anticipate || n(anticipationPercent) === 0 || count === 1) {
    return { net: afterAcquirer, acquirerCost: gross - afterAcquirer, anticipationCost: 0, installments: count };
  }
  const monthlyRate = n(anticipationPercent) / 100;
  const installmentValue = afterAcquirer / count;
  let anticipatedNet = 0;
  for (let month = 1; month <= count; month += 1) anticipatedNet += installmentValue / Math.pow(1 + monthlyRate, month);
  return { net: anticipatedNet, acquirerCost: gross - afterAcquirer, anticipationCost: afterAcquirer - anticipatedNet, installments: count };
}

function calculate(s = state) {
  const monthlyFeePerSale = s.monthlyPrice * (s.monthlyCardRate / 100) + s.monthlyCardFixed;
  const monthlyNet = Math.max(0, s.monthlyPrice - monthlyFeePerSale);
  const pixFeePerSale = s.annualPixPrice * (s.pixRate / 100) + s.pixFixed;
  const pixNet = Math.max(0, s.annualPixPrice - pixFeePerSale);
  const annualCard = cardSettlement(s.annualCardPrice, s.annualCardRate, s.annualCardFixed, s.installments, s.anticipationRate, s.anticipate);
  const annualCardTotalFees = s.annualCardPrice - annualCard.net;

  const monthlyContribution = monthlyNet - s.monthlyPrice * (s.taxPercent / 100) - s.variableCostPerUser;
  const pixContribution = pixNet - s.annualPixPrice * (s.taxPercent / 100) - s.variableCostPerUser * 12;
  const cardContribution = annualCard.net - s.annualCardPrice * (s.taxPercent / 100) - s.variableCostPerUser * 12;

  const active = s.monthlyActive + s.annualPixActive + s.annualCardActive;
  const mrr = s.monthlyActive * s.monthlyPrice + s.annualPixActive * s.annualPixPrice / 12 + s.annualCardActive * s.annualCardPrice / 12;
  const monthlyPaymentCosts = s.monthlyActive * monthlyFeePerSale + (s.annualPixActive / 12) * pixFeePerSale + (s.annualCardActive / 12) * annualCardTotalFees;
  const taxes = mrr * (s.taxPercent / 100);
  const variableCosts = active * s.variableCostPerUser;
  const netRevenue = mrr - monthlyPaymentCosts - taxes;
  const preFixedContribution = netRevenue - variableCosts;
  const profit = preFixedContribution - s.fixedMonthlyCost;
  const margin = mrr ? profit / mrr * 100 : 0;
  const contributionPerActive = active ? preFixedContribution / active : 0;
  const breakeven = contributionPerActive > 0 ? Math.ceil(s.fixedMonthlyCost / contributionPerActive) : 0;

  const monthlyCash = s.monthlyActive * monthlyNet;
  const pixCash = s.annualPixSales * pixNet;
  const cardCashPerSale = s.anticipate ? annualCard.net : annualCard.net / annualCard.installments;
  const cardCash = s.annualCardSales * cardCashPerSale;
  const cashNow = monthlyCash + pixCash + cardCash;
  const receivables = s.anticipate ? 0 : s.annualCardSales * annualCard.net * (annualCard.installments - 1) / annualCard.installments;

  const comparison = [
    { key: "monthly", label: "mensal no cartão", annualContribution: monthlyContribution * 12 },
    { key: "pix", label: "anual no Pix", annualContribution: pixContribution },
    { key: "card", label: "anual no cartão", annualContribution: cardContribution }
  ].sort((a, b) => b.annualContribution - a.annualContribution);

  return {
    monthlyFeePerSale, monthlyNet, pixFeePerSale, pixNet, annualCard, annualCardTotalFees,
    monthlyContribution, pixContribution, cardContribution, active, mrr, monthlyPaymentCosts,
    taxes, variableCosts, netRevenue, preFixedContribution, profit, margin, contributionPerActive,
    breakeven, cashNow, receivables, comparison
  };
}

function bindInputs() {
  document.querySelectorAll("[data-key]").forEach((input) => {
    const key = input.dataset.key;
    if (input.type === "checkbox") input.checked = Boolean(state[key]);
    else input.value = state[key];
    input.addEventListener("input", () => {
      state[key] = input.type === "checkbox" ? input.checked : n(input.value);
      persistAndRender();
    });
    if (input.type === "number") input.addEventListener("focus", () => input.select());
  });
  const scenario = document.getElementById("scenarioName");
  scenario.value = state.scenarioName;
  scenario.addEventListener("input", () => { state.scenarioName = scenario.value; persistAndRender(); });
}

function render() {
  const r = calculate();
  const installments = Math.max(1, Math.round(state.installments));
  setText("installmentLabel", `${installments}× no cartão`);
  setText("cardNetLabel", state.anticipate ? "líquido antecipado" : `total em ${installments} parcelas`);

  setText("monthlyNet", money.format(r.monthlyNet));
  setText("monthlyFees", money.format(r.monthlyFeePerSale));
  setText("monthlyContribution", money.format(r.monthlyContribution));
  setText("pixNet", money.format(r.pixNet));
  setText("pixFees", money.format(r.pixFeePerSale));
  setText("pixContribution", money.format(r.pixContribution));
  setText("cardNet", money.format(r.annualCard.net));
  setText("cardFees", money.format(r.annualCardTotalFees));
  setText("cardContribution", money.format(r.cardContribution));

  const retained = [
    state.monthlyPrice ? r.monthlyNet / state.monthlyPrice * 100 : 0,
    state.annualPixPrice ? r.pixNet / state.annualPixPrice * 100 : 0,
    state.annualCardPrice ? r.annualCard.net / state.annualCardPrice * 100 : 0
  ];
  document.getElementById("monthlyBar").style.width = `${Math.max(0, Math.min(100, retained[0]))}%`;
  document.getElementById("pixBar").style.width = `${Math.max(0, Math.min(100, retained[1]))}%`;
  document.getElementById("cardBar").style.width = `${Math.max(0, Math.min(100, retained[2]))}%`;

  setText("winnerText", `${capitalize(r.comparison[0].label)} deixa mais dinheiro por ano`);
  setText("mrrValue", money.format(r.mrr));
  setText("cashNowValue", money.format(r.cashNow));
  setText("cashNowNote", state.anticipate ? "líquido de taxas e antecipação" : "inclui só a 1ª parcela das vendas anuais");
  setText("netRevenueValue", money.format(r.netRevenue));
  setText("variableCostsValue", `− ${money.format(r.variableCosts)}`);
  setText("fixedCostValue", `− ${money.format(state.fixedMonthlyCost)}`);
  setText("profitValue", money.format(r.profit));
  document.getElementById("profitValue").classList.toggle("negative", r.profit < 0);
  setText("marginValue", `${percent.format(r.margin)}%`);
  setText("breakevenValue", r.breakeven ? `${number.format(r.breakeven)} clientes` : "—");
  setText("receivablesValue", money.format(r.receivables));

  const badge = document.getElementById("healthBadge");
  badge.className = "health";
  if (r.margin >= 20) badge.textContent = "Margem saudável";
  else if (r.margin >= 0) { badge.textContent = "Margem apertada"; badge.classList.add("warning"); }
  else { badge.textContent = "Operação no vermelho"; badge.classList.add("danger"); }

  const pixAdvantage = r.pixContribution - r.cardContribution;
  let insight;
  if (!r.active) insight = "Adicione a base ativa para calcular a margem total e o ponto de equilíbrio.";
  else if (pixAdvantage > 0) insight = `No cenário atual, o Pix preserva ${money.format(pixAdvantage)} a mais que o cartão anual por venda. O efeito vem das taxas e da antecipação.`;
  else if (pixAdvantage < 0) insight = `O cartão anual preserva ${money.format(Math.abs(pixAdvantage))} a mais que o Pix por venda neste cenário.`;
  else insight = "Pix e cartão anual deixam a mesma contribuição por venda neste cenário.";
  setText("decisionText", insight);
}

function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const status = document.getElementById("saveStatus");
  status.textContent = "Salvando…";
  requestAnimationFrame(() => { render(); status.textContent = "Salvo neste navegador"; });
}

function resetScenario() {
  state = cloneDefaults();
  localStorage.removeItem(STORAGE_KEY);
  document.getElementById("scenarioName").value = state.scenarioName;
  document.querySelectorAll("[data-key]").forEach(input => {
    const value = state[input.dataset.key];
    if (input.type === "checkbox") input.checked = Boolean(value); else input.value = value;
  });
  render();
  showToast("Exemplo restaurado");
}

function summaryText() {
  const r = calculate();
  return `${state.scenarioName}\n\nCOMPARAÇÃO POR VENDA\nMensal cartão: líquido ${money.format(r.monthlyNet)} · contribuição mensal ${money.format(r.monthlyContribution)}\nAnual Pix: líquido ${money.format(r.pixNet)} · contribuição anual ${money.format(r.pixContribution)}\nAnual cartão: líquido ${money.format(r.annualCard.net)} · contribuição anual ${money.format(r.cardContribution)}\n\nVISÃO DO MÊS\nClientes ativos: ${number.format(r.active)}\nReceita mensal equivalente: ${money.format(r.mrr)}\nCaixa líquido agora: ${money.format(r.cashNow)}\nRecebíveis futuros: ${money.format(r.receivables)}\nResultado operacional: ${money.format(r.profit)} (${percent.format(r.margin)}%)\nPonto de equilíbrio: ${r.breakeven ? number.format(r.breakeven) + " clientes" : "—"}`;
}

async function copySummary() {
  try { await navigator.clipboard.writeText(summaryText()); showToast("Resumo copiado"); }
  catch { showToast("Não foi possível copiar"); }
}

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const register = tool => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
  register({
    name: "read_economeo_plan_scenario",
    title: "Ler cenário dos planos",
    description: "Retorna preços, taxas e os resultados atualmente visíveis no simulador.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => ({ assumptions: state, results: calculate() })
  });
  register({
    name: "update_economeo_plan_scenario",
    title: "Atualizar cenário dos planos",
    description: "Atualiza em lote premissas numéricas do simulador e recalcula a tela.",
    inputSchema: { type: "object", properties: { assumptions: { type: "object", additionalProperties: { type: "number", minimum: 0 } } }, required: ["assumptions"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: ({ assumptions }) => {
      const allowed = Object.keys(defaults).filter(key => typeof defaults[key] === "number");
      Object.entries(assumptions || {}).forEach(([key, value]) => { if (allowed.includes(key) && Number.isFinite(value) && value >= 0) state[key] = value; });
      document.querySelectorAll("[data-key]").forEach(input => { if (input.type !== "checkbox") input.value = state[input.dataset.key]; });
      persistAndRender();
      return { updated: true, results: calculate() };
    }
  });
}

function setText(id, value) { document.getElementById(id).textContent = value; }
function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
function showToast(message) { const toast = document.getElementById("toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 1800); }

document.getElementById("resetButton").addEventListener("click", resetScenario);
document.getElementById("copyButton").addEventListener("click", copySummary);
bindInputs();
render();
registerWebMcp();
