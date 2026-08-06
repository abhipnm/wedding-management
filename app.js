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
let relations = [];
let db = null;
let groupId = null;
let groupLabel = null;

function initSupabase() {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || window.SUPABASE_URL.includes("xxxx")) {
    document.getElementById("loginStatus").textContent =
      "Not connected to the database: config.js is missing or still has placeholder values. Copy config.example.js to config.js and fill in your Supabase URL + anon key.";
    document.getElementById("loginStatus").className = "login-status error";
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
  const out = { group_id: groupId };
  FIELDS.forEach((f) => { out[DB_COLUMN[f.key]] = guest[f.key] ?? ""; });
  return out;
}

// Every query is scoped to this session's group (one wedding = one group).
// guests/relations are anon-open at the database level (no accounts), so
// this isolation is enforced by the app always filtering/writing with
// group_id — not by a hard database wall. Someone hitting the API
// directly with a different group_id could still read across groups.
async function loadGuests() {
  const { data, error } = await db.from("guests").select("*").eq("group_id", groupId).order("created_at", { ascending: true });
  if (error) {
    showStatus("error", `Couldn't load guests: ${error.message}`);
    return;
  }
  guests = data.map(rowFromDb);
  clearStatus();
}

async function loadRelations() {
  const { data, error } = await db.from("relations").select("*").eq("group_id", groupId).order("name", { ascending: true });
  if (error) {
    showStatus("error", `Couldn't load relations: ${error.message}`);
    return;
  }
  relations = data;
}

// Union of the managed relations list and whatever's actually on guests
// (covers imported/legacy data that predates a relation being added here).
function getAllRelationOptions() {
  const set = new Set(relations.map((r) => r.name));
  guests.forEach((g) => {
    if (g.relation && g.relation.trim() !== "") set.add(g.relation.trim());
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
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
  let total = 0, accepted = 0, pending = 0, declined = 0, invitationsSent = 0;
  guests.forEach((g) => {
    const c = toCount(g);
    total += c;
    const status = (g.rsvp || "").toLowerCase();
    if (status === "accepted") accepted += c;
    else if (status === "declined") declined += c;
    else pending += c;
    if ((g.cardSent || "").toLowerCase() === "yes") invitationsSent += 1;
  });
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statAccepted").textContent = accepted;
  document.getElementById("statPending").textContent = pending;
  document.getElementById("statDeclined").textContent = declined;
  document.getElementById("statInvitations").textContent = invitationsSent;
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
  const options = getAllRelationOptions();
  select.innerHTML = '<option value="">All Relations</option>' +
    options.map((r) => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join("");
  if (options.includes(current)) select.value = current;
}

function renderGuestFormRelationOptions(selected) {
  const select = document.getElementById("fieldRelation");
  const options = getAllRelationOptions();
  select.innerHTML = '<option value="">Select a relation…</option>' +
    options.map((r) => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join("");
  select.value = options.includes(selected) ? selected : "";
}

function renderRelationList() {
  const list = document.getElementById("relationList");
  if (relations.length === 0) {
    list.innerHTML = '<li class="relation-list-empty">No relations yet.</li>';
    return;
  }
  list.innerHTML = relations.map((r) => `
    <li data-id="${r.id}">
      <span>${escapeHtml(r.name)}</span>
      <button type="button" class="relation-remove" title="Remove">×</button>
    </li>
  `).join("");
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
      <td><button class="row-action edit" data-action="edit">Edit / Delete</button></td>
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
  renderGuestFormRelationOptions(guest ? guest.relation || "" : "");
  document.getElementById("fieldRsvp").value = guest ? guest.rsvp || "Pending" : "Pending";
  document.getElementById("fieldGuestCount").value = guest ? guest.guestCount ?? "" : "";
  document.getElementById("fieldCardSent").value = guest ? guest.cardSent || "No" : "No";
  document.getElementById("fieldBarat").value = guest ? guest.barat || "No" : "No";
  document.getElementById("fieldReception").value = guest ? guest.reception || "No" : "No";
  document.getElementById("fieldNotes").value = guest ? guest.notes || "" : "";
  document.getElementById("deleteGuestBtn").classList.toggle("hidden", !guest);
  guestModal.classList.remove("hidden");
  document.getElementById("fieldName").focus();
}

async function deleteGuest(id, name) {
  if (!confirm(`Delete guest "${name}"? This can't be undone.`)) return;
  const { error } = await db.from("guests").delete().eq("id", id);
  if (error) {
    showStatus("error", `Couldn't delete guest: ${error.message}`);
    return;
  }
  guests = guests.filter((g) => g.id !== id);
  renderAll();
  closeGuestModal();
}

function closeGuestModal() {
  guestModal.classList.add("hidden");
  guestForm.reset();
}

document.getElementById("addGuestBtn").addEventListener("click", () => openGuestModal(null));
document.getElementById("cancelModalBtn").addEventListener("click", closeGuestModal);
guestModal.addEventListener("click", (e) => { if (e.target === guestModal) closeGuestModal(); });
document.getElementById("deleteGuestBtn").addEventListener("click", () => {
  const id = document.getElementById("guestId").value;
  const guest = guests.find((g) => g.id === id);
  if (guest) deleteGuest(guest.id, guest.name);
});

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

document.getElementById("guestTableBody").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const row = btn.closest("tr");
  const id = row.dataset.id;
  const guest = guests.find((g) => g.id === id);
  if (!guest) return;

  if (btn.dataset.action === "edit") {
    openGuestModal(guest);
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
    return;
  }
  if (field === "cardSent") renderDashboard();
});

// ---------- Search / filter ----------

document.getElementById("searchInput").addEventListener("input", renderTable);
document.getElementById("relationFilter").addEventListener("change", renderTable);
document.getElementById("addressFilter").addEventListener("change", renderTable);

// ---------- Import ----------

const importInput = document.getElementById("importInput");
const importBtn = document.getElementById("importBtn");
const importMenu = document.getElementById("importMenu");
let importMode = "add"; // "add" | "replace"

importBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  importMenu.classList.toggle("hidden");
});
document.addEventListener("click", () => importMenu.classList.add("hidden"));

