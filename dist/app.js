const STORAGE_KEY = "economeo-margin-scenario-v1";

const defaults = {
  scenarioName: "Cenário base · 2026",
  monthlyCustomers: 120,
  monthlyPrice: 29.9,
  annualPixCustomers: 100,
  annualPixPrice: 290,
  newAnnualPixSales: 12,
  annualCardCustomers: 80,
  annualCardPrice: 315,
  newAnnualCardSales: 10,
  whatsappMessages: 45,
  whatsappUnitCost: 0.035,
  whatsappProviderCost: 0.5,
  aiActions: 20,
  aiUnitCost: 0.025,
  storagePerCustomer: 0.35,
  supportPerCustomer: 0.75,
  paymentFeePercent: 4.99,
  paymentFeeFixed: 0.5,
  taxPercent: 6,
  fixedInfra: 800,
  teamCost: 4500,
  marketingCost: 1500,
  adminCost: 600,
  otherFixedCost: 300,
  allocations: [
    { label: "Impostos", percent: 6, color: "#be6a52" },
    { label: "Operação", percent: 34, color: "#0d4f3c" },
    { label: "Produto e tecnologia", percent: 24, color: "#0d9f6e" },
    { label: "Crescimento", percent: 16, color: "#4c82a8" },
    { label: "Reserva", percent: 10, color: "#d6a13a" },
    { label: "Distribuição", percent: 10, color: "#8464a8" }
  ]
};

let state = loadState();
let toastTimer;

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...defaults, ...saved, allocations: saved.allocations || defaults.allocations } : structuredClone(defaults);
  } catch { return structuredClone(defaults); }
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function calculate(s = state) {
  const activeCustomers = s.monthlyCustomers + s.annualPixCustomers + s.annualCardCustomers;
  const recognizedRevenue = s.monthlyCustomers * s.monthlyPrice + s.annualPixCustomers * (s.annualPixPrice / 12) + s.annualCardCustomers * (s.annualCardPrice / 12);
  const cashIn = s.monthlyCustomers * s.monthlyPrice + s.newAnnualPixSales * s.annualPixPrice + s.newAnnualCardSales * s.annualCardPrice;
  const equivalentMonthlyCharges = s.monthlyCustomers + (s.annualPixCustomers + s.annualCardCustomers) / 12;
  const taxes = recognizedRevenue * (s.taxPercent / 100);
  const paymentFees = recognizedRevenue * (s.paymentFeePercent / 100) + equivalentMonthlyCharges * s.paymentFeeFixed;
  const whatsappCost = activeCustomers * (s.whatsappMessages * s.whatsappUnitCost + s.whatsappProviderCost);
  const aiCost = activeCustomers * s.aiActions * s.aiUnitCost;
  const dataSupportCost = activeCustomers * (s.storagePerCustomer + s.supportPerCustomer);
  const otherVariable = aiCost + dataSupportCost;
  const variableCosts = taxes + paymentFees + whatsappCost + otherVariable;
  const contribution = recognizedRevenue - variableCosts;
  const fixedCosts = s.fixedInfra + s.teamCost + s.marketingCost + s.adminCost + s.otherFixedCost;
  const profit = contribution - fixedCosts;
  const margin = recognizedRevenue ? profit / recognizedRevenue * 100 : 0;
  const contributionPerCustomer = activeCustomers ? contribution / activeCustomers : 0;
  const breakeven = contributionPerCustomer > 0 ? Math.ceil(fixedCosts / contributionPerCustomer) : 0;
  const arpu = activeCustomers ? recognizedRevenue / activeCustomers : 0;
  return { activeCustomers, recognizedRevenue, cashIn, taxes, paymentFees, whatsappCost, otherVariable, variableCosts, contribution, fixedCosts, profit, margin, breakeven, arpu, contributionPerCustomer };
}

function bindFields() {
  document.querySelectorAll("[data-key]").forEach((input) => {
    input.value = state[input.dataset.key];
    input.addEventListener("input", () => {
      state[input.dataset.key] = safeNumber(input.value);
      persistAndRender();
    });
    input.addEventListener("focus", () => input.select());
  });
  const name = document.getElementById("scenarioName");
  name.value = state.scenarioName;
  name.addEventListener("input", () => { state.scenarioName = name.value; persistAndRender(); });
}

