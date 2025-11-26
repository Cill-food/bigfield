/* admin.js — Painel Profissional (mapa, faixas, bairros, produtos, export/import)
   - Salva/Carrega bf_config no localStorage
   - Gerencia faixas de distância (desenha círculos no mapa)
   - Gerencia bairros com taxa fixa (match por keywords)
   - CRUD de produtos + conversão WebP client-side
   - Export / Import config & products
   - Dashboard simples + pedidos (bf_orders)
*/

/* =========================
   Consts / Keys / Selectors
   ========================= */
const LS_CONFIG = "bf_config";
const LS_PRODUCTS = "bf_cardapio";
const LS_ORDERS = "bf_orders";
const LS_MAPS_KEY = "maps_api_key"; // where saved maps key from admin

// selectors (from admin.html)
const tabDashboard = document.getElementById("tab-dashboard");
const tabOrders = document.getElementById("tab-orders");
const tabDelivery = document.getElementById("tab-delivery");
const tabProducts = document.getElementById("tab-products");
const tabSettings = document.getElementById("tab-settings");

const panelDashboard = document.getElementById("panel-dashboard");
const panelOrders = document.getElementById("panel-orders");
const panelDelivery = document.getElementById("panel-delivery");
const panelProducts = document.getElementById("panel-products");
const panelSettings = document.getElementById("panel-settings");

const exportConfigBtn = document.getElementById("export-config");
const importConfigBtn = document.getElementById("import-config");
const fileConfigInput = document.getElementById("file-config");

const exportProductsBtn = document.getElementById("export-products");
const importProductsBtn = document.getElementById("import-products");
const fileProductsInput = document.getElementById("file-products");

const cfgNameInput = document.getElementById("cfg-name");
const cfgAvgInput = document.getElementById("cfg-avg");
const saveQuickCfgBtn = document.getElementById("save-quick-cfg");

const ordersListEl = document.getElementById("orders-list");
const metricOrders = document.getElementById("metric-orders");
const metricTopPizza = document.getElementById("metric-top-pizza");

const adminMapEl = document.getElementById("admin-map");
const cfgAddressInput = document.getElementById("cfg-address");
const btnGeocode = document.getElementById("btn-geocode");
const btnAddSample = document.getElementById("btn-add-sample");
const btnClearRings = document.getElementById("btn-clear-rings");

const tierMin = document.getElementById("tier-min");
const tierMinUnit = document.getElementById("tier-min-unit");
const tierMax = document.getElementById("tier-max");
const tierMaxUnit = document.getElementById("tier-max-unit");
const tierFee = document.getElementById("tier-fee");
const tierAddBtn = document.getElementById("tier-add");
const tierCenterBtn = document.getElementById("tier-center");
const tiersListEl = document.getElementById("tiers-list");

const nbListEl = document.getElementById("nb-list");
const nbNameInput = document.getElementById("nb-name");
const nbKeysInput = document.getElementById("nb-keys");
const nbFeeInput = document.getElementById("nb-fee");
const nbAddBtn = document.getElementById("nb-add");

const productListEl = document.getElementById("product-list");
const productForm = document.getElementById("product-form");
const prdId = document.getElementById("prd-id");
const prdName = document.getElementById("prd-name");
const prdPrice = document.getElementById("prd-price");
const prdCategory = document.getElementById("prd-category");
const prdDesc = document.getElementById("prd-desc");
const prdImageFile = document.getElementById("prd-image-file");
const imagePreview = document.getElementById("image-preview");
const btnDeleteProduct = document.getElementById("btn-delete");
const btnNewProduct = document.getElementById("btn-new-product");
const btnRefreshProducts = document.getElementById("btn-refresh-products");
const jsonPreviewEl = document.getElementById("json-preview");

const mapsKeyInput = document.getElementById("maps-key");
const btnSaveMapsKey = document.getElementById("btn-save-maps-key");
const btnTestGeocode = document.getElementById("btn-test-geocode");
const configPreviewEl = document.getElementById("config-preview");
const btnClearConfig = document.getElementById("btn-clear-config");

