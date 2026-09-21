const STORAGE_KEY = "economeo-unit-economics-v3";

const defaults = {
  scenarioName: "Cenário para reunião · valores ilustrativos",
  messagesPerUser: 150,
  aiActionsPerUser: 25,
  messageUnitCost: 0.035,
  aiUnitCost: 0.025,
  otherVariableCost: 1.25,
  monthlyPrice: 29.9,
  annualPixPrice: 290,
  annualCardPrice: 315,
  activeCustomers: 300,
  fixedMonthlyCost: 7700,
  taxPercent: 6,
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

const presets = {
  light: { messagesPerUser: 50, aiActionsPerUser: 8 },
  base: { messagesPerUser: 150, aiActionsPerUser: 25 },
  heavy: { messagesPerUser: 400, aiActionsPerUser: 60 }
};

const labels = { monthly: "Mensal no cartão", pix: "Anual no Pix", card: "Anual no cartão" };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
let state = loadState();
let toastTimer;

function cloneDefaults() { return JSON.parse(JSON.stringify(defaults)); }
function safeNumber(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; }

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...cloneDefaults(), ...saved } : cloneDefaults();
  } catch { return cloneDefaults(); }
}

function cardSettlement(gross, ratePercent, fixedFee, installments, anticipationPercent, anticipate) {
  const count = Math.max(1, Math.round(safeNumber(installments)));
  const afterGateway = Math.max(0, gross * (1 - safeNumber(ratePercent) / 100) - safeNumber(fixedFee));
  if (!anticipate || safeNumber(anticipationPercent) === 0 || count === 1) return { net: afterGateway, installments: count };
  const rate = safeNumber(anticipationPercent) / 100;
  const installment = afterGateway / count;
  let net = 0;
  for (let month = 1; month <= count; month += 1) net += installment / Math.pow(1 + rate, month);
  return { net, installments: count };
}

function planResult(key, revenue, paymentCost, tax, usageCost, fixedShare, cash) {
  const contribution = revenue - paymentCost - tax - usageCost;
  const profit = contribution - fixedShare;
  return {
    key, revenue, paymentCost, tax, usageCost, fixedShare, cash, contribution, profit,
    contributionMargin: revenue ? contribution / revenue * 100 : 0,
    margin: revenue ? profit / revenue * 100 : 0,
    breakeven: contribution > 0 ? Math.ceil(state.fixedMonthlyCost / contribution) : 0
  };
}

function calculate(s = state) {
  const usageCost = s.messagesPerUser * s.messageUnitCost + s.aiActionsPerUser * s.aiUnitCost + s.otherVariableCost;
  const active = Math.max(1, s.activeCustomers);
  const fixedShare = s.fixedMonthlyCost / active;

  const monthlyGateway = s.monthlyPrice * (s.monthlyCardRate / 100) + s.monthlyCardFixed;
  const monthly = planResult(
    "monthly", s.monthlyPrice, monthlyGateway, s.monthlyPrice * (s.taxPercent / 100), usageCost,
    fixedShare, Math.max(0, s.monthlyPrice - monthlyGateway)
  );

  const pixGatewayTotal = s.annualPixPrice * (s.pixRate / 100) + s.pixFixed;
  const pix = planResult(
    "pix", s.annualPixPrice / 12, pixGatewayTotal / 12, s.annualPixPrice * (s.taxPercent / 100) / 12,
    usageCost, fixedShare, Math.max(0, s.annualPixPrice - pixGatewayTotal)
  );

  const settlement = cardSettlement(s.annualCardPrice, s.annualCardRate, s.annualCardFixed, s.installments, s.anticipationRate, s.anticipate);
  const cardFinancialCostTotal = s.annualCardPrice - settlement.net;
  const cardCash = s.anticipate ? settlement.net : settlement.net / settlement.installments;
  const card = planResult(
    "card", s.annualCardPrice / 12, cardFinancialCostTotal / 12, s.annualCardPrice * (s.taxPercent / 100) / 12,
    usageCost, fixedShare, cardCash
  );

  const plans = [monthly, pix, card].sort((a, b) => b.profit - a.profit);
  return { usageCost, fixedShare, monthly, pix, card, plans, winner: plans[0], runnerUp: plans[1], settlement };
}