importMenu.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-import]");
  if (!btn) return;
  importMenu.classList.add("hidden");
  const action = btn.dataset.import;

  if (action === "template") {
    downloadTemplate();
  } else if (action === "add") {
    importMode = "add";
    importInput.click();
  } else if (action === "replace") {
    importMode = "replace";
    importInput.click();
  }
});

importInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    importFromWorkbook(workbook, importMode);
    importInput.value = "";
  };
  reader.readAsArrayBuffer(file);
});

async function downloadTemplate() {
  const wb = newWorkbook();
  addStyledSheet(wb, "Guests", []);
  await downloadWorkbook(wb, "wedding-guest-template.xlsx");
}

async function importFromWorkbook(workbook, mode) {
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

  if (mode === "replace") {
    const existingCount = guests.length;
    const ok = confirm(
      `This will delete all ${existingCount} existing guest${existingCount === 1 ? "" : "s"} in this group and replace ` +
      `${existingCount === 1 ? "it" : "them"} with the ${newGuests.length} guest${newGuests.length === 1 ? "" : "s"} found in "${sheetName}". ` +
      `This can't be undone. Continue?`
    );
    if (!ok) return;

    const { error: deleteError } = await db.from("guests").delete().eq("group_id", groupId);
    if (deleteError) {
      showStatus("error", `Couldn't clear the existing guest list: ${deleteError.message}`);
      return;
    }
    guests = [];
  }

  const { data: inserted, error } = await db.from("guests").insert(newGuests.map(rowToDb)).select();
  if (error) {
    showStatus("error", `Import failed: ${error.message}`);
    return;
  }
  guests.push(...inserted.map(rowFromDb));

  // Register any relation names the import introduced, so they show up in
  // the managed list/dropdown too, not just as free text on these rows.
  const newRelationNames = Array.from(new Set(
    newGuests.map((g) => g.relation.trim()).filter(Boolean)
  ));
  if (newRelationNames.length > 0) {
    await db.from("relations").upsert(
      newRelationNames.map((name) => ({ name, group_id: groupId })),
      { onConflict: "group_id,name", ignoreDuplicates: true }
    );
    await loadRelations();
  }

  renderAll();
  const verb = mode === "replace" ? "Replaced guest list with" : "Imported";
  alert(`${verb} ${inserted.length} guest${inserted.length === 1 ? "" : "s"} from "${sheetName}".`);
}