const btnLogout = document.getElementById("btn-logout");
const btnSimulate = document.getElementById("btn-simulate");
const refreshDashboardBtn = document.getElementById("refresh-dashboard");
const btnExportConfig = exportConfigBtn;

/* =========================
   App state
   ========================= */
let map = null;
let mapCenter = { lat: -8.06182, lng: -34.87641 }; // default Recife approx
let mapMarker = null;
let rings = []; // [{circle: google.maps.Circle, id, minM, maxM, fee}]
let cfg = null;
let products = [];
let orders = [];

/* =========================
   Utilities: storage
   ========================= */
function readConfig() {
  try {
    const raw = localStorage.getItem(LS_CONFIG);
    if (!raw) {
      const defaultCfg = {
        store: {
          name: "Pizzaria Bigfield",
          address:
            "R. Jerônimo Viléla, 659 - Campo Grande, Recife - PE, 52040-180",
          coords: mapCenter,
          open: true,
          avgPrepMins: 40,
        },
        mode: "hybrid",
        delivery: {
          byNeighborhood: [],
          distanceTiers: [],
        },
      };
      localStorage.setItem(LS_CONFIG, JSON.stringify(defaultCfg));
      return defaultCfg;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.warn("readConfig error", e);
    return {};
  }
}
function writeConfig(obj) {
  cfg = obj;
  localStorage.setItem(LS_CONFIG, JSON.stringify(obj));
  renderConfigPreview();
}
function readProducts() {
  try {
    return JSON.parse(localStorage.getItem(LS_PRODUCTS) || "[]");
  } catch {
    return [];
  }
}
function writeProducts(data) {
  products = data;
  localStorage.setItem(LS_PRODUCTS, JSON.stringify(data));
  renderProductList();
}
function readOrders() {
  try {
    return JSON.parse(localStorage.getItem(LS_ORDERS) || "[]");
  } catch {
    return [];
  }
}
function writeOrders(list) {
  orders = list;
  localStorage.setItem(LS_ORDERS, JSON.stringify(list));
  renderOrdersList();
}

/* =========================
   Map Loader / Init
   ========================= */
function loadGoogleMapsScript(key, onload) {
  if (!key) return onload(new Error("API key vazia"));
  // avoid duplicate
  if (document.querySelector("script[data-admin-maps]")) {
    if (window.google && google.maps) return onload(null);
    // else wait a bit
  }
  const s = document.createElement("script");
  s.setAttribute("data-admin-maps", "1");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
    key
  )}&libraries=places`;
  s.onload = () => onload(null);
  s.onerror = (e) => onload(new Error("Falha ao carregar Google Maps"));
  document.head.appendChild(s);
}

/* initialize map (if google loaded) */
function initAdminMap() {
  if (!window.google || !google.maps) {
    adminMapEl.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#bbb;padding:12px">Mapa indisponível — cole sua chave em Configurações e clique em "Salvar chave".</div>`;
    return;
  }

  // create map
  map = new google.maps.Map(adminMapEl, {
    center: cfg.store?.coords || mapCenter,
    zoom: 14,
    disableDefaultUI: true,
    gestureHandling: "greedy",
  });

  // store marker
  mapMarker = new google.maps.Marker({
    position: cfg.store?.coords || mapCenter,
    map,
    draggable: true,
    title: "Loja (arraste para ajustar)",
  });

  mapMarker.addListener("dragend", () => {
    const p = mapMarker.getPosition();
    cfg.store.coords = { lat: p.lat(), lng: p.lng() };
    writeConfig(cfg);
    renderConfigPreview();
  });

  // load existing rings
  rebuildRingsFromConfig();
}

/* =========================
   Ring helpers (draw / remove)
   ========================= */
function metersFromInput(rawValue, unit) {
  const n = parseFloat(rawValue);
  if (isNaN(n)) return null;
  return unit === "km" ? Math.round(n * 1000) : Math.round(n);
}

