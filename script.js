/* script.js – Versão completa e funcional com atualização automática do total ao escolher o bairro (taxa de entrega) */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const catalogRoot = $("#catalog");
const categoriesRoot = $("#categories");
const searchInput = $("#search-input");

const cartPanel = $("#cart-panel");
const closeCartBtn = $("#close-cart");
const blurOverlay = $("#blur-overlay");
const cartItemsEl = $("#cart-items");
const cartSubtotalEl = $("#cart-subtotal");
const cartDiscountEl = $("#cart-discount");
const cartTotalEl = $("#cart-total");
const clearCartBtn = $("#clear-cart");
const openCheckoutBtn = $("#open-checkout");
const continueShoppingBtn = $("#continue-shopping");

const miniTotalEl = $("#mini-total");

const checkoutModal = $("#checkout-modal");
const closeCheckoutBtn = $("#close-checkout");
const confirmSendBtn = $("#confirm-send");
const checkoutName = $("#checkout-name");
const checkoutAddress = $("#checkout-address");
const bairroSelect = $("#bairro-select");
const resumoContainer = $("#resumo-container");

const orderTypeModal = $("#order-type-modal");
const orderButtons = $$(".order-btn");
const continueCheckoutBtn = $("#continue-checkout");
const pickupMsg = $("#pickup-msg");

const LS_CART = "cart";
const LS_ORDERS = "bf_orders";

let cart = [];
let catalog = [];
let activeCategory = null;
let orderType = null;
let appliedCoupon = null;
let pendingItem = null;
let creamCheeseItem = null;

// Cupons disponíveis
const availableCoupons = {
  BIGFIELD10: {
    discount: 10,
    type: "percent",
    minPurchase: 50,
    description: "10% off em pedidos acima de R$50",
  },
  PIZZA20: {
    discount: 20,
    type: "percent",
    minPurchase: 0,
    description: "20% off em qualquer pizza",
  },
  FRETEGRATIS: {
    discount: 10,
    type: "fixed",
    minPurchase: 100,
    description: "Frete grátis (R$10 off) acima de 100",
  },
};

function moneyBR(v) {
  v = Number(v) || 0;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function uid() {
  return "PED_" + Math.random().toString(36).slice(2, 9);
}

function saveCart() {
  localStorage.setItem(
    LS_CART,
    JSON.stringify({ items: cart, coupon: appliedCoupon })
  );
}

function getDeliveryFee() {
  const select = $("#bairro-select");
  const selectedText = select.options[select.selectedIndex]?.text || "";
  const match = selectedText.match(/R\$ ([\d.,]+)/);
  if (match) return parseFloat(match[1].replace(",", "."));
  return 0;
}

function debounce(fn, delay = 300) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

/* =============================
   Carregar cardápio
============================= */
async function loadCatalog() {
  try {
    const res = await fetch("cardapio.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
    const data = await res.json();

    const categorias = [...new Set(data.map((i) => i.category))];
    catalog = categorias.map((cat) => ({
      nome: cat,
      itens: data.filter((i) => i.category === cat),
    }));

    renderCategories(categorias);
    activeCategory = categorias[0];
    const grupo = catalog.find((c) => c.nome === activeCategory);
    if (grupo) renderCatalog(grupo.itens);
  } catch (err) {
    console.error("Falha ao carregar cardápio:", err);
    catalogRoot.innerHTML =
      '<p aria-live="assertive" style="text-align:center;color:#aaa;margin-top:40px;">⚠️ Erro ao carregar cardápio. Tente recarregar.</p>';
  }
}

/* =============================
   Renderização
============================= */
function renderCategories(cats) {
  categoriesRoot.innerHTML = "";
  cats.forEach((cat, idx) => {
    const btn = document.createElement("button");
    btn.className = "category-pill";
    btn.textContent = cat;
    if (idx === 0) btn.classList.add("active");
    btn.onclick = () => {
      $$(".category-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = cat;
      const grupo = catalog.find((c) => c.nome === cat);
      if (grupo) renderCatalog(grupo.itens);
      btn.scrollIntoView({ behavior: "smooth", inline: "center" });
    };
    categoriesRoot.appendChild(btn);
  });
}

function renderCatalog(items) {
  catalogRoot.innerHTML = "";
  if (!items.length) {
    catalogRoot.innerHTML =
      '<p style="text-align:center;color:#aaa;padding:30px;">Nenhum item disponível.</p>';
    return;
  }

  const section = document.createElement("section");
  section.className = "catalog-section";
  section.innerHTML = `<h2>${activeCategory}</h2>`;
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "item";
    card.innerHTML = `
      <picture><img loading="lazy" src="${item.image}" alt="${
      item.name
    }"></picture>
      <div class="item-info"><h3>${item.name}</h3></div>
      <div class="item-right">
        <span class="price">${moneyBR(item.price)}</span>
        <button class="add-cart" data-id="${item.id}">Adicionar</button>
      </div>`;
    section.appendChild(card);
  });
  catalogRoot.appendChild(section);

  $$(".item").forEach((item, index) => {
    item.style.animation = "fadeUp 0.5s ease forwards";
    item.style.animationDelay = `${index * 0.1}s`;
  });
}

/* =============================
   BUSCA
============================= */
searchInput.addEventListener(
  "input",
  debounce((e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      const grupo = catalog.find((c) => c.nome === activeCategory);
      if (grupo) renderCatalog(grupo.itens);
      return;
    }
    const filtrados = catalog
      .flatMap((c) => c.itens)
      .filter((i) => i.name.toLowerCase().includes(q));
    renderCatalog(filtrados);
  })
);

