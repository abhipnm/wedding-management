const FIELDS = [
  { key: "name", label: "Guest Name", width: 24 },
  { key: "address", label: "Address / City", width: 26 },
  { key: "relation", label: "Relation", width: 16 },
  { key: "rsvp", label: "RSVP Status", width: 14 },
  { key: "guestCount", label: "Guest Count", width: 12 },
  { key: "cardSent", label: "Card Sent", width: 12 },
  { key: "barat", label: "Invited for Barat", width: 16 },
  { key: "reception", label: "Invited for Reception", width: 18 },
  { key: "notes", label: "Notes", width: 30 },
];

// camelCase (used everywhere in this file) <-> the guests table's columns
const DB_COLUMN = {
  name: "name",
  address: "address",
  relation: "relation",
  rsvp: "rsvp",
  guestCount: "guest_count",
  cardSent: "card_sent",
  barat: "invited_barat",
  reception: "invited_reception",
  notes: "notes",
};

function normalizeHeader(h) {
  return String(h || "").toLowerCase().replace(/[^a-z]/g, "");
}

const HEADER_ALIASES = {
  name: ["guestname", "name"],
  address: ["addresscity", "address", "addressslashcity"],
  relation: ["relation", "category"],
  rsvp: ["rsvpstatus", "rsvp", "status"],
  guestCount: ["guestcount", "count"],
  cardSent: ["cardsent"],
  barat: ["invitedforbarat", "barat"],
  reception: ["invitedforreception", "reception"],
  notes: ["notes"],
};

let guests = [];
let db = null;

function initSupabase() {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || window.SUPABASE_URL.includes("xxxx")) {
    showStatus("error", "Not connected to the database: config.js is missing or still has placeholder values. Copy config.example.js to config.js and fill in your Supabase URL + anon key.");
    return null;
  }
  return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}

function showStatus(type, message) {
  const el = document.getElementById("statusBanner");
  el.textContent = message;
  el.className = `status-banner ${type}`;
}
function clearStatus() {
  const el = document.getElementById("statusBanner");
  el.className = "status-banner hidden";
}

function rowFromDb(row) {
  return {
    id: row.id,
    name: row.name || "",
    address: row.address || "",
    relation: row.relation || "",
    rsvp: row.rsvp || "Pending",
    guestCount: row.guest_count || "",
    cardSent: row.card_sent || "No",
    barat: row.invited_barat || "No",
    reception: row.invited_reception || "No",
    notes: row.notes || "",
  };
}

function rowToDb(guest) {
  const out = {};
  FIELDS.forEach((f) => { out[DB_COLUMN[f.key]] = guest[f.key] ?? ""; });
  return out;
}

async function loadGuests() {
  const { data, error } = await db.from("guests").select("*").order("created_at", { ascending: true });
  if (error) {
    showStatus("error", `Couldn't load guests: ${error.message}`);
    return;
  }
  guests = data.map(rowFromDb);
  clearStatus();
}