function drawRing(minM, maxM, fee, id) {
  // draws circle for maxM (outer). For visibility, draw outer ring with stroke and fill transparent.
  if (!map) return null;
  const circle = new google.maps.Circle({
    strokeColor: "#ffb703",
    strokeOpacity: 0.7,
    strokeWeight: 2,
    fillColor: "#ffb703",
    fillOpacity: 0.06,
    map,
    center: cfg.store.coords,
    radius: maxM, // meters
    clickable: true,
    zIndex: 50,
  });
  // store meta
  const meta = { circle, id: id || uid("ring"), minM, maxM, fee };
  rings.push(meta);

  circle.addListener("click", () => {
    // highlight and scroll to list entry
    highlightTier(meta.id);
  });

  return meta;
}
function removeRingById(id) {
  const idx = rings.findIndex((r) => r.id === id);
  if (idx >= 0) {
    const meta = rings[idx];
    meta.circle.setMap(null);
    rings.splice(idx, 1);
  }
}
function clearAllRings() {
  rings.forEach((r) => r.circle && r.circle.setMap(null));
  rings = [];
}

/* =========================
   Render config preview / tiers / neighborhoods
   ========================= */
function renderConfigPreview() {
  configPreviewEl.textContent = JSON.stringify(cfg, null, 2);
}

function renderTiersList() {
  tiersListEl.innerHTML = "";
  const tiers =
    cfg.delivery && cfg.delivery.distanceTiers
      ? cfg.delivery.distanceTiers.slice().sort((a, b) => a.minM - b.minM)
      : [];
  if (!tiers.length)
    tiersListEl.innerHTML = `<div class="small muted">Nenhuma faixa definida.</div>`;
  tiers.forEach((t, idx) => {
    const tr = document.createElement("div");
    tr.className = "list-item";
    const minLabel =
      t.minM >= 1000 ? (t.minM / 1000).toFixed(2) + " km" : t.minM + " m";
    const maxLabel =
      t.maxM >= 1000 ? (t.maxM / 1000).toFixed(2) + " km" : t.maxM + " m";
    tr.innerHTML = `<div>
        <strong>${minLabel} — ${maxLabel}</strong><br><span class="muted">R$ ${Number(
      t.fee
    ).toFixed(2)}</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn ghost" data-act="edit-tier" data-idx="${idx}">Editar</button>
        <button class="btn" data-act="del-tier" data-idx="${idx}">Remover</button>
      </div>`;
    tiersListEl.appendChild(tr);
  });

  // bind actions
  tiersListEl.querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      const act = b.dataset.act;
      const idx = Number(b.dataset.idx);
      if (act === "del-tier") {
        if (!confirm("Remover faixa?")) return;
        cfg.delivery.distanceTiers.splice(idx, 1);
        // remove ring by matching min/max/fee (first match)
        const t = cfg.delivery.distanceTiers[idx];
        // To simplify, remove the last ring that matches the radius range roughly
        // We'll rebuild rings after save
        rebuildRingsFromConfig();
        writeConfig(cfg);
        renderTiersList();
      } else if (act === "edit-tier") {
        const t = cfg.delivery.distanceTiers[idx];
        const newMin = prompt(
          "Min (use 'm' ou 'km' suffix if quiser):",
          t.minM >= 1000 ? t.minM / 1000 : t.minM
        );
        if (newMin === null) return;
        const newMax = prompt(
          "Max (use 'm' or 'km'):",
          t.maxM >= 1000 ? t.maxM / 1000 : t.maxM
        );
        if (newMax === null) return;
        const newFee = prompt("Taxa (R$):", t.fee);
        if (newFee === null) return;
        const nm = parseDistanceStringToMeters(String(newMin));
        const nx = parseDistanceStringToMeters(String(newMax));
        t.minM = nm;
        t.maxM = nx;
        t.fee = parseFloat(newFee) || 0;
        writeConfig(cfg);
        rebuildRingsFromConfig();
        renderTiersList();
      }
    };
  });
}

function parseDistanceStringToMeters(s) {
  if (!s) return 0;
  const str = String(s).trim().toLowerCase();
  if (str.endsWith("km"))
    return Math.round(parseFloat(str.replace("km", "")) * 1000);
  if (str.endsWith("m")) return Math.round(parseFloat(str.replace("m", "")));
  const n = parseFloat(str);
  // heuristic: if less than 10 assume km decimal, else meters
  if (n < 10) return Math.round(n * 1000);
  return Math.round(n);
}