function renderAllocations() {
  const fields = document.getElementById("allocationFields");
  fields.innerHTML = "";
  state.allocations.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "allocation-row";
    row.innerHTML = `<input type="text" aria-label="Nome da divisão ${index + 1}" value="${escapeHtml(item.label)}"><input type="number" min="0" max="100" step="0.1" aria-label="Percentual de ${escapeHtml(item.label)}" value="${item.percent}"><output>${money.format(calculate().cashIn * item.percent / 100)}</output>`;
    const [labelInput, percentInput] = row.querySelectorAll("input");
    labelInput.addEventListener("input", () => { state.allocations[index].label = labelInput.value; persistAndRender(false); });
    percentInput.addEventListener("input", () => { state.allocations[index].percent = safeNumber(percentInput.value); persistAndRender(false); });
    fields.appendChild(row);
  });
}

function updateAllocationOutputs() {
  const result = calculate();
  const outputs = document.querySelectorAll("#allocationFields output");
  const list = document.getElementById("allocationResults");
  list.innerHTML = "";
  state.allocations.forEach((item, index) => {
    if (outputs[index]) outputs[index].textContent = money.format(result.cashIn * item.percent / 100);
    const row = document.createElement("div");
    row.className = "allocation-result";
    row.innerHTML = `<span><i style="background:${item.color}"></i>${escapeHtml(item.label || `Destino ${index + 1}`)} · ${percent.format(item.percent)}%</span><strong>${money.format(result.cashIn * item.percent / 100)}</strong>`;
    list.appendChild(row);
  });
  const total = state.allocations.reduce((sum, item) => sum + safeNumber(item.percent), 0);
  const totalEl = document.getElementById("allocationTotal");
  totalEl.textContent = `${percent.format(total)}%`;
  totalEl.classList.toggle("invalid", Math.abs(total - 100) > .01);
}

function render() {
  const r = calculate();
  setText("profitValue", money.format(r.profit));
  document.getElementById("profitValue").classList.toggle("negative", r.profit < 0);
  setText("marginValue", `${percent.format(r.margin)}%`);
  setText("activeCustomersValue", integer.format(r.activeCustomers));
  setText("arpuValue", money.format(r.arpu));
  setText("breakevenValue", r.breakeven ? `${integer.format(r.breakeven)} clientes` : "—");
  setText("recognizedRevenueValue", money.format(r.recognizedRevenue));
  setText("taxValue", money.format(r.taxes));
  setText("paymentFeesValue", money.format(r.paymentFees));
  setText("whatsappCostValue", money.format(r.whatsappCost));
  setText("otherVariableValue", money.format(r.otherVariable));
  setText("contributionValue", money.format(r.contribution));
  setText("fixedCostsValue", money.format(r.fixedCosts));
  setText("resultValue", money.format(r.profit));
  setText("cashInValue", money.format(r.cashIn));

  const badge = document.getElementById("healthBadge");
  badge.className = "health";
  if (r.margin >= 25) badge.textContent = "Margem saudável";
  else if (r.margin >= 0) { badge.textContent = "Margem apertada"; badge.classList.add("warning"); }
  else { badge.textContent = "Operação no vermelho"; badge.classList.add("danger"); }

  const gap = r.breakeven - r.activeCustomers;
  let insight;
  if (!r.activeCustomers) insight = "Adicione clientes ativos para calcular a economia por assinatura.";
  else if (r.profit >= 0) insight = `Cada cliente contribui com ${money.format(r.contributionPerCustomer)} antes dos custos fixos. A operação está ${integer.format(Math.max(0, r.activeCustomers - r.breakeven))} clientes acima do ponto de equilíbrio.`;
  else insight = `Cada cliente contribui com ${money.format(r.contributionPerCustomer)} antes dos custos fixos. Faltam aproximadamente ${integer.format(Math.max(0, gap))} clientes para cobrir a estrutura atual.`;
  setText("insightText", insight);
  updateAllocationOutputs();
}