// ---------- Export (styled .xlsx via ExcelJS) ----------
// Layout mirrors the couple's own Google Sheet template: a narrow spacer
// column, a gold title banner, a bordered stat row with live formulas,
// then a gold header row and a fully-gridded data table.

const HEADER_FILL = "FF715C0B";
const TITLE_COLOR = "FF715C0B";
const BORDER_COLOR = "FF000000";
const RSVP_COLOR = { accepted: "FF2E7D5B", declined: "FFB5495B", pending: "FFB8860B" };

const SPACER_COL = 1;
const FIRST_FIELD_COL = 2; // column B
const TITLE_ROW = 2;
const STAT_ROW = 5;
const HEADER_ROW = 7;
const DATA_START_ROW = 8;

const thinBorder = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
};

function safeSheetName(name) {
  return String(name).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
}

function statCell(sheet, row, col, { text, formula, bold = true } = {}) {
  const cell = sheet.getCell(row, col);
  cell.value = formula ? { formula } : text;
  cell.font = { name: "Arial", bold };
  cell.border = thinBorder;
  cell.alignment = { vertical: "top" };
  return cell;
}

function addStyledSheet(workbook, name, list) {
  const sheet = workbook.addWorksheet(safeSheetName(name), {
    views: [{ state: "frozen", ySplit: HEADER_ROW, showGridLines: false }],
  });

  sheet.getRow(1).height = 7;
  sheet.getColumn(SPACER_COL).width = 2.75;
  FIELDS.forEach((f, i) => { sheet.getColumn(FIRST_FIELD_COL + i).width = f.width; });

  // Title banner
  sheet.mergeCells(TITLE_ROW, FIRST_FIELD_COL, TITLE_ROW + 1, FIRST_FIELD_COL + 3);
  const titleCell = sheet.getCell(TITLE_ROW, FIRST_FIELD_COL);
  titleCell.value = "Wedding Guest List";
  titleCell.font = { name: "Merriweather", size: 24, color: { argb: TITLE_COLOR } };
  titleCell.alignment = { vertical: "middle" };

  // Stat row, driven by live formulas over this sheet's own data range
  const dataEndRow = DATA_START_ROW + Math.max(list.length, 1) - 1;
  const guestCountCol = FIRST_FIELD_COL + FIELDS.findIndex((f) => f.key === "guestCount");
  const rsvpCol = FIRST_FIELD_COL + FIELDS.findIndex((f) => f.key === "rsvp");
  const guestCountLetter = sheet.getColumn(guestCountCol).letter;
  const rsvpLetter = sheet.getColumn(rsvpCol).letter;

  statCell(sheet, STAT_ROW, FIRST_FIELD_COL, { text: "Total Guests" });
  statCell(sheet, STAT_ROW, FIRST_FIELD_COL + 2, { formula: `SUM(${guestCountLetter}${DATA_START_ROW}:${guestCountLetter}${dataEndRow})` });
  statCell(sheet, STAT_ROW, FIRST_FIELD_COL + 3, { text: "RSVPs Confirmed" });
  statCell(sheet, STAT_ROW, FIRST_FIELD_COL + 4, { formula: `COUNTIF(${rsvpLetter}${DATA_START_ROW}:${rsvpLetter}${dataEndRow},"Accepted")` });

  // Header row
  FIELDS.forEach((f, i) => {
    const cell = sheet.getCell(HEADER_ROW, FIRST_FIELD_COL + i);
    cell.value = f.label;
    cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = thinBorder;
    cell.alignment = { vertical: "top" };
  });

  // Data rows
  list.forEach((g, i) => {
    const r = DATA_START_ROW + i;
    FIELDS.forEach((f, ci) => {
      const cell = sheet.getCell(r, FIRST_FIELD_COL + ci);
      cell.value = g[f.key] ?? "";
      cell.font = { name: "Arial" };
      cell.border = thinBorder;
      cell.alignment = { vertical: "top" };
    });
    const rsvpColor = RSVP_COLOR[(g.rsvp || "").toLowerCase()];
    if (rsvpColor) {
      sheet.getCell(r, rsvpCol).font = { name: "Arial", bold: true, color: { argb: rsvpColor } };
    }
  });

  const lastFieldCol = FIRST_FIELD_COL + FIELDS.length - 1;
  sheet.autoFilter = {
    from: `${sheet.getColumn(FIRST_FIELD_COL).letter}${HEADER_ROW}`,
    to: `${sheet.getColumn(lastFieldCol).letter}${HEADER_ROW}`,
  };
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
  const relationsWithGuests = getDistinctRelations();
  if (relationsWithGuests.length === 0) {
    alert("No relations found. Add a relation to at least one guest first.");
    return;
  }
  const select = document.getElementById("categoryExportSelect");
  select.innerHTML = relationsWithGuests.map((r) => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join("");
  categoryModal.classList.remove("hidden");
}

document.getElementById("cancelCategoryBtn").addEventListener("click", () => categoryModal.classList.add("hidden"));
categoryModal.addEventListener("click", (e) => { if (e.target === categoryModal) categoryModal.classList.add("hidden"); });
document.getElementById("confirmCategoryBtn").addEventListener("click", async () => {
  const relation = document.getElementById("categoryExportSelect").value;
  categoryModal.classList.add("hidden");
  await exportSingleCategory(relation);
});

// ---------- Relations / categories modal ----------

const relationModal = document.getElementById("relationModal");
const relationForm = document.getElementById("relationForm");

function openRelationModal() {
  renderRelationList();
  relationModal.classList.remove("hidden");
  document.getElementById("newRelationName").focus();
}
function closeRelationModal() {
  relationModal.classList.add("hidden");
  relationForm.reset();
}

document.getElementById("addRelationBtn").addEventListener("click", openRelationModal);
document.getElementById("closeRelationModalBtn").addEventListener("click", closeRelationModal);
relationModal.addEventListener("click", (e) => { if (e.target === relationModal) closeRelationModal(); });

relationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("newRelationName");
  const name = input.value.trim();
  if (!name) return;

  const { data: inserted, error } = await db.from("relations").insert({ name, group_id: groupId }).select().single();
  if (error) {
    showStatus("error", error.code === "23505" ? `"${name}" already exists.` : `Couldn't add relation: ${error.message}`);
    return;
  }
  relations.push(inserted);
  relations.sort((a, b) => a.name.localeCompare(b.name));
  input.value = "";
  renderRelationList();
  renderRelationFilter();
});

