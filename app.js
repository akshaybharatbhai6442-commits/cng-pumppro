/* ============================================================
   CNG PumpPro - app.js
   Pure Serverless Google Firebase Realtime Database Integration
   Staff-wise Nozzle Sales, Paytm, Cash, +/- Difference & PDF Reports
   ============================================================ */

// ── STATE / DATA ──────────────────────────────────────────────
let state = {
  staffNames: ['Ramesh', 'Suresh', 'Vikram', 'Anil'],
  nozzles: ['Nozzle 1', 'Nozzle 2', 'Nozzle 3', 'Nozzle 4', 'Nozzle 5', 'Nozzle 6', 'Nozzle 7'],
  shifts: [] // array of shift records
};

// ── FIREBASE CONFIGURATION (100% Google Cloud) ──────────────────
const firebaseConfig = {
  apiKey: "AIzaSyD2ztmQ0BI_-NFTTxQ6tZz52Nu7TNZBcIE",
  authDomain: "pumppro-mobile.firebaseapp.com",
  databaseURL: "https://pumppro-mobile-default-rtdb.firebaseio.com",
  projectId: "pumppro-mobile",
  storageBucket: "pumppro-mobile.firebasestorage.app",
  messagingSenderId: "3889303886",
  appId: "1:3889303886:web:10bd99a397e0095c9d0e1f",
  measurementId: "G-P82ZLNDRTN"
};

let db = null;
let useFirebase = false;
let SERVER_URL = window.location.origin; // Dynamically resolve to current address

function updateServerUrl() {
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.hostname.startsWith('192.168.') ||
                  window.location.hostname.startsWith('10.') ||
                  window.location.hostname.startsWith('172.');
                  
  if (isLocal) {
    state.pcServerUrl = window.location.origin;
  } else if (state.pcServerUrl) {
    SERVER_URL = state.pcServerUrl;
  }
}

let isFormDirty = false;
let lastStateJson = '';

// ── INITIALIZATION ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initDateToday();
  initFirebase();
  await loadStateFromFirebase();
  renderSettingsLists();
  loadShiftForSelected();
  updateDashboardStats();
  loadConnectionInfo();

  // ── AUTO-SAVE every 1 second if form is dirty ────────────────
  setInterval(async () => {
    if (isFormDirty) {
      saveCurrentFormToState();
      const currentStateJson = JSON.stringify(state);
      if (currentStateJson !== lastStateJson) {
        lastStateJson = currentStateJson;
        await saveStateToFirebase();
        updateLastSaved();
      }
      isFormDirty = false;
    }
  }, 1000);
});

// Initialize date field to today's local date
function initDateToday() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('shiftDate').value = `${yyyy}-${mm}-${dd}`;
  document.getElementById('topDate').textContent = `${dd}/${mm}/${yyyy}`;
}

// Initialize Firebase SDK
function initFirebase() {
  if (typeof firebase !== 'undefined') {
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.database();
      useFirebase = true;
      showServerStatus('cloud');
      console.log('🔥 Google Firebase Realtime Database connected');
    } catch (e) {
      console.error('Firebase initialization failed:', e);
      showServerStatus('offline');
    }
  } else {
    showServerStatus('offline');
    console.warn('Firebase library not loaded');
  }
}

// Fetch local IP address for sharing guide
async function loadConnectionInfo() {
  try {
    const res = await fetch(`${SERVER_URL}/api/info`);
    if (res.ok) {
      const info = await res.json();
      if (info.ips && info.ips.length > 0) {
        const card = document.getElementById('connectionInfoCard');
        const link = document.getElementById('wifiUrlLink');
        if (card && link) {
          card.style.display = 'block';
          link.innerHTML = info.ips.map(ip => `http://${ip}:${info.port}/cng/`).join('<br/>');
        }
      }
    }
  } catch (e) {
    console.log('Not running in local server mode, connection card hidden.');
  }
}

// ── FIREBASE / LOCAL SERVER SAVE & LOAD ──────────────────────────────────
async function loadStateFromFirebase() {
  let loaded = null;

  // 1. Try Firebase Cloud
  if (useFirebase && db) {
    try {
      const snapshot = await db.ref('cng_pump_state').once('value');
      loaded = snapshot.val();
      if (loaded && Object.keys(loaded).length > 0) {
        state = { ...state, ...loaded };
        updateServerUrl();
        sanitizeStateNozzles();
        localStorage.setItem('cng_pump_data', JSON.stringify(state));
        showServerStatus('cloud');
        console.log('🔥 Data loaded from Google Firebase Realtime Database');
        return;
      }
    } catch (e) {
      console.warn('Firebase read error, trying local server fallback...', e);
    }
  }

  // 2. Try Local PC Server fallback
  try {
    const res = await fetch(`${SERVER_URL}/api/cng/load`);
    if (res.ok) {
      const raw = await res.text();
      loaded = JSON.parse(raw);
      if (loaded && Object.keys(loaded).length > 0) {
        state = { ...state, ...loaded };
        updateServerUrl();
        sanitizeStateNozzles();
        localStorage.setItem('cng_pump_data', JSON.stringify(state));
        showServerStatus('local');
        console.log('🟢 Data loaded from local PC server');
        return;
      }
    }
  } catch (e) {
    console.warn('Local server load failed, trying localStorage fallback...', e);
  }

  // 3. Fallback to LocalStorage
  loadFromLocalStorage();
  updateServerUrl();
  sanitizeStateNozzles();
}

function sanitizeStateNozzles() {
  if (!state.nozzles) state.nozzles = [];
  while (state.nozzles.length < 7) {
    state.nozzles.push(`Nozzle ${state.nozzles.length + 1}`);
  }
  if (state.nozzles.length > 7) {
    state.nozzles = state.nozzles.slice(0, 7);
  }
}