function persistAndRender(rebuildAllocations = false) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const status = document.getElementById("saveStatus");
  status.textContent = "Salvando…";
  requestAnimationFrame(() => { render(); if (rebuildAllocations) renderAllocations(); status.textContent = "Salvo neste navegador"; });
}

function scenarioSummary() {
  const r = calculate();
  const allocation = state.allocations.map(i => `• ${i.label}: ${percent.format(i.percent)}% (${money.format(r.cashIn * i.percent / 100)})`).join("\n");
  return `${state.scenarioName}\n\nClientes ativos: ${integer.format(r.activeCustomers)}\nReceita mensal reconhecida: ${money.format(r.recognizedRevenue)}\nCaixa recebido: ${money.format(r.cashIn)}\nMargem de contribuição: ${money.format(r.contribution)}\nCustos fixos: ${money.format(r.fixedCosts)}\nResultado operacional: ${money.format(r.profit)} (${percent.format(r.margin)}%)\nPonto de equilíbrio: ${integer.format(r.breakeven)} clientes\n\nDivisão do caixa\n${allocation}`;
}

function exportScenario() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(state.scenarioName || "cenario-economeo")}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Cenário exportado");
}

async function importScenario(file) {
  try {
    const imported = JSON.parse(await file.text());
    if (!imported || typeof imported !== "object") throw new Error("invalid");
    state = { ...structuredClone(defaults), ...imported, allocations: Array.isArray(imported.allocations) ? imported.allocations : structuredClone(defaults.allocations) };
    document.getElementById("scenarioName").value = state.scenarioName;
    document.querySelectorAll("[data-key]").forEach(input => input.value = state[input.dataset.key]);
    renderAllocations();
    persistAndRender();
    showToast("Cenário importado");
  } catch { showToast("Arquivo inválido"); }
}

async function copySummary() {
  try { await navigator.clipboard.writeText(scenarioSummary()); showToast("Resumo copiado"); }
  catch { showToast("Não foi possível copiar"); }
}

function resetScenario() {
  state = structuredClone(defaults);
  localStorage.removeItem(STORAGE_KEY);
  document.getElementById("scenarioName").value = state.scenarioName;
  document.querySelectorAll("[data-key]").forEach(input => input.value = state[input.dataset.key]);
  renderAllocations(); render(); showToast("Exemplo restaurado");
}

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const register = (tool) => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
  register({
    name: "read_economeo_margin_scenario",
    title: "Ler cenário de margem",
    description: "Retorna as premissas e os principais resultados do cenário atualmente visível.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => ({ scenario: state, results: calculate() })
  });
  register({
    name: "update_economeo_margin_assumptions",
    title: "Atualizar premissas de margem",
    description: "Atualiza em lote campos numéricos existentes do cenário e recalcula a tela.",
    inputSchema: { type: "object", properties: { assumptions: { type: "object", additionalProperties: { type: "number", minimum: 0 } } }, required: ["assumptions"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: ({ assumptions }) => {
      const allowed = Object.keys(defaults).filter(key => typeof defaults[key] === "number");
      Object.entries(assumptions || {}).forEach(([key, value]) => { if (allowed.includes(key) && Number.isFinite(value) && value >= 0) state[key] = value; });
      document.querySelectorAll("[data-key]").forEach(input => input.value = state[input.dataset.key]);
      persistAndRender();
      return { updated: true, results: calculate() };
    }
  });
}

function setText(id, value) { document.getElementById(id).textContent = value; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function slugify(value) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function showToast(message) { const el = document.getElementById("toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 1800); }

document.getElementById("resetButton").addEventListener("click", resetScenario);
document.getElementById("exportButton").addEventListener("click", exportScenario);
document.getElementById("copyButton").addEventListener("click", copySummary);
document.getElementById("importInput").addEventListener("change", event => { const file = event.target.files?.[0]; if (file) importScenario(file); event.target.value = ""; });

bindFields();
renderAllocations();
render();
registerWebMcp();