document.getElementById("relationList").addEventListener("click", async (e) => {
  const btn = e.target.closest(".relation-remove");
  if (!btn) return;
  const li = btn.closest("li");
  const id = li.dataset.id;
  const relation = relations.find((r) => r.id === id);
  if (!relation) return;
  if (!confirm(`Remove relation "${relation.name}"? Guests already using it keep their value.`)) return;

  const { error } = await db.from("relations").delete().eq("id", id);
  if (error) {
    showStatus("error", `Couldn't remove relation: ${error.message}`);
    return;
  }
  relations = relations.filter((r) => r.id !== id);
  renderRelationList();
  renderRelationFilter();
});

// ---------- Access link ----------
// No accounts: a Group ID is a whole isolated workspace (one wedding).
// Whoever has the code/link gets full read-write access to that group's
// guests and categories — but nothing from any other group. The database
// itself doesn't wall this off (guests/relations are anon-open); the app
// enforces it by always filtering/writing with the current group_id.

let currentToken = null;

function setLoginStatus(message, isError) {
  const el = document.getElementById("loginStatus");
  if (!message) {
    el.classList.add("hidden");
    return;
  }
  el.textContent = message;
  el.className = isError ? "login-status error" : "login-status";
}

function showLandingScreen(message, isError) {
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("landingOptions").classList.remove("hidden");
  setLoginStatus(message, isError);
}