async function saveStateToFirebase() {
  updateServerUrl();
  localStorage.setItem('cng_pump_data', JSON.stringify(state));
  let savedCloud = false;
  let savedLocal = false;

  // 1. Try Firebase Cloud
  if (useFirebase && db) {
    try {
      await db.ref('cng_pump_state').set(state);
      savedCloud = true;
    } catch (e) {
      console.error('Firebase cloud write failed:', e);
    }
  }

  // 2. Try Local PC Server
  try {
    const res = await fetch(`${SERVER_URL}/api/cng/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (res.ok) {
      savedLocal = true;
    }
  } catch (e) {
    console.error('Local PC server write failed:', e);
  }

  // Update status badge
  if (savedCloud) {
    showServerStatus('cloud');
  } else if (savedLocal) {
    showServerStatus('local');
  } else {
    showServerStatus('offline');
  }
}

function loadFromLocalStorage() {
  const raw = localStorage.getItem('cng_pump_data');
  if (raw) {
    try {
      state = JSON.parse(raw);
    } catch (e) {}
  }
}

function showServerStatus(status) {
  const badge = document.getElementById('serverStatusBadge');
  if (!badge) return;
  
  if (status === 'cloud') {
    badge.textContent = '☁️ Cloud Save';
    badge.className = 'status-badge cloud';
  } else if (status === 'local') {
    badge.textContent = '🟢 PC Save';
    badge.className = 'status-badge local';
  } else {
    badge.textContent = '🔴 Offline';
    badge.className = 'status-badge offline';
  }
}

function updateLastSaved() {
  const badge = document.getElementById('lastSavedBadge');
  if (badge) {
    badge.style.display = 'block';
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    badge.textContent = `💾 Saved ${h}:${m}:${s}`;
  }
}

// ── NAVIGATION ────────────────────────────────────────────────
function showPage(pageId, navElement) {
  // Toggle pages active state
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${pageId}`).classList.add('active');

  // Toggle navigation tab active state
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  if (navElement) {
    navElement.classList.add('active');
  }

  // Update dynamic views
  if (pageId === 'dashboard') {
    updateDashboardStats();
    loadConnectionInfo();
  } else if (pageId === 'settings') {
    renderSettingsLists();
  }
}

// Mark form dirty to trigger auto-save
function markDirty() {
  isFormDirty = true;
  recalculateAll();
}

// ── CHROMATIC SHIFT LOOKUP ────────────────────────────────────
function getPreviousShift(dateStr, shiftType) {
  if (!state.shifts || state.shifts.length === 0) return null;
  
  const currentVal = new Date(dateStr).getTime() + (shiftType === 'Night' ? 12 * 60 * 60 * 1000 : 0);
  
  let bestShift = null;
  let bestShiftVal = -Infinity;
  
  state.shifts.forEach(s => {
    const sVal = new Date(s.date).getTime() + (s.shiftType === 'Night' ? 12 * 60 * 60 * 1000 : 0);
    if (sVal < currentVal && sVal > bestShiftVal) {
      bestShift = s;
      bestShiftVal = sVal;
    }
  });
  
  return bestShift;
}

// ── DYNAMIC RENDERING FOR 7 NOZZLES & SALESMEN ────────────────
function renderNozzlesContainer(loadedNozzleReadings = null) {
  const container = document.getElementById('nozzlesContainer');
  container.innerHTML = '';

  const dateStr = document.getElementById('shiftDate').value;
  const shiftType = document.getElementById('shiftType').value;
  const prevShift = getPreviousShift(dateStr, shiftType);

  for (let i = 0; i < 7; i++) {
    const nozzleName = state.nozzles[i] || `Nozzle ${i + 1}`;
    let openingVal = 0;
    let closingVal = '';

    if (loadedNozzleReadings && loadedNozzleReadings[i]) {
      openingVal = loadedNozzleReadings[i].opening;
      closingVal = loadedNozzleReadings[i].closing;
    } else if (prevShift && prevShift.nozzleReadings && prevShift.nozzleReadings[i]) {
      openingVal = prevShift.nozzleReadings[i].closing;
    }

    const hasPrevClosing = prevShift && prevShift.nozzleReadings && prevShift.nozzleReadings[i];
    const openingDisabledAttr = hasPrevClosing ? 'disabled' : '';

    const row = document.createElement('div');
    row.className = 'nozzle-input-row';
    row.innerHTML = `
      <div class="nozzle-input-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:4px;">
        <span class="nozzle-input-title" style="font-weight:700; color:var(--accent); font-size:12px;">⛽ ${nozzleName}</span>
        <span class="nozzle-input-amount nozzle-amount-label" id="nozzle-amount-${i}" style="font-size:11px; color:var(--text-secondary);">₹ 0.00</span>
      </div>
      <div class="entry-grid-3">
        <div class="field-wrap">
          <label>Opening (Kg):</label>
          <input type="number" class="inp-num nozzle-opening-input" data-idx="${i}" value="${openingVal}" oninput="markDirty()" ${openingDisabledAttr} />
        </div>
        <div class="field-wrap">
          <label>Closing (Kg):</label>
          <input type="number" class="inp-num nozzle-closing-input" data-idx="${i}" value="${closingVal}" placeholder="Close" oninput="markDirty()" />
        </div>
        <div class="field-wrap">
          <label>Sale (Kg):</label>
          <div class="read-only-field nozzle-sale-label" id="nozzle-sale-${i}">0.00 Kg</div>
        </div>
      </div>
    `;
    container.appendChild(row);
  }
}

function sanitizeShiftMappings() {
  if (!state.shiftMappings) {
    state.shiftMappings = { Day: [], Night: [] };
  }
  if (!state.shiftMappings.Day) state.shiftMappings.Day = [];
  if (!state.shiftMappings.Night) state.shiftMappings.Night = [];

  // Ensure Day has 5 entries
  while (state.shiftMappings.Day.length < 5) {
    const idx = state.shiftMappings.Day.length;
    if (idx === 0) state.shiftMappings.Day.push([0, 1]);
    else if (idx === 1) state.shiftMappings.Day.push([2, 3]);
    else if (idx === 2) state.shiftMappings.Day.push([4]);
    else if (idx === 3) state.shiftMappings.Day.push([5]);
    else if (idx === 4) state.shiftMappings.Day.push([6]);
    else state.shiftMappings.Day.push([]);
  }
  // Ensure Night has 5 entries
  while (state.shiftMappings.Night.length < 5) {
    const idx = state.shiftMappings.Night.length;
    if (idx === 0) state.shiftMappings.Night.push([0, 1]);
    else if (idx === 1) state.shiftMappings.Night.push([2, 3]);
    else if (idx === 2) state.shiftMappings.Night.push([4]);
    else if (idx === 3) state.shiftMappings.Night.push([5]);
    else if (idx === 4) state.shiftMappings.Night.push([6]);
    else state.shiftMappings.Night.push([]);
  }
}

function getAssignedNozzleIndices(shiftType, salesmanIndex) {
  sanitizeShiftMappings();
  if (state.shiftMappings && state.shiftMappings[shiftType] && state.shiftMappings[shiftType][salesmanIndex]) {
    return state.shiftMappings[shiftType][salesmanIndex];
  }
  // Fallbacks
  if (salesmanIndex === 0) return [0, 1];
  if (salesmanIndex === 1) return [2, 3];
  if (salesmanIndex === 2) return [4];
  if (salesmanIndex === 3) return [5];
  if (salesmanIndex === 4) return [6];
  return [];
}

async function toggleNozzleAssignment(shiftType, salesmanIndex, nozzleIndex, isChecked) {
  sanitizeShiftMappings();
  
  let list = state.shiftMappings[shiftType][salesmanIndex] || [];
  if (isChecked) {
    if (!list.includes(nozzleIndex)) {
      list.push(nozzleIndex);
    }
  } else {
    list = list.filter(idx => idx !== nozzleIndex);
  }
  // Sort indices
  list.sort((a, b) => a - b);
  
  state.shiftMappings[shiftType][salesmanIndex] = list;
  await saveStateToFirebase();
  recalculateAll();
}

function renderShiftAssignments() {
  sanitizeShiftMappings();
  
  const dayContainer = document.getElementById('dayNozzleAssignments');
  const nightContainer = document.getElementById('nightNozzleAssignments');
  
  if (!dayContainer || !nightContainer) return;
  
  dayContainer.innerHTML = '';
  nightContainer.innerHTML = '';
  
  // Render Day Shift (5 salesmen)
  for (let s = 0; s < 5; s++) {
    const assigned = state.shiftMappings.Day[s] || [];
    const div = document.createElement('div');
    div.style.marginBottom = '12px';
    div.innerHTML = `
      <div style="font-weight:600; font-size:11px; margin-bottom:4px; color:var(--text-primary);">Salesman ${s + 1}:</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${state.nozzles.map((nozzle, nIdx) => {
          const checked = assigned.includes(nIdx) ? 'checked' : '';
          return `
            <label style="display:flex; align-items:center; gap:4px; font-size:11px; text-transform:none; margin:0; cursor:pointer; color:var(--text-secondary);">
              <input type="checkbox" ${checked} onchange="toggleNozzleAssignment('Day', ${s}, ${nIdx}, this.checked)" />
              ${nozzle}
            </label>
          `;
        }).join('')}
      </div>
    `;
    dayContainer.appendChild(div);
  }
  
  // Render Night Shift (5 salesmen)
  for (let s = 0; s < 5; s++) {
    const assigned = state.shiftMappings.Night[s] || [];
    const div = document.createElement('div');
    div.style.marginBottom = '12px';
    div.innerHTML = `
      <div style="font-weight:600; font-size:11px; margin-bottom:4px; color:var(--text-primary);">Salesman ${s + 1}:</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${state.nozzles.map((nozzle, nIdx) => {
          const checked = assigned.includes(nIdx) ? 'checked' : '';
          return `
            <label style="display:flex; align-items:center; gap:4px; font-size:11px; text-transform:none; margin:0; cursor:pointer; color:var(--text-secondary);">
              <input type="checkbox" ${checked} onchange="toggleNozzleAssignment('Night', ${s}, ${nIdx}, this.checked)" />
              ${nozzle}
            </label>
          `;
        }).join('')}
      </div>
    `;
    nightContainer.appendChild(div);
  }
}

function renderSalesmanEntries(loadedSalesmanEntries = null) {
  const container = document.getElementById('salesmanContainer');
  container.innerHTML = '';

  const shiftType = document.getElementById('shiftType').value;
  const count = 5;

  for (let i = 0; i < count; i++) {
    const assignedIndices = getAssignedNozzleIndices(shiftType, i);
    const nozzleLabels = assignedIndices.map(idx => state.nozzles[idx] || `Nozzle ${idx + 1}`).join(', ');

    let selectedStaffName = '';
    let cardVal = '';
    let upiVal = '';
    let cashRecdVal = '';

    if (loadedSalesmanEntries && loadedSalesmanEntries[i]) {
      selectedStaffName = loadedSalesmanEntries[i].salesmanName;
      cardVal = loadedSalesmanEntries[i].card !== undefined ? loadedSalesmanEntries[i].card : '';
      upiVal = loadedSalesmanEntries[i].upi !== undefined ? loadedSalesmanEntries[i].upi : '';
      cashRecdVal = loadedSalesmanEntries[i].cashReceived !== undefined ? loadedSalesmanEntries[i].cashReceived : '';
    }

    let staffOptions = '<option value="">-- Select Salesman --</option>';
    state.staffNames.forEach(name => {
      const selected = selectedStaffName === name ? 'selected' : '';
      staffOptions += `<option value="${name}" ${selected}>${name}</option>`;
    });

    const card = document.createElement('div');
    card.className = 'staff-row-card';
    card.id = `salesman-card-${i}`;
    card.innerHTML = `
      <div class="staff-row-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">
        <span class="staff-row-title" style="font-weight:700; color:var(--accent);">👤 Salesman ${i + 1} (${nozzleLabels})</span>
      </div>
      <div class="field-wrap" style="margin-bottom:10px;">
        <label>Salesman Name:</label>
        <select class="inp-select salesman-select-name" data-idx="${i}" onchange="markDirty()">${staffOptions}</select>
      </div>
      <div class="entry-grid-2">
        <div class="field-wrap">
          <label>Sale (Kg):</label>
          <div class="read-only-field salesman-sale-kg" id="salesman-sale-kg-${i}">0.00 Kg</div>
        </div>
        <div class="field-wrap">
          <label>Sale Amount (₹):</label>
          <div class="read-only-field salesman-sale-amount" id="salesman-sale-amt-${i}">₹ 0.00</div>
        </div>
      </div>
      <div class="entry-grid-3" style="margin-top:8px;">
        <div class="field-wrap">
          <label>💳 Card (₹):</label>
          <input type="number" class="inp-num salesman-card" data-idx="${i}" placeholder="Card ₹" value="${cardVal}" oninput="markDirty()" />
        </div>
        <div class="field-wrap">
          <label>📱 UPI (₹):</label>
          <input type="number" class="inp-num salesman-upi" data-idx="${i}" placeholder="UPI ₹" value="${upiVal}" oninput="markDirty()" />
        </div>
        <div class="field-wrap">
          <label>💵 Cash Recd (₹):</label>
          <input type="number" class="inp-num salesman-cash" data-idx="${i}" placeholder="Cash Recd ₹" value="${cashRecdVal}" oninput="markDirty()" />
        </div>
      </div>
      <div class="entry-grid-2" style="margin-top:12px; border-top:1px dashed rgba(255,255,255,0.05); padding-top:10px;">
        <div class="field-wrap">
          <label style="color:#ffcc00;">💰 Cash to Collect:</label>
          <div class="read-only-field salesman-cash-to-collect" id="salesman-collect-${i}">₹ 0.00</div>
        </div>
        <div class="field-wrap">
          <label>⚖️ Difference (+/-):</label>
          <div class="read-only-field salesman-diff" id="salesman-diff-${i}">₹ 0.00</div>
        </div>
      </div>
    `;
    container.appendChild(card);
  }
}

// ── RECALCULATE LOGIC ─────────────────────────────────────────
function recalculateAll() {
  const rate = parseFloat(document.getElementById('cngRate').value) || 0;
  const shiftType = document.getElementById('shiftType').value;

  const openingInputs = document.querySelectorAll('.nozzle-opening-input');
  const closingInputs = document.querySelectorAll('.nozzle-closing-input');

  const nozzleSales = [];

  for (let i = 0; i < 7; i++) {
    const opening = parseFloat(openingInputs[i]?.value) || 0;
    const closing = parseFloat(closingInputs[i]?.value) || 0;
    const saleKg = Math.max(0, closing - opening);
    const saleAmount = saleKg * rate;

    nozzleSales.push({ saleKg, saleAmount });

    const saleEl = document.getElementById(`nozzle-sale-${i}`);
    if (saleEl) saleEl.textContent = `${saleKg.toFixed(2)} Kg`;

    const amtEl = document.getElementById(`nozzle-amount-${i}`);
    if (amtEl) amtEl.textContent = `₹ ${saleAmount.toFixed(2)}`;
  }

  const salesmanCount = 5;
  const cardInputs = document.querySelectorAll('.salesman-card');
  const upiInputs = document.querySelectorAll('.salesman-upi');
  const cashInputs = document.querySelectorAll('.salesman-cash');

  for (let i = 0; i < salesmanCount; i++) {
    const assignedIndices = getAssignedNozzleIndices(shiftType, i);
    
    let saleKg = 0;
    let saleAmount = 0;
    assignedIndices.forEach(idx => {
      if (nozzleSales[idx]) {
        saleKg += nozzleSales[idx].saleKg;
        saleAmount += nozzleSales[idx].saleAmount;
      }
    });

    const card = parseFloat(cardInputs[i]?.value) || 0;
    const upi = parseFloat(upiInputs[i]?.value) || 0;
    const cashRecd = parseFloat(cashInputs[i]?.value) || 0;

    const cashToCollect = Math.max(0, saleAmount - card - upi);
    const difference = cashRecd - cashToCollect;

    const saleKgEl = document.getElementById(`salesman-sale-kg-${i}`);
    if (saleKgEl) saleKgEl.textContent = `${saleKg.toFixed(2)} Kg`;

    const saleAmtEl = document.getElementById(`salesman-sale-amt-${i}`);
    if (saleAmtEl) saleAmtEl.textContent = `₹ ${saleAmount.toFixed(2)}`;

    const collectEl = document.getElementById(`salesman-collect-${i}`);
    if (collectEl) collectEl.textContent = `₹ ${cashToCollect.toFixed(2)}`;

    const diffEl = document.getElementById(`salesman-diff-${i}`);
    if (diffEl) {
      diffEl.textContent = `₹ ${difference.toFixed(2)}`;
      if (difference >= 0) {
        diffEl.className = 'read-only-field salesman-diff diff-green';
      } else {
        diffEl.className = 'read-only-field salesman-diff diff-red';
      }
    }
  }
}

// ── SHIFT SAVE / LOAD ──────────────────────────────────────────
let isShiftLocked = false;

function setFormFieldsDisabled(disabled) {
  const cngRateInput = document.getElementById('cngRate');
  if (cngRateInput) cngRateInput.disabled = disabled;
  
  const remarksInput = document.getElementById('shiftRemarks');
  if (remarksInput) remarksInput.disabled = disabled;

  const openingInputs = document.querySelectorAll('.nozzle-opening-input');
  const closingInputs = document.querySelectorAll('.nozzle-closing-input');

  const dateStr = document.getElementById('shiftDate').value;
  const shiftType = document.getElementById('shiftType').value;
  const prevShift = getPreviousShift(dateStr, shiftType);

  for (let i = 0; i < 7; i++) {
    if (openingInputs[i]) {
      const hasPrevClosing = prevShift && prevShift.nozzleReadings && prevShift.nozzleReadings[i];
      openingInputs[i].disabled = disabled || hasPrevClosing;
    }
    if (closingInputs[i]) {
      closingInputs[i].disabled = disabled;
    }
  }

  document.querySelectorAll('.salesman-select-name').forEach(el => el.disabled = disabled);
  document.querySelectorAll('.salesman-card').forEach(el => el.disabled = disabled);
  document.querySelectorAll('.salesman-upi').forEach(el => el.disabled = disabled);
  document.querySelectorAll('.salesman-cash').forEach(el => el.disabled = disabled);
}

function unlockShiftPrompt() {
  const pw = prompt("Enter Password to edit this saved shift:");
  if (pw === 'PRANAV@6442') {
    isShiftLocked = false;
    setFormFieldsDisabled(false);
    document.getElementById('btnUnlockShift').style.display = 'none';
    document.getElementById('btnSaveShift').style.display = 'block';
    showToast('Shift Unlocked successfully!');
  } else {
    showToast('Incorrect Password!', true);
  }
}

function loadShiftForSelected() {
  const dateStr = document.getElementById('shiftDate').value;
  const shiftType = document.getElementById('shiftType').value;
  const shiftId = `${dateStr}_${shiftType}`;

  document.getElementById('nozzlesContainer').innerHTML = '';
  document.getElementById('salesmanContainer').innerHTML = '';
  document.getElementById('shiftRemarks').value = '';

  const foundShift = state.shifts.find(s => s.id === shiftId);
  if (foundShift) {
    document.getElementById('cngRate').value = foundShift.cngRate.toFixed(2);
    document.getElementById('shiftRemarks').value = foundShift.remarks || '';
    
    renderNozzlesContainer(foundShift.nozzleReadings);
    renderSalesmanEntries(foundShift.salesmanEntries);
    
    // Lock saved shift
    isShiftLocked = true;
    setFormFieldsDisabled(true);
    document.getElementById('btnUnlockShift').style.display = 'block';
    document.getElementById('btnSaveShift').style.display = 'none';
    showToast('Existing shift data loaded! Locked.');
  } else {
    renderNozzlesContainer();
    renderSalesmanEntries();
    
    // Unlock new shift
    isShiftLocked = false;
    setFormFieldsDisabled(false);
    document.getElementById('btnUnlockShift').style.display = 'none';
    document.getElementById('btnSaveShift').style.display = 'block';
  }
  recalculateAll();
  updateDayShiftSummaryCard();
}

function updateDayShiftSummaryCard() {
  const dateStr = document.getElementById('shiftDate').value;
  const shiftType = document.getElementById('shiftType').value;
  const summaryCard = document.getElementById('dayShiftSummaryCard');
  
  if (!summaryCard) return;

  if (shiftType === 'Night' && dateStr) {
    const dayShiftId = `${dateStr}_Day`;
    const dayShift = state.shifts.find(s => s.id === dayShiftId);
    
    if (dayShift && dayShift.salesmanEntries) {
      let cardTotal = 0;
      let upiTotal = 0;
      dayShift.salesmanEntries.forEach(s => {
        cardTotal += parseFloat(s.card) || 0;
        upiTotal += parseFloat(s.upi) || 0;
      });
      
      document.getElementById('dayTotalCardVal').textContent = `₹ ${cardTotal.toFixed(2)}`;
      document.getElementById('dayTotalUpiVal').textContent = `₹ ${upiTotal.toFixed(2)}`;
      document.getElementById('dayTotalDigitalVal').textContent = `₹ ${(cardTotal + upiTotal).toFixed(2)}`;
      summaryCard.style.display = 'block';
      return;
    }
  }
  
  summaryCard.style.display = 'none';
}

function saveCurrentFormToState() {
  const dateStr = document.getElementById('shiftDate').value;
  const shiftType = document.getElementById('shiftType').value;
  const cngRate = parseFloat(document.getElementById('cngRate').value) || 0;
  const remarks = document.getElementById('shiftRemarks').value;
  const shiftId = `${dateStr}_${shiftType}`;

  if (!dateStr) return;

  const nozzleReadings = [];
  const openingInputs = document.querySelectorAll('.nozzle-opening-input');
  const closingInputs = document.querySelectorAll('.nozzle-closing-input');

  for (let i = 0; i < 7; i++) {
    const opening = parseFloat(openingInputs[i]?.value) || 0;
    const closing = parseFloat(closingInputs[i]?.value) || 0;
    const saleKg = Math.max(0, closing - opening);
    const saleAmount = saleKg * cngRate;

    nozzleReadings.push({
      nozzleIndex: i,
      nozzleName: state.nozzles[i] || `Nozzle ${i + 1}`,
      opening,
      closing,
      saleKg,
      saleAmount
    });
  }

  const salesmanEntries = [];
  const salesmanCount = 5;
  const salesmanNames = document.querySelectorAll('.salesman-select-name');
  const cardInputs = document.querySelectorAll('.salesman-card');
  const upiInputs = document.querySelectorAll('.salesman-upi');
  const cashInputs = document.querySelectorAll('.salesman-cash');

  for (let i = 0; i < salesmanCount; i++) {
    const salesmanName = salesmanNames[i]?.value || '';
    const assignedIndices = getAssignedNozzleIndices(shiftType, i);
    let saleKg = 0;
    let saleAmount = 0;
    assignedIndices.forEach(idx => {
      saleKg += nozzleReadings[idx].saleKg;
      saleAmount += nozzleReadings[idx].saleAmount;
    });

    const card = parseFloat(cardInputs[i]?.value) || 0;
    const upi = parseFloat(upiInputs[i]?.value) || 0;
    const cashReceived = parseFloat(cashInputs[i]?.value) || 0;
    const cashToCollect = Math.max(0, saleAmount - card - upi);
    const difference = cashReceived - cashToCollect;

    salesmanEntries.push({
      salesmanIndex: i,
      salesmanName,
      card,
      upi,
      cashReceived,
      saleKg,
      saleAmount,
      cashToCollect,
      difference
    });
  }

  state.shifts = state.shifts.filter(s => s.id !== shiftId);
  state.shifts.push({
    id: shiftId,
    date: dateStr,
    shiftType,
    cngRate,
    remarks,
    nozzleReadings,
    salesmanEntries,
    savedAt: new Date().toISOString()
  });

  state.shifts.sort((a,b) => new Date(b.date) - new Date(a.date));
}

async function saveShiftEntryManual() {
  const dateStr = document.getElementById('shiftDate').value;
  const shiftType = document.getElementById('shiftType').value;
  const shiftId = `${dateStr}_${shiftType}`;

  if (!dateStr) {
    showToast('Please select a date first!', true);
    return;
  }

  const shiftTypeVal = document.getElementById('shiftType').value;
  const salesmanCount = 5;
  const salesmanNames = document.querySelectorAll('.salesman-select-name');
  let hasIncomplete = false;

  for (let i = 0; i < salesmanCount; i++) {
    if (!salesmanNames[i]?.value) {
      hasIncomplete = true;
      break;
    }
  }

  if (hasIncomplete) {
    showToast('Please select salesman names for all fields!', true);
    return;
  }

  saveCurrentFormToState();
  await saveStateToFirebase();
  
  showToast('💾 Shift saved successfully to Cloud & local PC!');
  updateDashboardStats();

  // Lock the shift upon saving
  isShiftLocked = true;
  setFormFieldsDisabled(true);
  document.getElementById('btnUnlockShift').style.display = 'block';
  document.getElementById('btnSaveShift').style.display = 'none';

  // Automatically trigger PDF download after 500ms
  setTimeout(() => {
    generateShiftPDF();
  }, 500);
}

async function deleteShift(shiftId) {
  if (confirm('Are you sure you want to delete this shift entry?')) {
    state.shifts = state.shifts.filter(s => s.id !== shiftId);
    await saveStateToFirebase();
    showToast('Shift deleted.');
    updateDashboardStats();
  }
}

// ── DASHBOARD CALCULATIONS ────────────────────────────────────
function updateDashboardStats() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  const todayShifts = state.shifts.filter(s => s.date === todayStr);

  let totalKg = 0;
  let totalCash = 0;
  let totalDigital = 0;
  let totalDiff = 0;

  todayShifts.forEach(shift => {
    if (shift.nozzleReadings) {
      shift.nozzleReadings.forEach(n => {
        totalKg += n.saleKg;
      });
    }
    if (shift.salesmanEntries) {
      shift.salesmanEntries.forEach(entry => {
        totalCash += entry.cashReceived;
        totalDigital += (entry.card || 0) + (entry.upi || 0);
        totalDiff += entry.difference;
      });
    }
    // Backward compatibility helper
    if (shift.staffEntries && !shift.nozzleReadings) {
      shift.staffEntries.forEach(entry => {
        totalKg += entry.saleKg;
        totalCash += entry.cashReceived;
        totalDigital += entry.paytmReceived;
        totalDiff += entry.difference;
      });
    }
  });

  document.getElementById('db-total-kg').textContent = `${totalKg.toFixed(2)} Kg`;
  document.getElementById('db-total-cash').textContent = `₹ ${totalCash.toFixed(2)}`;
  document.getElementById('db-total-paytm').textContent = `₹ ${totalDigital.toFixed(2)}`;
  
  const diffEl = document.getElementById('db-total-diff');
  diffEl.textContent = `₹ ${totalDiff.toFixed(2)}`;
  
  if (totalDiff >= 0) {
    diffEl.className = 'sc-val diff-green';
  } else {
    diffEl.className = 'sc-val diff-red';
  }

  const listEl = document.getElementById('recentShiftsList');
  listEl.innerHTML = '';

  if (state.shifts.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">No shifts recorded yet. Start in Shift Entry!</div>';
    return;
  }

  const recentShifts = state.shifts.slice(0, 10);
  recentShifts.forEach(shift => {
    let shiftKg = 0;
    let shiftDiff = 0;

    if (shift.nozzleReadings) {
      shift.nozzleReadings.forEach(n => { shiftKg += n.saleKg; });
    } else if (shift.staffEntries) {
      shift.staffEntries.forEach(e => { shiftKg += e.saleKg; });
    }

    if (shift.salesmanEntries) {
      shift.salesmanEntries.forEach(e => { shiftDiff += e.difference; });
    } else if (shift.staffEntries) {
      shift.staffEntries.forEach(e => { shiftDiff += e.difference; });
    }

    const item = document.createElement('div');
    item.className = 'recent-item';
    
    const [y, m, d] = shift.date.split('-');
    const dateFormatted = `${d}/${m}/${y}`;

    item.innerHTML = `
      <div class="recent-left">
        <span class="recent-title">${dateFormatted} - ${shift.shiftType} Shift</span>
        <span class="recent-sub">${shiftKg.toFixed(2)} Kg sold @ ₹${shift.cngRate.toFixed(2)}</span>
      </div>
      <div class="recent-right">
        <span class="recent-diff ${shiftDiff >= 0 ? 'diff-green' : 'diff-red'}">
          ₹ ${shiftDiff >= 0 ? '+' : ''}${shiftDiff.toFixed(2)}
        </span>
        <button class="btn-delete-shift" onclick="deleteShift('${shift.id}')">🗑️</button>
      </div>
    `;
    listEl.appendChild(item);
  });
}