/* =============================
   Render item carrinho (suporte subitens)
============================= */
function renderCartItemHTML(i) {
  let subHtml = "";
  if (i.subitems && Array.isArray(i.subitems)) {
    subHtml =
      `<ul style="margin:6px 0 0 0; padding-left:14px; color:#ccc; font-size:0.8rem; list-style:disc;">` +
      i.subitems
        .map((s) => `<li>- ${s.name} (${moneyBR(s.price)})</li>`)
        .join("") +
      `</ul>`;
  }

  return `
    <div class="cart-item" data-id="${i.id}">
      <img src="${i.image}" alt="${i.name}">
      <div class="cart-item-info">
        <h4>${i.name}</h4>
        ${subHtml}
        <div class="cart-controls">
          <button class="qty-btn" data-action="dec" data-id="${i.id}">−</button>
          <span class="qty-display">${i.qty}</span>
          <button class="qty-btn" data-action="inc" data-id="${i.id}">+</button>
        </div>
      </div>
      <div class="cart-right">
        <div class="price">${moneyBR((i.price + sumSubitems(i)) * i.qty)}</div>
        <button class="remove" data-id="${i.id}">×</button>
      </div>
    </div>`;
}

function sumSubitems(item) {
  if (!item.subitems) return 0;
  return item.subitems.reduce((s, x) => s + Number(x.price || 0), 0);
}

/* =============================
   Modal Cream Cheese
============================= */
document.body.insertAdjacentHTML(
  "beforeend",
  `
<div id="cream-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:all .25s ease;z-index:9999;">
  <div style="background:#000;color:#fff;padding:26px;width:90%;max-width:420px;border-radius:14px;text-align:center;box-shadow:0 0 30px rgba(0,0,0,0.6);">
    <h3 style="margin-bottom:16px;font-size:1.2rem;">Que tal adicionar cream cheese na sua pizza por mais R$ 5,00?</h3>
    <div style="display:flex;gap:12px;margin-top:20px;">
      <button id="cream-yes" style="flex:1;background:orange;color:#000;font-weight:700;padding:10px;border-radius:10px;border:none;cursor:pointer;">Sim</button>
      <button id="cream-no" style="flex:1;background:orange;color:#000;font-weight:700;padding:10px;border-radius:10px;border:none;cursor:pointer;">Não</button>
    </div>
  </div>
</div>`
);

const creamModal = $("#cream-modal");
const creamYesBtn = $("#cream-yes");
const creamNoBtn = $("#cream-no");

function abrirCreamModal() {
  creamModal.style.opacity = "1";
  creamModal.style.pointerEvents = "all";
}
function fecharCreamModal() {
  creamModal.style.opacity = "0";
  creamModal.style.pointerEvents = "none";
  pendingItem = null;
}