function tokenUrl(token) {
  return `${window.location.origin}${window.location.pathname}?t=${token}`;
}

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch {
    // Clipboard API unavailable (e.g. non-HTTPS) — the value is already
    // visible on screen for manual copying.
  }
}

async function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  document.getElementById("addRelationBtn").classList.remove("hidden");
  document.getElementById("shareAccessBtn").classList.remove("hidden");
  document.getElementById("shareGroupLabel").textContent = groupLabel ? `"${groupLabel}"` : "your group";
  document.getElementById("shareCode").textContent = currentToken;
  document.getElementById("shareLink").textContent = tokenUrl(currentToken);
  showStatus("info", "Loading guests…");

  await Promise.all([loadGuests(), loadRelations()]);
  renderAll();
  clearStatus();
}

// Resolves a token and, if valid, switches straight into the app. Returns
// whether it worked, so callers can decide what to show on failure.
async function tryToken(token) {
  const { data, error } = await db.rpc("resolve_access_link", { p_token: token });
  const result = data && data[0];
  if (error || !result || !result.valid) return false;

  currentToken = token;
  groupId = result.group_id;
  groupLabel = result.label;
  window.history.replaceState(null, "", `${window.location.pathname}?t=${token}`);
  await showApp();
  return true;
}

async function initFromLink() {
  const token = new URLSearchParams(window.location.search).get("t");
  if (token) {
    if (await tryToken(token)) return;
    showLandingScreen("That link isn't valid. Ask whoever shared it with you for a new one, or join/create a group below.", true);
    return;
  }
  showLandingScreen();
}

document.getElementById("joinGroupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("joinGroupId");
  const id = input.value.trim();
  if (!id) return;

  setLoginStatus("Joining…");
  if (!(await tryToken(id))) {
    setLoginStatus("That Group ID isn't valid — double-check it and try again.", true);
  }
});

document.getElementById("createGroupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("createGroupName");
  const label = input.value.trim();

  setLoginStatus("Generating…");
  const { data, error } = await db.rpc("create_group", { p_label: label || null });
  const result = data && data[0];

  if (error || !result) {
    setLoginStatus(error?.message || "Couldn't generate a code.", true);
    return;
  }

  setLoginStatus("");
  document.getElementById("createGroupResult").classList.remove("hidden");
  document.getElementById("createGroupResult").dataset.token = result.token;
  document.querySelector("#createGroupResult p").textContent =
    "Group ID created! Share this with whoever needs access to this wedding's guest list:";
  document.getElementById("createGroupToken").textContent = result.token;
  document.getElementById("createGroupLink").textContent = tokenUrl(result.token);
  input.value = "";
});

document.getElementById("copySharedIdBtn").addEventListener("click", (e) => {
  const token = document.getElementById("createGroupResult").dataset.token;
  copyToClipboard(token, e.currentTarget);
});

document.getElementById("copySharedLinkBtn").addEventListener("click", (e) => {
  const token = document.getElementById("createGroupResult").dataset.token;
  copyToClipboard(tokenUrl(token), e.currentTarget);
});

// ---------- Share access (persistent, available anywhere in the app) ----------

const shareAccessPanel = document.getElementById("shareAccessPanel");

document.getElementById("shareAccessBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  shareAccessPanel.classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (!shareAccessPanel.contains(e.target) && e.target.id !== "shareAccessBtn") {
    shareAccessPanel.classList.add("hidden");
  }
});

document.getElementById("copyShareCodeBtn").addEventListener("click", (e) => {
  copyToClipboard(currentToken, e.currentTarget);
});
document.getElementById("copyShareLinkBtn").addEventListener("click", (e) => {
  copyToClipboard(tokenUrl(currentToken), e.currentTarget);
});

document.getElementById("continueToGroupBtn").addEventListener("click", () => {
  const token = document.getElementById("createGroupResult").dataset.token;
  tryToken(token);
});

// ---------- Init ----------

db = initSupabase();
if (db) initFromLink();