// ── SETTINGS MANAGEMENT ───────────────────────────────────────
function renderSettingsLists() {
  const staffListEl = document.getElementById('settingsStaffList');
  staffListEl.innerHTML = '';
  if (state.staffNames.length === 0) {
    staffListEl.innerHTML = '<li class="empty-msg" style="padding:10px;">No salesmen configured.</li>';
  } else {
    state.staffNames.forEach((name, idx) => {
      const li = document.createElement('li');
      li.className = 'settings-item';
      li.innerHTML = `
        <span>${name}</span>
        <button class="btn-delete-item" onclick="deleteStaffMember(${idx})">Remove</button>
      `;
      staffListEl.appendChild(li);
    });
  }

  const nozzleListEl = document.getElementById('settingsNozzleList');
  nozzleListEl.innerHTML = '';
  sanitizeStateNozzles();

  state.nozzles.forEach((nozzle, idx) => {
    const li = document.createElement('li');
    li.className = 'settings-item';
    li.innerHTML = `
      <span style="font-weight:600;">Nozzle ${idx + 1}:</span>
      <input type="text" class="inp-text" data-idx="${idx}" value="${nozzle}" style="width: 60%; margin-left: 10px; padding: 4px 8px;" onchange="renameNozzle(${idx}, this.value)" />
    `;
    nozzleListEl.appendChild(li);
  });

  renderShiftAssignments();
}