creamYesBtn.onclick = () => {
  if (pendingItem) {
    cart.push({
      ...pendingItem,
      qty: 1,
      subitems: [
        {
          name: "Adicional de Cream Cheese",
          price: creamCheeseItem ? creamCheeseItem.price : 5,
        },
      ],
    });
    saveCart();
    renderCart();
    showToast("Pizza + cream cheese adicionados! 🍕🧀");
  }
  fecharCreamModal();
};

creamNoBtn.onclick = () => {
  if (pendingItem) {
    cart.push({ ...pendingItem, qty: 1 });
    saveCart();
    renderCart();
    showToast("Pizza adicionada 🍕");
  }
  fecharCreamModal();
};

/* =============================
   Render Carrinho
============================= */
function renderCart() {
  if (!cart.length) {
    cartItemsEl.innerHTML =
      '<p style="color:#aaa;text-align:center;margin-top:20px;">Carrinho vazio</p>';
    cartSubtotalEl.textContent = moneyBR(0);
    cartDiscountEl.textContent = moneyBR(0);
    cartTotalEl.textContent = moneyBR(0);
    miniTotalEl.textContent = moneyBR(0);
    return;
  }

  cartItemsEl.innerHTML = cart.map(renderCartItemHTML).join("");

  const subtotal = cart.reduce(
    (s, i) => s + (i.price + sumSubitems(i)) * i.qty,
    0
  );

  let discountValue = 0;
  if (appliedCoupon) {
    const cup = availableCoupons[appliedCoupon];
    if (cup) {
      discountValue =
        cup.type === "percent" ? (subtotal * cup.discount) / 100 : cup.discount;
    }
  }

  const deliveryFee = orderType === "Entrega" ? getDeliveryFee() : 0;
  const total = subtotal - discountValue + deliveryFee;

  cartSubtotalEl.textContent = moneyBR(subtotal);
  cartDiscountEl.textContent = moneyBR(discountValue);
  cartTotalEl.textContent = moneyBR(total);
  miniTotalEl.textContent = moneyBR(total);
}

/* =============================
   Fly-to-cart animation
============================= */
function animateFlyToCart(img) {
  const clone = img.cloneNode();
  const rect = img.getBoundingClientRect();
  const cartRect = $("#mini-cart").getBoundingClientRect();

  clone.style.position = "fixed";
  clone.style.left = rect.left + "px";
  clone.style.top = rect.top + "px";
  clone.style.width = rect.width + "px";
  clone.style.height = rect.height + "px";
  clone.style.zIndex = "1000";
  clone.classList.add("fly-to-cart");

  document.body.appendChild(clone);

  const deltaX =
    cartRect.left - rect.left + (cartRect.width / 2 - rect.width / 2);
  const deltaY =
    cartRect.top - rect.top + (cartRect.height / 2 - rect.height / 2);

  clone.style.setProperty("--delta-x", `${deltaX}px`);
  clone.style.setProperty("--delta-y", `${deltaY}px`);

  setTimeout(() => {
    clone.remove();
    $("#mini-cart").classList.add("bounce");
    setTimeout(() => $("#mini-cart").classList.remove("bounce"), 600);
  }, 1200);
}

/* =============================
   Resumo do pedido (usado no checkout)
============================= */
function montarResumoPedido() {
  if (!cart.length) {
    resumoContainer.innerHTML =
      "<p style='color:#aaa;text-align:center;'>Carrinho vazio</p>";
    return;
  }

  let html = "<h3>Resumo do Pedido</h3><ul>";

  cart.forEach((i) => {
    let line = `<li>${i.qty} × ${i.name} – ${moneyBR(
      (i.price + sumSubitems(i)) * i.qty
    )}</li>`;
    if (i.subitems) {
      line = `<li>${i.qty} × ${i.name} – ${moneyBR(
        (i.price + sumSubitems(i)) * i.qty
      )}<ul>`;
      i.subitems.forEach(
        (s) =>
          (line += `<li style='font-size:0.9rem;'>+ ${s.name} (${moneyBR(
            s.price
          )})</li>`)
      );
      line += "</ul></li>";
    }
    html += line;
  });

  html += "</ul>";

  const subtotal = cart.reduce(
    (s, i) => s + (i.price + sumSubitems(i)) * i.qty,
    0
  );
  let discountValue = 0;
  if (appliedCoupon) {
    const cup = availableCoupons[appliedCoupon];
    if (cup)
      discountValue =
        cup.type === "percent" ? (subtotal * cup.discount) / 100 : cup.discount;
  }

  const deliveryFee = orderType === "Entrega" ? getDeliveryFee() : 0;
  const total = subtotal - discountValue + deliveryFee;

  html += `<p>Subtotal: ${moneyBR(subtotal)}</p>`;
  if (appliedCoupon)
    html += `<p>Desconto (${appliedCoupon}): -${moneyBR(discountValue)}</p>`;
  if (orderType === "Entrega")
    html += `<p>Entrega: ${moneyBR(deliveryFee)}</p>`;
  html += `<p><strong>Total: ${moneyBR(total)}</strong></p>`;

  resumoContainer.innerHTML = html;
}