function renderNeighborhoods() {
  nbListEl.innerHTML = "";
  const nbs =
    cfg.delivery && cfg.delivery.byNeighborhood
      ? cfg.delivery.byNeighborhood
      : [];
  if (!nbs.length)
    nbListEl.innerHTML = `<div class="small muted">Nenhum bairro definido.</div>`;
  nbs.forEach((nb, idx) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `<div><strong>${
      nb.name
    }</strong><br><span class="muted">keywords: ${(nb.keywords || []).join(
      ", "
    )} • R$ ${Number(nb.fee || 0).toFixed(2)}</span></div>
      <div style="display:flex;gap:8px">
        <button class="btn ghost" data-act="edit-nb" data-idx="${idx}">Editar</button>
        <button class="btn" data-act="del-nb" data-idx="${idx}">Remover</button>
      </div>`;
    nbListEl.appendChild(row);
  });

  nbListEl.querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      const act = b.dataset.act;
      const idx = Number(b.dataset.idx);
      if (act === "del-nb") {
        if (!confirm("Remover bairro?")) return;
        cfg.delivery.byNeighborhood.splice(idx, 1);
        writeConfig(cfg);
        renderNeighborhoods();
      } else if (act === "edit-nb") {
        const x = cfg.delivery.byNeighborhood[idx];
        const newName = prompt("Nome do bairro:", x.name);
        if (newName === null) return;
        const newKeys = prompt(
          "Keywords (separadas por vírgula):",
          (x.keywords || []).join(",")
        );
        if (newKeys === null) return;
        const newFee = prompt("Taxa (R$):", x.fee);
        if (newFee === null) return;
        x.name = newName.trim();
        x.keywords = (newKeys || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        x.fee = parseFloat(newFee) || 0;
        writeConfig(cfg);
        renderNeighborhoods();
      }
    };
  });
}

/* =========================
   Rings rebuild from config
   ========================= */
function rebuildRingsFromConfig() {
  // clear existing
  clearAllRings();
  const tiers =
    cfg.delivery && cfg.delivery.distanceTiers
      ? cfg.delivery.distanceTiers
      : [];
  (tiers || []).forEach((t) => {
    drawRing(t.minM, t.maxM, t.fee, uid("ring"));
  });
}

/* =========================
   CRUD: Add Tier
   ========================= */
tierAddBtn.onclick = () => {
  const minRaw = tierMin.value.trim();
  const maxRaw = tierMax.value.trim();
  const minUnitVal = tierMinUnit.value;
  const maxUnitVal = tierMaxUnit.value;
  const feeVal = parseFloat(tierFee.value);
  if (!minRaw || !maxRaw || Number.isNaN(feeVal))
    return alert("Preencha min, max e taxa válidos.");

  const minM =
    metersFromInput(minRaw, minUnitVal) ?? parseDistanceStringToMeters(minRaw);
  const maxM =
    metersFromInput(maxRaw, maxUnitVal) ?? parseDistanceStringToMeters(maxRaw);
  if (minM >= maxM) return alert("min deve ser menor que max.");
  cfg.delivery.distanceTiers = cfg.delivery.distanceTiers || [];
  cfg.delivery.distanceTiers.push({ minM, maxM, fee: parseFloat(feeVal || 0) });
  // persist
  writeConfig(cfg);
  // draw ring for maxM
  drawRing(minM, maxM, feeVal, uid("ring"));
  // clear inputs
  tierMin.value = "";
  tierMax.value = "";
  tierFee.value = "";
  renderTiersList();
};

/* center map to store coords */
tierCenterBtn.onclick = () => {
  if (!map || !cfg.store || !cfg.store.coords) return;
  map.setCenter(cfg.store.coords);
  map.setZoom(14);
};

/* =========================
   Neighborhood CRUD
   ========================= */