async function renameNozzle(idx, val) {
  const trimmed = val.trim();
  if (trimmed) {
    state.nozzles[idx] = trimmed;
    await saveStateToFirebase();
    showToast(`Nozzle ${idx + 1} renamed to: ${trimmed}`);
  }
}

async function addStaffMember() {
  const val = document.getElementById('newStaffName').value.trim();
  if (val) {
    if (state.staffNames.includes(val)) {
      showToast('Salesman already exists!', true);
      return;
    }
    state.staffNames.push(val);
    document.getElementById('newStaffName').value = '';
    await saveStateToFirebase();
    renderSettingsLists();
    showToast('Salesman added!');
  }
}

async function deleteStaffMember(idx) {
  if (confirm(`Remove ${state.staffNames[idx]}?`)) {
    state.staffNames.splice(idx, 1);
    await saveStateToFirebase();
    renderSettingsLists();
    showToast('Salesman removed.');
  }
}

async function resetAllState() {
  const pw = prompt("Enter Password to reset all data:");
  if (pw !== 'PRANAV@6442') {
    showToast('Incorrect Password!', true);
    return;
  }
  if (confirm('⚠️ WARNING: This will permanently delete all shift entries, staff, and nozzle settings. Are you absolutely sure?')) {
    state = {
      staffNames: [],
      nozzles: [],
      shifts: []
    };
    await saveStateToFirebase();
    location.reload();
  }
}