function toCount(guest) {
  const n = parseFloat(guest.guestCount);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// ---------- Rendering ----------

function getFilteredGuests() {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const relation = document.getElementById("relationFilter").value;
  const address = document.getElementById("addressFilter").value;

  return guests.filter((g) => {
    if (relation && g.relation !== relation) return false;
    if (address && g.address !== address) return false;
    if (!search) return true;
    const haystack = [g.name, g.address, g.relation, g.notes].join(" ").toLowerCase();
    return haystack.includes(search);
  });
}

function renderDashboard() {
  let total = 0, accepted = 0, pending = 0, declined = 0;
  guests.forEach((g) => {
    const c = toCount(g);
    total += c;
    const status = (g.rsvp || "").toLowerCase();
    if (status === "accepted") accepted += c;
    else if (status === "declined") declined += c;
    else pending += c;
  });
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statAccepted").textContent = accepted;
  document.getElementById("statPending").textContent = pending;
  document.getElementById("statDeclined").textContent = declined;
}

function getDistinctRelations() {
  const set = new Set();
  guests.forEach((g) => {
    if (g.relation && g.relation.trim() !== "") set.add(g.relation.trim());
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function renderRelationFilter() {
  const select = document.getElementById("relationFilter");
  const current = select.value;
  const relations = getDistinctRelations();
  select.innerHTML = '<option value="">All Relations</option>' +
    relations.map((r) => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join("");
  if (relations.includes(current)) select.value = current;

  const datalist = document.getElementById("relationOptions");
  datalist.innerHTML = relations.map((r) => `<option value="${escapeAttr(r)}"></option>`).join("");
}

function getDistinctAddresses() {
  const set = new Set();
  guests.forEach((g) => {
    if (g.address && g.address.trim() !== "") set.add(g.address.trim());
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function renderAddressFilter() {
  const select = document.getElementById("addressFilter");
  const current = select.value;
  const addresses = getDistinctAddresses();
  select.innerHTML = '<option value="">All Addresses / Cities</option>' +
    addresses.map((a) => `<option value="${escapeAttr(a)}">${escapeHtml(a)}</option>`).join("");
  if (addresses.includes(current)) select.value = current;
}

function badgeClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "accepted") return "badge-accepted";
  if (s === "declined") return "badge-declined";
  return "badge-pending";
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}

function checkboxCell(guest, field) {
  const checked = (guest[field] || "No") === "Yes";
  return `<input type="checkbox" class="invite-checkbox" data-field="${field}" ${checked ? "checked" : ""} title="${checked ? "Yes" : "No"}" />`;
}

function renderTable() {
  const tbody = document.getElementById("guestTableBody");
  const filtered = getFilteredGuests();

  document.getElementById("emptyState").classList.toggle("hidden", filtered.length !== 0 || guests.length !== 0);

  tbody.innerHTML = filtered.map((g) => `
    <tr data-id="${g.id}">
      <td>${escapeHtml(g.name)}</td>
      <td>${escapeHtml(g.address)}</td>
      <td>${escapeHtml(g.relation)}</td>
      <td><span class="badge ${badgeClass(g.rsvp)}">${escapeHtml(g.rsvp || "Pending")}</span></td>
      <td>${escapeHtml(g.guestCount)}</td>
      <td>${checkboxCell(g, "cardSent")}</td>
      <td>${checkboxCell(g, "barat")}</td>
      <td>${checkboxCell(g, "reception")}</td>
      <td>${escapeHtml(g.notes)}</td>
      <td><button class="row-action edit" data-action="edit">Edit</button></td>
      <td><button class="row-action delete" data-action="delete">Delete</button></td>
    </tr>
  `).join("");
}

function renderAll() {
  renderRelationFilter();
  renderAddressFilter();
  renderTable();
  renderDashboard();
}

// ---------- Guest form modal ----------

const guestModal = document.getElementById("guestModal");
const guestForm = document.getElementById("guestForm");

function openGuestModal(guest) {
  document.getElementById("modalTitle").textContent = guest ? "Edit Guest" : "Add Guest";
  document.getElementById("guestId").value = guest ? guest.id : "";
  document.getElementById("fieldName").value = guest ? guest.name || "" : "";
  document.getElementById("fieldAddress").value = guest ? guest.address || "" : "";
  document.getElementById("fieldRelation").value = guest ? guest.relation || "" : "";
  document.getElementById("fieldRsvp").value = guest ? guest.rsvp || "Pending" : "Pending";
  document.getElementById("fieldGuestCount").value = guest ? guest.guestCount ?? "" : "";
  document.getElementById("fieldCardSent").value = guest ? guest.cardSent || "No" : "No";
  document.getElementById("fieldBarat").value = guest ? guest.barat || "No" : "No";
  document.getElementById("fieldReception").value = guest ? guest.reception || "No" : "No";
  document.getElementById("fieldNotes").value = guest ? guest.notes || "" : "";
  guestModal.classList.remove("hidden");
  document.getElementById("fieldName").focus();
}

function closeGuestModal() {
  guestModal.classList.add("hidden");
  guestForm.reset();
}

document.getElementById("addGuestBtn").addEventListener("click", () => openGuestModal(null));
document.getElementById("cancelModalBtn").addEventListener("click", closeGuestModal);
guestModal.addEventListener("click", (e) => { if (e.target === guestModal) closeGuestModal(); });

guestForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("guestId").value;
  const data = {
    name: document.getElementById("fieldName").value,
    address: document.getElementById("fieldAddress").value,
    relation: document.getElementById("fieldRelation").value,
    rsvp: document.getElementById("fieldRsvp").value,
    guestCount: document.getElementById("fieldGuestCount").value,
    cardSent: document.getElementById("fieldCardSent").value,
    barat: document.getElementById("fieldBarat").value,
    reception: document.getElementById("fieldReception").value,
    notes: document.getElementById("fieldNotes").value,
  };

  const saveBtn = guestForm.querySelector('button[type="submit"]');
  saveBtn.disabled = true;
  try {
    if (id) {
      const { error } = await db.from("guests").update(rowToDb(data)).eq("id", id);
      if (error) throw error;
      const idx = guests.findIndex((g) => g.id === id);
      if (idx !== -1) guests[idx] = { ...guests[idx], ...data };
    } else {
      const { data: inserted, error } = await db.from("guests").insert(rowToDb(data)).select().single();
      if (error) throw error;
      guests.push(rowFromDb(inserted));
    }
    renderAll();
    closeGuestModal();
  } catch (err) {
    showStatus("error", `Couldn't save guest: ${err.message}`);
  } finally {
    saveBtn.disabled = false;
  }
});

document.getElementById("guestTableBody").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const row = btn.closest("tr");
  const id = row.dataset.id;
  const guest = guests.find((g) => g.id === id);
  if (!guest) return;

  if (btn.dataset.action === "edit") {
    openGuestModal(guest);
  } else if (btn.dataset.action === "delete") {
    if (confirm(`Delete guest "${guest.name}"?`)) {
      const { error } = await db.from("guests").delete().eq("id", id);
      if (error) {
        showStatus("error", `Couldn't delete guest: ${error.message}`);
        return;
      }
      guests = guests.filter((g) => g.id !== id);
      renderAll();
    }
  }
});

// Inline checkboxes: Card Sent / Invited for Barat / Invited for Reception,
// toggled straight from the list — no need to open Edit.
document.getElementById("guestTableBody").addEventListener("change", async (e) => {
  const checkbox = e.target.closest(".invite-checkbox");
  if (!checkbox) return;
  const row = checkbox.closest("tr");
  const id = row.dataset.id;
  const field = checkbox.dataset.field;
  const guest = guests.find((g) => g.id === id);
  if (!guest) return;

  const newValue = checkbox.checked ? "Yes" : "No";
  const previousValue = guest[field];
  guest[field] = newValue;
  checkbox.title = newValue;

  const { error } = await db.from("guests").update({ [DB_COLUMN[field]]: newValue }).eq("id", id);
  if (error) {
    guest[field] = previousValue;
    checkbox.checked = previousValue === "Yes";
    checkbox.title = previousValue;
    showStatus("error", `Couldn't save that checkbox: ${error.message}`);
  }
});

// ---------- Search / filter ----------

document.getElementById("searchInput").addEventListener("input", renderTable);
document.getElementById("relationFilter").addEventListener("change", renderTable);
document.getElementById("addressFilter").addEventListener("change", renderTable);

// ---------- Import ----------

const importInput = document.getElementById("importInput");
document.getElementById("importBtn").addEventListener("click", () => importInput.click());

importInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    importFromWorkbook(workbook);
    importInput.value = "";
  };
  reader.readAsArrayBuffer(file);
});