nbAddBtn.onclick = () => {
  const name = nbNameInput.value.trim();
  const keys = (nbKeysInput.value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const fee = parseFloat(nbFeeInput.value) || 0;
  if (!name) return alert("Nome do bairro é obrigatório.");
  cfg.delivery.byNeighborhood = cfg.delivery.byNeighborhood || [];
  cfg.delivery.byNeighborhood.push({ name, keywords: keys, fee });
  writeConfig(cfg);
  nbNameInput.value = "";
  nbKeysInput.value = "";
  nbFeeInput.value = "";
  renderNeighborhoods();
};

/* =========================
   Geocode: get coords from address (uses admin maps key)
   ========================= */
btnGeocode.onclick = async () => {
  const addr = cfgAddressInput.value.trim();
  if (!addr) return alert("Digite o endereço da loja.");
  // ensure maps loaded
  const mapsKey = localStorage.getItem(LS_MAPS_KEY) || mapsKeyInput.value;
  if (!mapsKey)
    return alert("Coloque a chave do Google Maps nas Configurações.");
  btnGeocode.disabled = true;
  btnGeocode.textContent = "Buscando...";
  loadGoogleMapsScript(mapsKey, (err) => {
    if (err) {
      alert("Não foi possível carregar a API do Maps. Verifique a chave.");
      btnGeocode.disabled = false;
      btnGeocode.textContent = "Obter coords";
      return;
    }
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: addr }, (results, status) => {
      btnGeocode.disabled = false;
      btnGeocode.textContent = "Obter coords";
      if (status === "OK" && results[0]) {
        const loc = results[0].geometry.location;
        cfg.store = cfg.store || {};
        cfg.store.coords = { lat: loc.lat(), lng: loc.lng() };
        cfg.store.address = addr;
        writeConfig(cfg);
        // init or move marker
        if (!map) initAdminMap();
        if (mapMarker) mapMarker.setPosition(cfg.store.coords);
        else
          mapMarker = new google.maps.Marker({
            position: cfg.store.coords,
            map,
            draggable: true,
          });
        map.setCenter(cfg.store.coords);
        alert("Coordenadas obtidas e salvas.");
      } else {
        alert("Geocode não retornou resultados. Tente ser mais específico.");
      }
    });
  });
};

/* =========================
   Product CRUD + WebP conversion
   ========================= */