// ── UTILITIES: TOAST NOTIFICATIONS ──────────────────────────────
function showToast(msg, isError = false) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (isError) {
    toast.style.borderColor = 'var(--red-alert)';
    toast.innerHTML = `⚠️ ${msg}`;
  } else {
    toast.innerHTML = `✅ ${msg}`;
  }
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── PDF GENERATOR (jsPDF) ─────────────────────────────────────
function generateShiftPDF() {
  const dateStr = document.getElementById('shiftDate').value;
  const shiftType = document.getElementById('shiftType').value;
  const cngRate = parseFloat(document.getElementById('cngRate').value) || 0;
  const remarks = document.getElementById('shiftRemarks').value;

  if (!dateStr) {
    showToast('Please select a date to generate PDF!', true);
    return;
  }

  // 1. Collect nozzle readings from DOM
  const nozzleReadings = [];
  const openingInputs = document.querySelectorAll('.nozzle-opening-input');
  const closingInputs = document.querySelectorAll('.nozzle-closing-input');
  for (let i = 0; i < 7; i++) {
    const opening = parseFloat(openingInputs[i]?.value) || 0;
    const closing = parseFloat(closingInputs[i]?.value) || 0;
    const saleKg = Math.max(0, closing - opening);
    const saleAmount = saleKg * cngRate;
    nozzleReadings.push({
      name: state.nozzles[i] || `Nozzle ${i + 1}`,
      opening,
      closing,
      saleKg,
      saleAmount
    });
  }

  // 2. Collect salesman entries from DOM
  const salesmanEntries = [];
  const salesmanCount = 5;
  const salesmanNames = document.querySelectorAll('.salesman-select-name');
  const cardInputs = document.querySelectorAll('.salesman-card');
  const upiInputs = document.querySelectorAll('.salesman-upi');
  const cashInputs = document.querySelectorAll('.salesman-cash');

  let hasIncomplete = false;
  for (let i = 0; i < salesmanCount; i++) {
    const salesmanName = salesmanNames[i]?.value;
    if (!salesmanName) {
      hasIncomplete = true;
      break;
    }
    const assignedIndices = getAssignedNozzleIndices(shiftType, i);
    let saleKg = 0;
    let saleAmount = 0;
    assignedIndices.forEach(idx => {
      saleKg += nozzleReadings[idx].saleKg;
      saleAmount += nozzleReadings[idx].saleAmount;
    });

    const card = parseFloat(cardInputs[i]?.value) || 0;
    const upi = parseFloat(upiInputs[i]?.value) || 0;
    const cashReceived = parseFloat(cashInputs[i]?.value) || 0;
    const cashToCollect = Math.max(0, saleAmount - card - upi);
    const difference = cashReceived - cashToCollect;

    salesmanEntries.push({
      name: salesmanName,
      nozzles: assignedIndices.map(idx => state.nozzles[idx] || `Nozzle ${idx + 1}`).join(', '),
      saleKg,
      saleAmount,
      card,
      upi,
      cashToCollect,
      cashReceived,
      difference
    });
  }

  if (hasIncomplete) {
    showToast('Fill all salesman name details first!', true);
    return;
  }

  const [y, m, d] = dateStr.split('-');
  const displayDate = `${d}/${m}/${y}`;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Header Title
  doc.setFillColor(18, 22, 31);
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('CNG PumpPro', 15, 12);
  doc.setFontSize(9);
  doc.setFont('Helvetica', 'normal');
  doc.text('SHIFT-WISE SALES & DIFFERENCE REPORT', 15, 18);

  // Metadata Card
  doc.setFillColor(245, 245, 245);
  doc.rect(15, 36, 180, 18, 'F');
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`DATE: ${displayDate}`, 20, 42);
  doc.text(`SHIFT: ${shiftType.toUpperCase()}`, 20, 48);
  doc.text(`CNG RATE: Rs. ${cngRate.toFixed(2)}/Kg`, 110, 42);
  doc.text(`GENERATED AT: ${new Date().toLocaleTimeString()}`, 110, 48);

  // 1. NOZZLE READINGS TABLE
  let startY = 60;
  doc.setFillColor(0, 230, 118);
  doc.rect(15, startY, 180, 7, 'F');
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Nozzle Name', 18, startY + 5);
  doc.text('Opening (Kg)', 65, startY + 5);
  doc.text('Closing (Kg)', 100, startY + 5);
  doc.text('Sale (Kg)', 135, startY + 5);
  doc.text('Sale Amount', 165, startY + 5);

  let currentY = startY + 7;
  doc.setFont('Helvetica', 'normal');
  
  let totalSaleKg = 0;
  let totalSaleAmt = 0;

  nozzleReadings.forEach((n, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 249, 250);
      doc.rect(15, currentY, 180, 8, 'F');
    }
    doc.setDrawColor(230, 230, 230);
    doc.line(15, currentY + 8, 195, currentY + 8);

    doc.text(n.name, 18, currentY + 5);
    doc.text(n.opening.toFixed(2), 65, currentY + 5);
    doc.text(n.closing.toFixed(2), 100, currentY + 5);
    doc.text(`${n.saleKg.toFixed(2)} Kg`, 135, currentY + 5);
    doc.text(`Rs. ${n.saleAmount.toFixed(2)}`, 165, currentY + 5);

    totalSaleKg += n.saleKg;
    totalSaleAmt += n.saleAmount;
    currentY += 8;
  });

  doc.setFillColor(240, 240, 240);
  doc.rect(15, currentY, 180, 8, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.text('Total Nozzle Sales', 18, currentY + 5);
  doc.text(`${totalSaleKg.toFixed(2)} Kg`, 135, currentY + 5);
  doc.text(`Rs. ${totalSaleAmt.toFixed(2)}`, 165, currentY + 5);
  currentY += 12;

  // 2. SALESMAN WISE HISAB TABLE
  doc.setFillColor(0, 230, 118);
  doc.rect(15, currentY, 180, 7, 'F');
  
  doc.setTextColor(0, 0, 0);
  doc.text('Salesman / Nozzles', 18, currentY + 5);
  doc.text('Sale Amt', 65, currentY + 5);
  doc.text('Card/UPI', 95, currentY + 5);
  doc.text('Cash Collect', 125, currentY + 5);
  doc.text('Cash Recd', 155, currentY + 5);
  doc.text('Diff (+/-)', 178, currentY + 5);

  currentY += 7;
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);

  let totalCard = 0;
  let totalUpi = 0;
  let totalCashRecd = 0;
  let totalCashToCollect = 0;
  let totalDiff = 0;

  salesmanEntries.forEach((s, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 249, 250);
      doc.rect(15, currentY, 180, 10, 'F');
    }
    doc.setDrawColor(230, 230, 230);
    doc.line(15, currentY + 10, 195, currentY + 10);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(s.name, 18, currentY + 4);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`(${s.nozzles})`, 18, currentY + 8);

    doc.setFontSize(9);
    doc.text(`Rs. ${s.saleAmount.toFixed(2)}`, 65, currentY + 6);
    doc.text(`Rs. ${(s.card + s.upi).toFixed(2)}`, 95, currentY + 4);
    doc.setFontSize(7);
    doc.text(`(C:${s.card} U:${s.upi})`, 95, currentY + 8);
    
    doc.setFontSize(9);
    doc.text(`Rs. ${s.cashToCollect.toFixed(2)}`, 125, currentY + 6);
    doc.text(`Rs. ${s.cashReceived.toFixed(2)}`, 155, currentY + 6);
    
    doc.setFont('Helvetica', 'bold');
    if (s.difference >= 0) {
      doc.setTextColor(0, 150, 0);
      doc.text(`+${s.difference.toFixed(2)}`, 178, currentY + 6);
    } else {
      doc.setTextColor(200, 0, 0);
      doc.text(`${s.difference.toFixed(2)}`, 178, currentY + 6);
    }
    doc.setTextColor(0,0,0);

    totalCard += s.card;
    totalUpi += s.upi;
    totalCashRecd += s.cashReceived;
    totalCashToCollect += s.cashToCollect;
    totalDiff += s.difference;

    currentY += 10;
  });

  // Totals Summary Box
  currentY += 4;
  doc.setFillColor(240, 248, 240);
  doc.rect(15, currentY, 180, 22, 'F');
  doc.setDrawColor(0, 180, 80);
  doc.rect(15, currentY, 180, 22, 'S');

  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('SHIFT GRAND TOTAL SUMMARY', 20, currentY + 5);
  doc.line(20, currentY + 7, 190, currentY + 7);

  doc.setFont('Helvetica', 'normal');
  doc.text(`Total Sales: Rs. ${totalSaleAmt.toFixed(2)}`, 20, currentY + 12);
  doc.text(`Total Sales (Kg): ${totalSaleKg.toFixed(2)} Kg`, 20, currentY + 17);

  doc.text(`Digital: Rs. ${(totalCard + totalUpi).toFixed(2)} (Card:${totalCard} UPI:${totalUpi})`, 90, currentY + 12);
  doc.text(`Cash Collect: Rs. ${totalCashToCollect.toFixed(2)}`, 90, currentY + 17);
  doc.text(`Cash Recd: Rs. ${totalCashRecd.toFixed(2)}`, 142, currentY + 12);

  doc.setFont('Helvetica', 'bold');
  doc.text(`Net Diff:`, 142, currentY + 17);
  if (totalDiff >= 0) {
    doc.setTextColor(0, 150, 0);
    doc.text(`+${totalDiff.toFixed(2)}`, 158, currentY + 17);
  } else {
    doc.setTextColor(200, 0, 0);
    doc.text(`${totalDiff.toFixed(2)}`, 158, currentY + 17);
  }
  doc.setTextColor(0, 0, 0);

  // Remarks Section
  if (remarks) {
    currentY += 28;
    doc.setTextColor(100, 100, 100);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('REMARKS / SHIFT NOTES:', 15, currentY);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(0,0,0);
    
    const splitRemarks = doc.splitTextToSize(remarks, 180);
    doc.text(splitRemarks, 15, currentY + 5);
  }

  // Footer branding
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.text('Generated via CNG PumpPro Cloud Mobile App - Powered by Google', 15, 285);

  const filename = `CNG_Shift_${dateStr}_${shiftType}.pdf`;
  doc.save(filename);
  showToast(`📄 PDF downloaded: ${filename}`);
}