async function importFromWorkbook(workbook) {
  const masterSheetName = workbook.SheetNames.find((n) => normalizeHeader(n).startsWith("master"));
  const sheetName = masterSheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length === 0) return;

  const headerRow = rows[0].map(normalizeHeader);
  const colIndex = {};
  FIELDS.forEach((f) => {
    const aliases = HEADER_ALIASES[f.key];
    const idx = headerRow.findIndex((h) => aliases.includes(h));
    colIndex[f.key] = idx;
  });

  const hasRecognizedHeader = Object.values(colIndex).some((i) => i !== -1);
  const dataRows = hasRecognizedHeader ? rows.slice(1) : rows;

  if (!hasRecognizedHeader) {
    FIELDS.forEach((f, i) => { colIndex[f.key] = i; });
  }

  const newGuests = [];
  dataRows.forEach((row) => {
    if (row.every((cell) => String(cell).trim() === "")) return;
    const guest = {};
    FIELDS.forEach((f) => {
      const idx = colIndex[f.key];
      guest[f.key] = idx !== -1 && idx < row.length ? String(row[idx]) : "";
    });
    newGuests.push(guest);
  });

  if (newGuests.length === 0) {
    alert("No guest rows found to import.");
    return;
  }

  const { data: inserted, error } = await db.from("guests").insert(newGuests.map(rowToDb)).select();
  if (error) {
    showStatus("error", `Import failed: ${error.message}`);
    return;
  }
  guests.push(...inserted.map(rowFromDb));
  renderAll();
  alert(`Imported ${inserted.length} guest${inserted.length === 1 ? "" : "s"} from "${sheetName}".`);
}