/* =============================
   Event delegation
============================= */
document.addEventListener("click", (e) => {
  // Adicionar ao carrinho
  if (e.target.classList.contains("add-cart")) {
    const id = e.target.dataset.id;
    const item = catalog.flatMap((c) => c.itens).find((i) => i.id === id);
    if (!item) return;

    const img = e.target.closest(".item")?.querySelector("img");
    if (img) animateFlyToCart(img);

    if (item.category.includes("Pizza")) {
      pendingItem = item;
      creamCheeseItem = catalog
        .flatMap((c) => c.itens)
        .find((i) => i.id === "cream_cheese");
      abrirCreamModal();
    } else {
      const existente = cart.find((c) => c.id === id);
      if (existente) existente.qty++;
      else cart.push({ ...item, qty: 1 });
      saveCart();
      renderCart();
      showToast("Item adicionado ✅");
    }
  }

  // Quantidade
  else if (e.target.classList.contains("qty-btn")) {
    const id = e.target.dataset.id;
    const action = e.target.dataset.action;
    const item = cart.find((i) => i.id === id);
    if (!item) return;

    if (action === "inc") item.qty++;
    else {
      item.qty--;
      if (item.qty <= 0) {
        cart = cart.filter((i) => i.id !== id);
        showToast("Item removido ❌");
      }
    }
    saveCart();
    renderCart();
    if (checkoutModal.classList.contains("show")) montarResumoPedido();
  }

  // Remover
  else if (e.target.classList.contains("remove")) {
    const id = e.target.dataset.id;
    cart = cart.filter((i) => i.id !== id);
    saveCart();
    renderCart();
    if (checkoutModal.classList.contains("show")) montarResumoPedido();
    showToast("Item removido ❌");
  }

  // Aplicar cupom
  else if (e.target.id === "apply-coupon") {
    const code = $("#coupon-input").value.trim().toUpperCase();
    if (!availableCoupons[code]) {
      alert("Cupom inválido!");
      return;
    }
    appliedCoupon = code;
    saveCart();
    renderCart();
    if (checkoutModal.classList.contains("show")) montarResumoPedido();
    showToast("Cupom aplicado!");
  }

  // Limpar carrinho
  else if (e.target.id === "clear-cart") {
    if (!cart.length || !confirm("Tem certeza que deseja limpar o carrinho?"))
      return;
    cart = [];
    appliedCoupon = null;
    saveCart();
    renderCart();
  }

  // Abrir modal tipo pedido
  else if (e.target.id === "open-checkout") {
    if (!cart.length) return showToast("Carrinho vazio!");
    orderTypeModal.classList.add("show");
  }

  // Tipo de pedido
  else if (e.target.classList.contains("order-btn")) {
    orderButtons.forEach((b) => b.classList.remove("active"));
    e.target.classList.add("active");
    orderType = e.target.dataset.type;

    if (orderType === "Retirada") {
      pickupMsg.style.display = "block";
      checkoutAddress.style.display = "none";
      bairroSelect.style.display = "none";
    } else {
      pickupMsg.style.display = "none";
      checkoutAddress.style.display = "block";
      bairroSelect.style.display = "block";
    }
    continueCheckoutBtn.disabled = false;
  }

  // Continuar para checkout
  else if (e.target.id === "continue-checkout") {
    orderTypeModal.classList.remove("show");
    checkoutModal.classList.add("show");
    montarResumoPedido();
  }

  // Fechar checkout
  else if (e.target.id === "close-checkout") {
    checkoutModal.classList.remove("show");
  }

  // Confirmar envio WhatsApp
  else if (e.target.id === "confirm-send") {
    if (!checkoutName.value.trim()) return showToast("Digite seu nome!");

    let msg = `*Novo pedido – Big Field Pizzaria*\nNome: *${checkoutName.value.trim()}*\nTipo: *${orderType}*\n\n*Itens:*\n`;
    cart.forEach((i) => {
      msg += `• ${i.qty} × ${i.name} – ${moneyBR(
        (i.price + sumSubitems(i)) * i.qty
      )}\n`;
      if (i.subitems)
        i.subitems.forEach(
          (s) => (msg += `   → + ${s.name} (${moneyBR(s.price)})\n`)
        );
    });

    const subtotal = cart.reduce(
      (s, i) => s + (i.price + sumSubitems(i)) * i.qty,
      0
    );
    let discountValue = 0;
    if (appliedCoupon) {
      const cup = availableCoupons[appliedCoupon];
      discountValue =
        cup.type === "percent" ? (subtotal * cup.discount) / 100 : cup.discount;
      msg += `Desconto (${appliedCoupon}): -${moneyBR(discountValue)}\n`;
    }

    const deliveryFee = orderType === "Entrega" ? getDeliveryFee() : 0;
    if (orderType === "Entrega") msg += `Entrega: ${moneyBR(deliveryFee)}\n`;
    if (orderType === "Entrega")
      msg += `Endereço: ${checkoutAddress.value.trim()}\n`;

    const total = subtotal - discountValue + deliveryFee;
    msg += `\n*Total: ${moneyBR(total)}*\n\nFico no aguardo! 🙏🍕`;

    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/5581985299617?text=${encoded}`, "_blank");

    // Salvar histórico (opcional)
    const old = JSON.parse(localStorage.getItem(LS_ORDERS) || "[]");
    old.push({ id: uid(), date: new Date().toISOString(), items: cart, total });
    localStorage.setItem(LS_ORDERS, JSON.stringify(old));

    // Limpar
    cart = [];
    appliedCoupon = null;
    saveCart();
    renderCart();
    checkoutModal.classList.remove("show");
    showToast("Pedido enviado! ✅");
  }
});

/* Atualização automática do total ao escolher bairro */
bairroSelect.addEventListener("change", () => {
  if (orderType === "Entrega" && checkoutModal.classList.contains("show")) {
    montarResumoPedido();
  }
});

/* =============================
   Abrir/Fechar carrinho
============================= */
$("#mini-cart").onclick = () => {
  cartPanel.classList.toggle("open-half");
  blurOverlay.classList.toggle("show");
};
closeCartBtn.onclick = continueShoppingBtn.onclick = () => {
  cartPanel.classList.remove("open-half");
  blurOverlay.classList.remove("show");
};

/* Drag to close no mobile */
let touchStartY = 0;
cartPanel.addEventListener("touchstart", (e) => {
  touchStartY = e.touches[0].clientY;
  cartPanel.style.transition = "none";
});
cartPanel.addEventListener("touchmove", (e) => {
  const delta = e.touches[0].clientY - touchStartY;
  if (delta > 0) {
    e.preventDefault();
    cartPanel.style.transform = `translateX(-50%) translateY(${delta}px)`;
  }
});
cartPanel.addEventListener("touchend", () => {
  const delta = touchEndY - touchStartY;
  cartPanel.style.transition = "transform 0.45s cubic-bezier(0.2, 0.9, 0.3, 1)";
  if (delta > 100) {
    cartPanel.classList.remove("open-half");
    blurOverlay.classList.remove("show");
  }
  cartPanel.style.transform = "";
});

/* =============================
   Toast
============================= */
function showToast(msg) {
  const div = document.createElement("div");
  div.className = "toast";
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.classList.add("show"), 20);
  setTimeout(() => {
    div.classList.remove("show");
    setTimeout(() => div.remove(), 300);
  }, 2500);
}

/* =============================
   Init
============================= */
async function init() {
  const saved = JSON.parse(localStorage.getItem(LS_CART) || "{}");
  if (saved.items) {
    cart = saved.items;
    appliedCoupon = saved.coupon || null;
  }
  await loadCatalog();
  renderCart();
}

init();