function generate24HourPDF() {
  const dateStr = document.getElementById('shiftDate').value;
  if (!dateStr) {
    showToast('Please select a date to generate 24h PDF!', true);
    return;
  }

  const dayShift = state.shifts.find(s => s.date === dateStr && s.shiftType === 'Day');
  const nightShift = state.shifts.find(s => s.date === dateStr && s.shiftType === 'Night');

  if (!dayShift && !nightShift) {
    showToast('No shift data found for this date!', true);
    return;
  }

  const [y, m, d] = dateStr.split('-');
  const displayDate = `${d}/${m}/${y}`;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Header Title
  doc.setFillColor(18, 22, 31);
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('CNG PumpPro', 15, 12);
  doc.setFontSize(9);
  doc.setFont('Helvetica', 'normal');
  doc.text('24-HOUR COMBINED DAILY SALES & TALLY REPORT', 15, 18);

  // Metadata Card
  doc.setFillColor(245, 245, 245);
  doc.rect(15, 36, 180, 18, 'F');
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`DATE: ${displayDate}`, 20, 42);
  
  const rateDay = dayShift ? dayShift.cngRate : 0;
  const rateNight = nightShift ? nightShift.cngRate : 0;
  const rateStr = rateDay && rateNight && rateDay !== rateNight 
    ? `Rs. ${rateDay.toFixed(2)} (Day) / Rs. ${rateNight.toFixed(2)} (Night)`
    : `Rs. ${(rateDay || rateNight).toFixed(2)}/Kg`;

  doc.text(`CNG RATE: ${rateStr}`, 20, 48);
  doc.text(`GENERATED AT: ${new Date().toLocaleTimeString()}`, 110, 48);
  doc.text(`SHIFTS RECORDED: ${dayShift ? 'DAY' : ''} ${nightShift ? 'NIGHT' : ''}`, 110, 42);

  // 1. COMBINED NOZZLE SALES TABLE
  let startY = 60;
  doc.setFillColor(0, 150, 136); // Teal for combined
  doc.rect(15, startY, 180, 7, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Nozzle Name', 18, startY + 5);
  doc.text('Day Sale (Kg)', 65, startY + 5);
  doc.text('Night Sale (Kg)', 100, startY + 5);
  doc.text('Total Sale (Kg)', 135, startY + 5);
  doc.text('Total Amount (Rs)', 165, startY + 5);

  let currentY = startY + 7;
  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'normal');
  
  let grandNozzleSaleKg = 0;
  let grandNozzleSaleAmt = 0;

  for (let i = 0; i < 7; i++) {
    const nozzleName = state.nozzles[i] || `Nozzle ${i + 1}`;
    const daySale = dayShift && dayShift.nozzleReadings[i] ? dayShift.nozzleReadings[i].saleKg : 0;
    const nightSale = nightShift && nightShift.nozzleReadings[i] ? nightShift.nozzleReadings[i].saleKg : 0;
    const totalSale = daySale + nightSale;
    const totalAmt = (dayShift && dayShift.nozzleReadings[i] ? dayShift.nozzleReadings[i].saleAmount : 0) + 
                     (nightShift && nightShift.nozzleReadings[i] ? nightShift.nozzleReadings[i].saleAmount : 0);

    if (i % 2 === 1) {
      doc.setFillColor(248, 249, 250);
      doc.rect(15, currentY, 180, 8, 'F');
    }
    doc.setDrawColor(230, 230, 230);
    doc.line(15, currentY + 8, 195, currentY + 8);

    doc.text(nozzleName, 18, currentY + 5);
    doc.text(daySale.toFixed(2), 65, currentY + 5);
    doc.text(nightSale.toFixed(2), 100, currentY + 5);
    doc.text(`${totalSale.toFixed(2)} Kg`, 135, currentY + 5);
    doc.text(`Rs. ${totalAmt.toFixed(2)}`, 165, currentY + 5);

    grandNozzleSaleKg += totalSale;
    grandNozzleSaleAmt += totalAmt;
    currentY += 8;
  }

  doc.setFillColor(240, 240, 240);
  doc.rect(15, currentY, 180, 8, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.text('Total 24h Sales', 18, currentY + 5);
  doc.text(`${(dayShift ? dayShift.nozzleReadings.reduce((sum, n) => sum + n.saleKg, 0) : 0).toFixed(2)} Kg`, 65, currentY + 5);
  doc.text(`${(nightShift ? nightShift.nozzleReadings.reduce((sum, n) => sum + n.saleKg, 0) : 0).toFixed(2)} Kg`, 100, currentY + 5);
  doc.text(`${grandNozzleSaleKg.toFixed(2)} Kg`, 135, currentY + 5);
  doc.text(`Rs. ${grandNozzleSaleAmt.toFixed(2)}`, 165, currentY + 5);
  currentY += 12;

  // 2. SALESMAN WISE HISAB TABLE (Day & Night shifts listed)
  doc.setFillColor(0, 150, 136);
  doc.rect(15, currentY, 180, 7, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.text('Shift - Salesman / Nozzles', 18, currentY + 5);
  doc.text('Sale Amt', 65, currentY + 5);
  doc.text('Card/UPI', 95, currentY + 5);
  doc.text('Cash Collect', 125, currentY + 5);
  doc.text('Cash Recd', 155, currentY + 5);
  doc.text('Diff (+/-)', 178, currentY + 5);

  currentY += 7;
  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);

  let totalCard = 0;
  let totalUpi = 0;
  let totalCashRecd = 0;
  let totalCashToCollect = 0;
  let totalDiff = 0;

  const allSalesmen = [];
  if (dayShift && dayShift.salesmanEntries) {
    dayShift.salesmanEntries.forEach(s => {
      const assignedIndices = getAssignedNozzleIndices('Day', s.salesmanIndex);
      const nozzleLabels = assignedIndices.map(idx => state.nozzles[idx] || `Nozzle ${idx + 1}`).join(', ');
      allSalesmen.push({ ...s, shift: 'Day', nozzles: nozzleLabels });
    });
  }
  if (nightShift && nightShift.salesmanEntries) {
    nightShift.salesmanEntries.forEach(s => {
      const assignedIndices = getAssignedNozzleIndices('Night', s.salesmanIndex);
      const nozzleLabels = assignedIndices.map(idx => state.nozzles[idx] || `Nozzle ${idx + 1}`).join(', ');
      allSalesmen.push({ ...s, shift: 'Night', nozzles: nozzleLabels });
    });
  }

  allSalesmen.forEach((s, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 249, 250);
      doc.rect(15, currentY, 180, 10, 'F');
    }
    doc.setDrawColor(230, 230, 230);
    doc.line(15, currentY + 10, 195, currentY + 10);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`${s.shift} - ${s.salesmanName || 'N/A'}`, 18, currentY + 4);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`(${s.nozzles || ''})`, 18, currentY + 8);

    doc.setFontSize(8.5);
    doc.text(`Rs. ${s.saleAmount.toFixed(2)}`, 65, currentY + 6);
    doc.text(`Rs. ${(s.card + s.upi).toFixed(2)}`, 95, currentY + 4);
    doc.setFontSize(7);
    doc.text(`(C:${s.card} U:${s.upi})`, 95, currentY + 8);
    
    doc.setFontSize(8.5);
    doc.text(`Rs. ${s.cashToCollect.toFixed(2)}`, 125, currentY + 6);
    doc.text(`Rs. ${s.cashReceived.toFixed(2)}`, 155, currentY + 6);
    
    doc.setFont('Helvetica', 'bold');
    if (s.difference >= 0) {
      doc.setTextColor(0, 120, 0);
      doc.text(`+${s.difference.toFixed(2)}`, 178, currentY + 6);
    } else {
      doc.setTextColor(200, 0, 0);
      doc.text(`${s.difference.toFixed(2)}`, 178, currentY + 6);
    }
    doc.setTextColor(0,0,0);

    totalCard += s.card;
    totalUpi += s.upi;
    totalCashRecd += s.cashReceived;
    totalCashToCollect += s.cashToCollect;
    totalDiff += s.difference;

    currentY += 10;
  });

  // Totals Summary Box
  currentY += 4;
  doc.setFillColor(240, 248, 240);
  doc.rect(15, currentY, 180, 26, 'F');
  doc.setDrawColor(0, 150, 136);
  doc.rect(15, currentY, 180, 26, 'S');

  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('24-HOUR COMBINED GRAND SUMMARY', 20, currentY + 5);
  doc.line(20, currentY + 7, 190, currentY + 7);

  doc.setFont('Helvetica', 'normal');
  
  // Line 1
  doc.text(`Total Sales: Rs. ${grandNozzleSaleAmt.toFixed(2)}`, 20, currentY + 12);
  doc.text(`Digital: Rs. ${(totalCard + totalUpi).toFixed(2)}`, 85, currentY + 12);
  doc.text(`Cash Collect: Rs. ${totalCashToCollect.toFixed(2)}`, 140, currentY + 12);
  
  // Line 2
  doc.text(`Total Sales (Kg): ${grandNozzleSaleKg.toFixed(2)} Kg`, 20, currentY + 18);
  doc.text(`(Card: Rs. ${totalCard} | UPI: Rs. ${totalUpi})`, 85, currentY + 18);
  doc.text(`Cash Recd: Rs. ${totalCashRecd.toFixed(2)}`, 140, currentY + 18);

  // Line 3
  doc.setFont('Helvetica', 'bold');
  doc.text(`Net Diff:`, 140, currentY + 23);
  if (totalDiff >= 0) {
    doc.setTextColor(0, 120, 0);
    doc.text(`+${totalDiff.toFixed(2)}`, 158, currentY + 23);
  } else {
    doc.setTextColor(200, 0, 0);
    doc.text(`${totalDiff.toFixed(2)}`, 158, currentY + 23);
  }
  doc.setTextColor(0, 0, 0);

  // Remarks Section
  let remarksText = '';
  if (dayShift && dayShift.remarks) {
    remarksText += `[Day]: ${dayShift.remarks}\n`;
  }
  if (nightShift && nightShift.remarks) {
    remarksText += `[Night]: ${nightShift.remarks}`;
  }
  
  if (remarksText) {
    currentY += 32;
    doc.setTextColor(100, 100, 100);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('COMBINED SHIFT REMARKS:', 15, currentY);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(0,0,0);
    
    const splitRemarks = doc.splitTextToSize(remarksText, 180);
    doc.text(splitRemarks, 15, currentY + 5);
  }

  // Footer branding
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.text('Generated via CNG PumpPro Cloud Mobile App - Powered by Google', 15, 285);

  const filename = `CNG_24h_Report_${dateStr}.pdf`;
  doc.save(filename);
  showToast(`📄 24h PDF downloaded: ${filename}`);
}