function bindInputs() {
  document.querySelectorAll("[data-key]").forEach(input => {
    const key = input.dataset.key;
    if (input.type === "checkbox") input.checked = Boolean(state[key]); else input.value = state[key];
    input.addEventListener("input", () => {
      state[key] = input.type === "checkbox" ? input.checked : safeNumber(input.value);
      persistAndRender();
    });
    if (input.type === "number") input.addEventListener("focus", () => input.select());
  });
  const scenario = document.getElementById("scenarioName");
  scenario.value = state.scenarioName;
  scenario.addEventListener("input", () => { state.scenarioName = scenario.value; persistAndRender(); });
  document.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => applyPreset(button.dataset.preset)));
}

function applyPreset(name) {
  const preset = presets[name];
  if (!preset) return;
  state.messagesPerUser = preset.messagesPerUser;
  state.aiActionsPerUser = preset.aiActionsPerUser;
  document.querySelector('[data-key="messagesPerUser"]').value = state.messagesPerUser;
  document.querySelector('[data-key="aiActionsPerUser"]').value = state.aiActionsPerUser;
  persistAndRender();
}

function updatePresetState() {
  document.querySelectorAll("[data-preset]").forEach(button => {
    const preset = presets[button.dataset.preset];
    button.classList.toggle("active", state.messagesPerUser === preset.messagesPerUser && state.aiActionsPerUser === preset.aiActionsPerUser);
  });
}

function renderPlan(prefix, result) {
  setText(`${prefix}RevenueLabel`, `${money.format(result.revenue)} / mês`);
  setText(`${prefix}Profit`, money.format(result.profit));
  setText(`${prefix}Margin`, `${percent.format(result.margin)}%`);
  setText(`${prefix}Revenue`, money.format(result.revenue));
  setText(`${prefix}CommercialCost`, `− ${money.format(result.paymentCost + result.tax)}`);
  setText(`${prefix}UsageCost`, `− ${money.format(result.usageCost)}`);
  setText(`${prefix}Contribution`, `${money.format(result.contribution)} · ${percent.format(result.contributionMargin)}%`);
  setText(`${prefix}FixedShare`, `− ${money.format(result.fixedShare)}`);
  setText(`${prefix}Cash`, money.format(result.cash));
  setText(`${prefix}Breakeven`, result.breakeven ? `${integer.format(result.breakeven)} clientes` : "—");
  document.getElementById(`${prefix}Profit`).classList.toggle("negative", result.profit < 0);
  document.getElementById(`${prefix}Margin`).classList.toggle("negative", result.margin < 0);
}