// ---------- Export (styled .xlsx via ExcelJS) ----------

const HEADER_FILL = "FFB5495B";
const STRIPE_FILL = "FFF8F1EF";
const BORDER_COLOR = "FFE6DEDB";
const RSVP_COLOR = { accepted: "FF2E7D5B", declined: "FFB5495B", pending: "FFB8860B" };

const thinBorder = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
};

function safeSheetName(name) {
  return String(name).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
}

function addStyledSheet(workbook, name, list) {
  const sheet = workbook.addWorksheet(safeSheetName(name), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = FIELDS.map((f) => ({ header: f.label, key: f.key, width: f.width }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = thinBorder;
  });

  list.forEach((g, i) => {
    const row = sheet.addRow(FIELDS.reduce((acc, f) => { acc[f.key] = g[f.key] ?? ""; return acc; }, {}));
    row.eachCell((cell) => {
      cell.border = thinBorder;
      cell.alignment = { vertical: "middle" };
    });
    if (i % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE_FILL } };
      });
    }
    const rsvpColor = RSVP_COLOR[(g.rsvp || "").toLowerCase()];
    if (rsvpColor) {
      row.getCell("rsvp").font = { bold: true, color: { argb: rsvpColor } };
    }
  });

  sheet.autoFilter = { from: "A1", to: `${sheet.getColumn(FIELDS.length).letter}1` };
  return sheet;
}

async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wedding Guest Manager";
  wb.created = new Date();
  return wb;
}

async function exportMasterSheet() {
  const wb = newWorkbook();
  addStyledSheet(wb, "Master", guests);
  await downloadWorkbook(wb, "wedding-guests-master.xlsx");
}

async function exportCategoryWorkbook() {
  const wb = newWorkbook();
  addStyledSheet(wb, "Master", guests);

  const relations = getDistinctRelations();
  const usedNames = new Set(["master"]);
  relations.forEach((relation) => {
    const list = guests.filter((g) => (g.relation || "").trim() === relation);
    let name = safeSheetName(relation);
    let unique = name, n = 2;
    while (usedNames.has(unique.toLowerCase())) { unique = safeSheetName(`${name} ${n}`); n++; }
    usedNames.add(unique.toLowerCase());
    addStyledSheet(wb, unique, list);
  });

  await downloadWorkbook(wb, "wedding-guests-by-category.xlsx");
}

async function exportSingleCategory(relation) {
  const list = guests.filter((g) => (g.relation || "").trim() === relation);
  const wb = newWorkbook();
  addStyledSheet(wb, relation, list);
  await downloadWorkbook(wb, `wedding-guests-${safeSheetName(relation).replace(/\s+/g, "-").toLowerCase()}.xlsx`);
}

// ---------- Export menu ----------

const exportBtn = document.getElementById("exportBtn");
const exportMenu = document.getElementById("exportMenu");

exportBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  exportMenu.classList.toggle("hidden");
});
document.addEventListener("click", () => exportMenu.classList.add("hidden"));

exportMenu.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-export]");
  if (!btn) return;
  const type = btn.dataset.export;
  exportMenu.classList.add("hidden");

  if (guests.length === 0) {
    alert("There are no guests to export yet.");
    return;
  }

  if (type === "master") {
    await exportMasterSheet();
  } else if (type === "workbook") {
    await exportCategoryWorkbook();
  } else if (type === "single") {
    openCategoryModal();
  }
});

// ---------- Single category export modal ----------

const categoryModal = document.getElementById("categoryModal");

function openCategoryModal() {
  const relations = getDistinctRelations();
  if (relations.length === 0) {
    alert("No relations found. Add a relation to at least one guest first.");
    return;
  }
  const select = document.getElementById("categoryExportSelect");
  select.innerHTML = relations.map((r) => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join("");
  categoryModal.classList.remove("hidden");
}

document.getElementById("cancelCategoryBtn").addEventListener("click", () => categoryModal.classList.add("hidden"));
categoryModal.addEventListener("click", (e) => { if (e.target === categoryModal) categoryModal.classList.add("hidden"); });
document.getElementById("confirmCategoryBtn").addEventListener("click", async () => {
  const relation = document.getElementById("categoryExportSelect").value;
  categoryModal.classList.add("hidden");
  await exportSingleCategory(relation);
});

// ---------- Init ----------

(async function init() {
  db = initSupabase();
  if (!db) return;
  showStatus("info", "Loading guests…");
  await loadGuests();
  renderAll();
})();
