// kitchen.js — Painel Cozinha Bigfield + Beep + Impressão Automática + Reimprimir + Observações (Opção B)

const LS_ORDERS = "bf_orders";

// --- Broadcast Sync entre abas ---
let bc = null;
if ("BroadcastChannel" in window) {
  try {
    bc = new BroadcastChannel("bigfield_orders_channel");
  } catch (e) {}
}

// --- Beep ---
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.25;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => osc.stop(), 200);
  } catch (e) {}
}

// --- Impressão automática POS-58 ---
function printOrder(order) {
  const lines = [];

  lines.push("PIZZARIA BIGFIELD\n");
  lines.push("Tel: 81 98529-9617\n");
  lines.push("------------------------\n");
  lines.push(`PEDIDO: ${order.id}\n`);
  lines.push("------------------------\n");

  // Itens + observações (opção B)
  order.items.forEach((i) => {
    lines.push(`${i.qty}x ${i.name}\n`);
    if (i.note && i.note.trim() !== "") {
      lines.push(`  -> ${i.note.trim()}\n`);
    }
  });

  lines.push("------------------------\n");
  lines.push(`TOTAL: ${order.totalFormatted}\n`);

  if (order.deliveryType === "delivery") {
    lines.push("Entrega: Delivery\n");
    if (order.address) lines.push(`End: ${order.address}\n`);
  } else {
    lines.push("Retirada na loja\n");
  }

  if (order.customerName) lines.push(`Cliente: ${order.customerName}\n`);

  lines.push("------------------------\n");
  lines.push("⏱️ Estimativa: 40 min\n");
  lines.push("Obrigado pela preferência!\n\n\n");

  const text = lines.join("");
  const encoder = new TextEncoder();
  const bytes = Uint8Array.from([
    0x1b,
    0x40,
    ...encoder.encode(text),
    0x0a,
    0x0a,
    0x0a,
    0x1d,
    0x56,
    0x00,
  ]);

  fetch("http://localhost:9009/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: btoa(String.fromCharCode(...bytes)) }),
  }).catch(() => {});
}

// ---- DOM ----
const root = document.getElementById("orders-root");
const emptyEl = document.getElementById("empty");

document.getElementById("btn-refresh").onclick = render;
document.getElementById("btn-clear-done").onclick = () => {
  if (!confirm("Remover pedidos finalizados?")) return;
  writeOrders(readOrders().filter((o) => o.status !== "done"));
  render();
};

// --- Storage ---
function readOrders() {
  return JSON.parse(localStorage.getItem(LS_ORDERS) || "[]");
}
function writeOrders(orders, notify = true) {
  localStorage.setItem(LS_ORDERS, JSON.stringify(orders));
  if (notify && bc) bc.postMessage({ type: "orders_update" });
  try {
    localStorage.setItem("__bf_orders_ping__", Date.now());
  } catch (e) {}
}

// --- Status ---
function setStatus(id, status) {
  const orders = readOrders();
  const i = orders.findIndex((o) => o.id === id);
  if (i < 0) return;
  orders[i].status = status;
  writeOrders(orders);
  render();
}
function removeOrder(id) {
  writeOrders(readOrders().filter((o) => o.id !== id));
  render();
}

// --- Render ---
let lastCount = readOrders().length;

function render() {
  const orders = readOrders().slice().reverse();
  const filter =
    document.querySelector("input[name='filter']:checked")?.value || "all";

  const filtered = orders.filter((o) =>
    filter === "all"
      ? true
      : filter === "new"
      ? o.status === "new"
      : filter === "in_progress"
      ? o.status === "in_progress"
      : o.status === "done"
  );

  root.innerHTML = "";
  emptyEl.style.display = filtered.length ? "none" : "block";

  filtered.forEach((o) => {
    const el = document.createElement("div");
    el.className = "order";
    if (o.status === "new") el.style.animation = "flash 1s ease-in-out 0s 3";

    const when = new Date(o.createdAt).toLocaleString("pt-BR");

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3>Pedido ${o.id}</h3>
        <span class="badge ${o.status}">${
      o.status === "new"
        ? "Novo"
        : o.status === "in_progress"
        ? "Em preparo"
        : "Finalizado"
    }</span>
      </div>

      <div class="meta"><strong>${o.customerName || "-"}</strong> • ${
      o.deliveryType === "delivery" ? "Delivery" : "Retirada"
    }</div>

      <ul class="items">
        ${o.items
          .map(
            (i) => `
          <li>${i.qty}x ${i.name}${
              i.note && i.note.trim()
                ? `<br><small style="color:#c33;">→ ${i.note}</small>`
                : ""
            }</li>
        `
          )
          .join("")}
      </ul>

      <div class="small"><strong>Total:</strong> ${o.totalFormatted}</div>
      ${o.address ? `<div class="small">Endereço: ${o.address}</div>` : ""}
      <div class="timestamp">${when}</div>

      <div class="order-footer">
        <button class="btn ghost reprint" data-id="${o.id}">Reimprimir</button>
        ${
          o.status === "new"
            ? `<button class="btn start" data-id="${o.id}">Começar</button>`
            : ""
        }
        ${
          o.status !== "done"
            ? `<button class="btn done" data-id="${o.id}">Concluir</button>`
            : ""
        }
        <button class="btn ghost remove" data-id="${o.id}">Remover</button>
      </div>
    `;
    root.appendChild(el);
  });

  // Eventos
  root
    .querySelectorAll(".start")
    .forEach((b) => (b.onclick = () => setStatus(b.dataset.id, "in_progress")));
  root
    .querySelectorAll(".done")
    .forEach((b) => (b.onclick = () => setStatus(b.dataset.id, "done")));
  root
    .querySelectorAll(".remove")
    .forEach((b) => (b.onclick = () => removeOrder(b.dataset.id)));
  root.querySelectorAll(".reprint").forEach(
    (b) =>
      (b.onclick = () => {
        const order = readOrders().find((o) => o.id === b.dataset.id);
        if (order) printOrder(order);
      })
  );

  // Detectar pedido novo → beep + imprimir
  const count = readOrders().length;
  if (count > lastCount) {
    playBeep();
    printOrder(readOrders()[readOrders().length - 1]);
  }
  lastCount = count;
}

if (bc) bc.onmessage = render;
window.addEventListener("storage", (e) => {
  if (e.key === LS_ORDERS) render();
});
document
  .querySelectorAll("input[name='filter']")
  .forEach((r) => (r.onchange = render));
render();