function renderProductList() {
  products = readProducts();
  if (!products.length)
    productListEl.innerHTML = `<div class="small muted">Nenhum produto cadastrado.</div>`;
  else {
    productListEl.innerHTML = products
      .map(
        (p) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;background:rgba(255,255,255,0.01);margin-bottom:8px">
        <img src="${
          p.image || "imgs/placeholder.png"
        }" style="width:60px;height:60px;border-radius:8px;object-fit:cover">
        <div style="flex:1">
          <strong>${p.name}</strong><br><small class="muted">${
          p.category
        } • R$ ${Number(p.price || 0).toFixed(2)}</small>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn ghost" data-id="${
            p.id
          }" data-act="edit">Editar</button>
          <button class="btn" data-id="${p.id}" data-act="dup">Duplicar</button>
        </div>
      </div>
    `
      )
      .join("");
  }

  // bind buttons
  productListEl.querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.id;
      const act = b.dataset.act;
      if (act === "edit") loadProductToForm(id);
      if (act === "dup") duplicateProduct(id);
    };
  });

  jsonPreviewEl.textContent = JSON.stringify(products, null, 2);
}

function duplicateProduct(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  const copy = { ...p, id: uid("prd"), name: p.name + " (Cópia)" };
  products.unshift(copy);
  writeProducts(products);
  alert("Produto duplicado.");
}

function loadProductToForm(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  prdId.value = p.id;
  prdName.value = p.name;
  prdPrice.value = p.price;
  prdCategory.value = p.category;
  prdDesc.value = p.description || "";
  imagePreview.src = p.image || "";
  imagePreview.style.display = p.image ? "block" : "none";
  btnDeleteProduct.style.display = "inline-block";
}
function clearProductForm() {
  prdId.value = "";
  prdName.value = "";
  prdPrice.value = "";
  prdCategory.value = "";
  prdDesc.value = "";
  prdImageFile.value = "";
  imagePreview.src = "";
  imagePreview.style.display = "none";
  btnDeleteProduct.style.display = "none";
}

btnNewProduct.onclick = clearProductForm;

/* Image convert to webp */
prdImageFile &&
  prdImageFile.addEventListener("change", async () => {
    const f = prdImageFile.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/"))
      return alert("Envie um arquivo de imagem.");
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    const MAX_DIM = 1200;
    let w = img.width,
      h = img.height;
    if (Math.max(w, h) > MAX_DIM) {
      const scale = MAX_DIM / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) =>
      canvas.toBlob(res, "image/webp", 0.85)
    );
    const webpData = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    imagePreview.src = webpData;
    imagePreview.style.display = "block";
    // store temporarily on input element for save
    prdImageFile._webp = webpData;
  });

productForm &&
  productForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const list = readProducts();
    const obj = {
      id: prdId.value || uid("prd"),
      name: prdName.value.trim() || "Sem nome",
      price: parseFloat(prdPrice.value) || 0,
      category: prdCategory.value.trim() || "Sem categoria",
      description: prdDesc.value.trim() || "",
      image: prdImageFile._webp || imagePreview.src || "",
    };
    const idx = list.findIndex((x) => x.id === obj.id);
    if (idx >= 0) list[idx] = obj;
    else list.unshift(obj);
    writeProducts(list);
    clearProductForm();
    alert("Produto salvo.");
  });

btnDeleteProduct &&
  (btnDeleteProduct.onclick = () => {
    if (!prdId.value) return;
    if (!confirm("Excluir produto?")) return;
    const list = readProducts().filter((p) => p.id !== prdId.value);
    writeProducts(list);
    clearProductForm();
  });

/* product import/export */
exportProductsBtn &&
  exportProductsBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(readProducts(), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cardapio.json";
    a.click();
  });
importProductsBtn &&
  importProductsBtn.addEventListener("click", () => fileProductsInput.click());
fileProductsInput &&
  (fileProductsInput.onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        if (!Array.isArray(parsed)) throw new Error("Formato inválido");
        writeProducts(parsed);
        alert("Cardápio importado.");
      } catch (err) {
        alert("Arquivo inválido.");
      }
    };
    r.readAsText(f);
  });

/* =========================
   Export / Import config
   ========================= */
exportConfigBtn &&
  exportConfigBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bf_config.json";
    a.click();
  });
importConfigBtn &&
  importConfigBtn.addEventListener("click", () => fileConfigInput.click());
fileConfigInput &&
  (fileConfigInput.onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        writeConfig(parsed);
        // rebuild UI & map rings
        rebuildRingsFromConfig();
        renderTiersList();
        renderNeighborhoods();
        alert("Config importada.");
      } catch (err) {
        alert("Config inválida.");
      }
    };
    r.readAsText(f);
  });

/* =========================
   Orders list and dashboard
   ========================= */
function renderOrdersList() {
  orders = readOrders();
  ordersListEl.innerHTML = "";
  if (!orders.length)
    ordersListEl.innerHTML = `<div class="small muted">Sem pedidos.</div>`;
  orders
    .slice()
    .reverse()
    .forEach((o) => {
      const d = document.createElement("div");
      d.className = "order-item";
      d.innerHTML = `<div style="display:flex;justify-content:space-between"><strong>${
        o.customerName
      }</strong><small class="muted">${new Date(
        o.createdAt
      ).toLocaleString()}</small></div>
      <div class="small">${o.address} ${
        o.neighborhood ? "• " + o.neighborhood : ""
      }</div>
      <div style="margin-top:6px">${o.items
        .map((it) => `${it.qty}x ${it.name}`)
        .join(", ")}</div>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn ghost" data-id="${
        o.id
      }" data-act="view">Ver</button><button class="btn" data-id="${
        o.id
      }" data-act="del">Remover</button></div>
    `;
      ordersListEl.appendChild(d);
    });
  // bind
  ordersListEl.querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      const act = b.dataset.act;
      const id = b.dataset.id;
      if (act === "del") {
        if (!confirm("Remover pedido?")) return;
        orders = orders.filter((x) => x.id !== id);
        writeOrders(orders);
      } else if (act === "view") {
        const o = orders.find((x) => x.id === id);
        alert(
          `Pedido: ${o.customerName}\nEndereço: ${o.address}\nItens:\n${o.items
            .map((i) => `${i.qty}x ${i.name}`)
            .join("\n")}`
        );
      }
    };
  });

  // dashboard metrics
  metricOrders.textContent = orders.filter(
    (o) => new Date(o.createdAt).toDateString() === new Date().toDateString()
  ).length;
  // top pizza
  const allItems = orders.flatMap((o) => o.items || []);
  const counts = {};
  allItems.forEach((it) => {
    counts[it.name] = (counts[it.name] || 0) + (it.qty || 1);
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  metricTopPizza.textContent = sorted.length ? sorted[0][0] : "—";
}

/* simulate order (for testing) */
btnSimulate &&
  (btnSimulate.onclick = () => {
    const sample = {
      id: uid("PED"),
      createdAt: new Date().toISOString(),
      customerName: "Cliente Teste",
      address: "Rua X, 123",
      neighborhood: "Peixinhos",
      coords: cfg.store.coords,
      items: [{ id: "frango_economica", name: "Frango", price: 28.0, qty: 2 }],
      subtotal: 56,
      fee: 5,
      total: 61,
      status: "new",
    };
    const list = readOrders();
    list.push(sample);
    writeOrders(list);
    renderOrdersList();
  });

/* clear orders */
document.getElementById("btn-clear-orders") &&
  (document.getElementById("btn-clear-orders").onclick = () => {
    if (!confirm("Limpar histórico de pedidos?")) return;
    writeOrders([]);
  });

/* =========================
   Settings: save maps key / test geocode
   ========================= */
btnSaveMapsKey &&
  (btnSaveMapsKey.onclick = () => {
    const k = mapsKeyInput.value.trim();
    if (!k) return alert("Digite a chave.");
    localStorage.setItem(LS_MAPS_KEY, k);
    alert(
      "Chave salva (localStorage). Recarregue a aba de Taxas para carregar o mapa."
    );
  });

btnTestGeocode &&
  (btnTestGeocode.onclick = () => {
    const k = mapsKeyInput.value.trim() || localStorage.getItem(LS_MAPS_KEY);
    if (!k) return alert("Insira a chave primeiro.");
    loadGoogleMapsScript(k, (err) => {
      if (err)
        return alert("Não foi possível carregar Maps (verifique a chave).");
      alert("Google Maps carregado com sucesso.");
    });
  });

/* clear config */
btnClearConfig &&
  (btnClearConfig.onclick = () => {
    if (!confirm("Resetar bf_config para valores padrão?")) return;
    localStorage.removeItem(LS_CONFIG);
    cfg = readConfig();
    renderConfigPreview();
    renderTiersList();
    renderNeighborhoods();
    rebuildRingsFromConfig();
    alert("Config resetada.");
  });

/* quick save config */
saveQuickCfgBtn &&
  (saveQuickCfgBtn.onclick = () => {
    const name = cfgNameInput.value.trim() || cfg.store.name;
    const avg = parseInt(cfgAvgInput.value) || cfg.store.avgPrepMins;
    cfg.store = cfg.store || {};
    cfg.store.name = name;
    cfg.store.avgPrepMins = avg;
    writeConfig(cfg);
    alert("Configurações rápidas salvas.");
  });

/* =========================
   UI Tabs
   ========================= */
function showTab(tabBtn, panelEl) {
  [tabDashboard, tabOrders, tabDelivery, tabProducts, tabSettings].forEach(
    (b) => b.classList.remove("active")
  );
  [
    panelDashboard,
    panelOrders,
    panelDelivery,
    panelProducts,
    panelSettings,
  ].forEach((p) => (p.style.display = "none"));
  tabBtn.classList.add("active");
  panelEl.style.display = "block";
}
tabDashboard.onclick = () => showTab(tabDashboard, panelDashboard);
tabOrders.onclick = () => {
  showTab(tabOrders, panelOrders);
  renderOrdersList();
};
tabDelivery.onclick = () => {
  showTab(tabDelivery, panelDelivery);
  loadDeliveryTab();
};
tabProducts.onclick = () => {
  showTab(tabProducts, panelProducts);
  renderProductList();
};
tabSettings.onclick = () => {
  showTab(tabSettings, panelSettings);
  renderConfigPreview();
};

/* =========================
   Load / Init sequence
   ========================= */
function initAdmin() {
  cfg = readConfig();
  products = readProducts();
  orders = readOrders();

  // fill quick cfg fields
  if (cfg.store) {
    cfgNameInput.value = cfg.store.name || "";
    cfgAvgInput.value = cfg.store.avgPrepMins || 40;
    cfgAddressInput.value = cfg.store.address || "";
  }
  renderConfigPreview();
  renderTiersList();
  renderNeighborhoods();
  renderProductList();
  renderOrdersList();

  // Tab default
  showTab(tabDashboard, panelDashboard);

  // bind quick actions
  btnAddSample &&
    (btnAddSample.onclick = () => {
      // add a sample config: faixas + bairro Peixinhos = R$5
      cfg.delivery.byNeighborhood = cfg.delivery.byNeighborhood || [];
      cfg.delivery.distanceTiers = cfg.delivery.distanceTiers || [];
      cfg.delivery.byNeighborhood.push({
        name: "Peixinhos (Olinda)",
        keywords: ["peixinhos", "peixinho", "peixinhos"],
        fee: 5.0,
      });
      // ordered tiers
      cfg.delivery.distanceTiers.push({ minM: 0, maxM: 150, fee: 0 });
      cfg.delivery.distanceTiers.push({ minM: 151, maxM: 300, fee: 1 });
      cfg.delivery.distanceTiers.push({ minM: 301, maxM: 1000, fee: 3 });
      cfg.delivery.distanceTiers.push({ minM: 1100, maxM: 3000, fee: 5 });
      writeConfig(cfg);
      rebuildRingsFromConfig();
      renderTiersList();
      renderNeighborhoods();
      alert("Faixas e bairro de exemplo adicionados ao bf_config.");
    });

  btnClearRings &&
    (btnClearRings.onclick = () => {
      if (!confirm("Remover todos os círculos do mapa?")) return;
      clearAllRings();
      cfg.delivery.distanceTiers = [];
      writeConfig(cfg);
      renderTiersList();
    });

  // allow file imports/exports
  btnRefreshProducts && (btnRefreshProducts.onclick = renderProductList);

  // logout (basic)
  btnLogout &&
    (btnLogout.onclick = () => {
      if (confirm("Sair do painel?")) window.location.href = "index.html";
    });

  // simulate / refresh dashboard
  refreshDashboardBtn &&
    (refreshDashboardBtn.onclick = () => {
      renderOrdersList();
      alert("Dashboard atualizado.");
    });

  // when settings has maps key saved, prefill input
  const savedKey = localStorage.getItem(LS_MAPS_KEY);
  if (savedKey) mapsKeyInput.value = savedKey;

  // If admin clicks tabDelivery, load map: handled in tab click via loadDeliveryTab()
}

/* load delivery tab specifics (init map if key present) */
function loadDeliveryTab() {
  // check maps key
  const mapsKey =
    localStorage.getItem(LS_MAPS_KEY) ||
    (mapsKeyInput && mapsKeyInput.value.trim());
  if (!mapsKey) {
    // show friendly message inside map container
    adminMapEl.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#bbb;padding:12px">Mapa indisponível — cole sua chave em Configurações e clique em "Salvar chave".</div>`;
    return;
  }
  // load script then init map
  loadGoogleMapsScript(mapsKey, (err) => {
    if (err) {
      adminMapEl.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#bbb;padding:12px">Falha ao carregar Google Maps. Verifique a chave.</div>`;
      return;
    }
    // init the map
    initAdminMap();
  });
}

/* =========================
   Helpers
   ========================= */
function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

/* =========================
   Start
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  initAdmin();
});