function render() {
  const r = calculate();
  updatePresetState();
  setText("installmentLabel", `parcelado em ${Math.max(1, Math.round(state.installments))}×`);
  setText("usageCostInline", money.format(r.usageCost));
  setText("usageCostValue", money.format(r.usageCost));
  setText("fixedShareValue", money.format(r.fixedShare));
  setText("cardCashLabel", state.anticipate ? "Caixa líquido antecipado" : "Primeira parcela líquida");

  renderPlan("monthly", r.monthly);
  renderPlan("pix", r.pix);
  renderPlan("card", r.card);

  setText("winnerName", labels[r.winner.key]);
  setText("winnerProfit", money.format(r.winner.profit));
  const difference = r.winner.profit - r.runnerUp.profit;
  setText("winnerReason", `${money.format(difference)} a mais por cliente/mês que o segundo colocado · ${money.format(difference * 12)} por ano.`);

  const badge = document.getElementById("healthBadge");
  badge.className = "health";
  if (r.winner.margin >= 20) badge.textContent = "Margem saudável";
  else if (r.winner.profit >= 0) { badge.textContent = "Margem apertada"; badge.classList.add("warning"); }
  else { badge.textContent = "Estrutura ainda não se paga"; badge.classList.add("danger"); }

  const allContributionPositive = [r.monthly, r.pix, r.card].every(plan => plan.contribution > 0);
  let decision;
  if (r.winner.profit < 0 && allContributionPositive) {
    decision = `Os três planos pagam o próprio uso, mas a base de ${integer.format(state.activeCustomers)} clientes ainda não dilui ${money.format(state.fixedMonthlyCost)} de estrutura. O melhor ponto de equilíbrio é ${integer.format(r.winner.breakeven)} clientes no ${labels[r.winner.key].toLowerCase()}.`;
  } else if (r.winner.profit >= 0) {
    decision = `${labels[r.winner.key]} é o plano mais rentável neste uso. Mesmo após ratear a estrutura, sobra ${money.format(r.winner.profit)} por cliente/mês.`;
  } else {
    decision = `O custo de uso está consumindo os planos. Antes de escalar, revise mensagens, IA ou preço; contribuição negativa não melhora apenas adicionando clientes.`;
  }
  setText("decisionText", decision);
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
  const line = plan => `${labels[plan.key]}: receita ${money.format(plan.revenue)}/mês · contribuição ${money.format(plan.contribution)} (${percent.format(plan.contributionMargin)}%) · lucro após estrutura ${money.format(plan.profit)} (${percent.format(plan.margin)}%) · equilíbrio ${plan.breakeven ? integer.format(plan.breakeven) + " clientes" : "—"}`;
  return `${state.scenarioName}\n\nDECISÃO\n${labels[r.winner.key]} deixa mais dinheiro: ${money.format(r.winner.profit)} por cliente/mês.\n\nPREMISSAS\nUso: ${integer.format(state.messagesPerUser)} mensagens e ${integer.format(state.aiActionsPerUser)} leituras com IA por cliente/mês\nCusto de uso: ${money.format(r.usageCost)} por cliente/mês\nBase: ${integer.format(state.activeCustomers)} clientes\nEstrutura fixa: ${money.format(state.fixedMonthlyCost)}/mês (${money.format(r.fixedShare)} por cliente)\n\nPLANOS\n${line(r.monthly)}\n${line(r.pix)}\n${line(r.card)}\n\nObservação: taxas e custos iniciais são premissas ilustrativas e devem ser substituídos pelos valores reais.`;
}

async function copySummary() {
  try { await navigator.clipboard.writeText(summaryText()); showToast("Resumo da reunião copiado"); }
  catch { showToast("Não foi possível copiar"); }
}

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const register = tool => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
  register({ name:"read_economeo_unit_economics", title:"Ler margem dos planos", description:"Retorna premissas, custo de uso e margem mensal por plano.", inputSchema:{type:"object",properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:()=>({assumptions:state,results:calculate()}) });
  register({ name:"update_economeo_usage_scenario", title:"Atualizar cenário de uso", description:"Atualiza mensagens e leituras de IA por cliente e recalcula os planos.", inputSchema:{type:"object",properties:{messagesPerUser:{type:"number",minimum:0},aiActionsPerUser:{type:"number",minimum:0}},additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:input=>{ if(Number.isFinite(input.messagesPerUser)) state.messagesPerUser=input.messagesPerUser; if(Number.isFinite(input.aiActionsPerUser)) state.aiActionsPerUser=input.aiActionsPerUser; document.querySelector('[data-key="messagesPerUser"]').value=state.messagesPerUser; document.querySelector('[data-key="aiActionsPerUser"]').value=state.aiActionsPerUser; persistAndRender(); return {updated:true,results:calculate()}; } });
}

function setText(id, value) { document.getElementById(id).textContent = value; }
function showToast(message) { const toast=document.getElementById("toast"); toast.textContent=message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove("show"),1800); }

document.getElementById("resetButton").addEventListener("click", resetScenario);
document.getElementById("copyButton").addEventListener("click", copySummary);
bindInputs();
render();
registerWebMcp();
