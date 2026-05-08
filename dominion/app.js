let allCards = [];
let allSets = [];
let kingdom = [];
let sortOrder = 'cost'; // 'cost' | 'set'

// Veto state
let vetoMode = false;
let vetoQueue = [];    // ordered list of player names for each veto turn
let vetoIndex = 0;
let pendingVetoCard = null; // card name currently selected for veto

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  const res = await fetch('data/cards.json');
  const data = await res.json();
  allCards = data.cards;
  allSets = data.sets;

  renderSetCheckboxes();
  setupControls();
  renderPlayerInputs(2);
  generateKingdom();
  renderBasicSupply(2);
}

// ─── Controls ────────────────────────────────────────────────────────────────

function renderSetCheckboxes() {
  const container = document.getElementById('set-checkboxes');
  container.innerHTML = '';
  allSets.forEach(set => {
    const label = document.createElement('label');
    label.className = 'set-checkbox';
    label.innerHTML = `
      <input type="checkbox" value="${set.id}" checked>
      <span>${set.name}</span>
    `;
    container.appendChild(label);
  });
  container.addEventListener('change', onSettingsChange);
}

function setupControls() {
  document.getElementById('players').addEventListener('change', onSettingsChange);
  document.getElementById('max-sets').addEventListener('change', onSettingsChange);
  document.getElementById('min-per-set').addEventListener('change', onSettingsChange);
  document.getElementById('veto-count').addEventListener('input', validateVetoCount);
  document.getElementById('generate-btn').addEventListener('click', generateKingdom);
  document.getElementById('veto-btn').addEventListener('click', startVeto);
  document.getElementById('sort-btn').addEventListener('click', toggleSort);

  // Event delegation for veto card interactions
  document.getElementById('kingdom-grid').addEventListener('click', e => {
    if (!vetoMode) return;
    const tile = e.target.closest('.card-tile');
    if (!tile) return;
    if (e.target.closest('.veto-confirm-btn')) { confirmVeto(); return; }
    if (e.target.closest('.veto-cancel-btn'))  { cancelVetoSelect(); return; }
    if (e.target.closest('.veto-btn'))         { selectCardForVeto(tile.dataset.name); return; }
  });
}

function onSettingsChange() {
  const selected = getSelectedSets();
  const maxSetsInput = document.getElementById('max-sets');
  const minPerSetInput = document.getElementById('min-per-set');

  maxSetsInput.max = selected.length || 1;
  if (parseInt(maxSetsInput.value) > selected.length) maxSetsInput.value = selected.length;

  const players = parseInt(document.getElementById('players').value) || 2;
  renderPlayerInputs(players);
  validateVetoCount();

  const maxSets = parseInt(maxSetsInput.value) || 1;
  const minPerSet = parseInt(minPerSetInput.value) || 1;
  const warning = document.getElementById('constraint-warning');
  if (maxSets * minPerSet > 10) {
    warning.textContent = `Warning: ${maxSets} sets × ${minPerSet} min per set = ${maxSets * minPerSet} cards, but a kingdom only has 10.`;
    warning.hidden = false;
  } else {
    warning.hidden = true;
  }
}

function validateVetoCount() {
  const players = parseInt(document.getElementById('players').value) || 2;
  const vetoCount = parseInt(document.getElementById('veto-count').value) || 0;
  const warning = document.getElementById('veto-warning');
  if (vetoCount > 0 && vetoCount % players !== 0) {
    warning.textContent = `Must be a multiple of ${players}.`;
    warning.hidden = false;
    return false;
  }
  warning.hidden = true;
  return true;
}

// ─── Card pool builder ────────────────────────────────────────────────────────

function buildCardPool(totalCount) {
  const selectedSetIds = getSelectedSets();
  if (selectedSetIds.length === 0) { showError('Select at least one set.'); return null; }

  const maxSets = Math.min(
    parseInt(document.getElementById('max-sets').value) || selectedSetIds.length,
    selectedSetIds.length
  );
  const minPerSet = parseInt(document.getElementById('min-per-set').value) || 1;

  if (maxSets * minPerSet > totalCount) {
    showError(`Constraints require ${maxSets * minPerSet} cards but only ${totalCount} slots available.`);
    return null;
  }

  const shuffledSets = shuffle([...selectedSetIds]).slice(0, maxSets);
  const poolBySet = {};
  shuffledSets.forEach(id => { poolBySet[id] = shuffle(allCards.filter(c => c.set === id)); });

  const picked = [];
  shuffledSets.forEach(id => {
    picked.push(...poolBySet[id].splice(0, Math.min(minPerSet, poolBySet[id].length)));
  });

  const remaining = shuffle(shuffledSets.flatMap(id => poolBySet[id]));
  for (const card of remaining) {
    if (picked.length >= totalCount) break;
    picked.push(card);
  }

  return picked.slice(0, totalCount);
}

// ─── Generate ────────────────────────────────────────────────────────────────

function generateKingdom() {
  resetVeto();
  const cards = buildCardPool(10);
  if (!cards) return;

  const players = parseInt(document.getElementById('players').value) || 2;
  renderBasicSupply(players);
  showFirstPlayer(pickFirstPlayer(getPlayerNames(players), players));

  kingdom = cards;
  sortKingdom();
  renderKingdom(players);
  hideError();
}

// ─── Veto ─────────────────────────────────────────────────────────────────────

function startVeto() {
  if (!validateVetoCount()) return;

  const players = parseInt(document.getElementById('players').value) || 2;
  const vetoCount = parseInt(document.getElementById('veto-count').value) || 0;

  if (vetoCount === 0) { generateKingdom(); return; }

  const cards = buildCardPool(10 + vetoCount);
  if (!cards) return;

  // Build veto order: randomise player order once, then repeat that order each round
  const names = getPlayerNames(players);
  const vetosEach = vetoCount / players;
  const order = shuffle([...names]);
  const queue = [];
  for (let i = 0; i < vetosEach; i++) order.forEach(n => queue.push(n));
  vetoQueue = queue;
  vetoIndex = 0;
  vetoMode = true;
  pendingVetoCard = null;

  kingdom = cards;
  sortKingdom();

  renderBasicSupply(players);
  updateVetoBanner();
  renderKingdom(players);
  hideError();
}

function selectCardForVeto(cardName) {
  pendingVetoCard = cardName;
  renderKingdom(parseInt(document.getElementById('players').value) || 2);
}

function cancelVetoSelect() {
  pendingVetoCard = null;
  renderKingdom(parseInt(document.getElementById('players').value) || 2);
}

function confirmVeto() {
  if (!pendingVetoCard) return;
  kingdom = kingdom.filter(c => c.name !== pendingVetoCard);
  pendingVetoCard = null;
  vetoIndex++;

  const players = parseInt(document.getElementById('players').value) || 2;
  if (vetoIndex >= vetoQueue.length) {
    vetoMode = false;
    sortKingdom();
    showFirstPlayer(pickFirstPlayer(getPlayerNames(players), players));
  } else {
    updateVetoBanner();
  }
  renderKingdom(players);
}

function updateVetoBanner() {
  const banner = document.getElementById('first-player-banner');
  banner.textContent = `${vetoQueue[vetoIndex]} veto`;
  banner.hidden = false;
}

function resetVeto() {
  vetoMode = false;
  vetoQueue = [];
  vetoIndex = 0;
  pendingVetoCard = null;
  document.getElementById('first-player-banner').hidden = true;
}

// ─── Render kingdom ───────────────────────────────────────────────────────────

function renderKingdom(players) {
  const grid = document.getElementById('kingdom-grid');
  const empty = document.getElementById('empty-state');
  grid.innerHTML = '';

  if (kingdom.length === 0) { empty.hidden = false; return; }
  empty.hidden = true;

  kingdom.forEach(card => {
    const count = getCardCount(card, players);
    const setInfo = allSets.find(s => s.id === card.set);
    const typeClass = card.types.includes('Attack') ? 'type-attack'
      : card.types.includes('Reaction') ? 'type-reaction'
      : card.types.includes('Victory') ? 'type-victory'
      : card.types.includes('Treasure') ? 'type-treasure'
      : 'type-action';

    const isSelected = pendingVetoCard === card.name;
    const tile = document.createElement('div');
    tile.className = `card-tile${vetoMode ? ' veto-active' : ''}${isSelected ? ' veto-selected' : ''}`;
    tile.dataset.name = card.name;

    let vetoHtml = '';
    if (vetoMode) {
      vetoHtml = isSelected
        ? `<div class="veto-overlay">
             <button class="veto-confirm-btn">✓ Confirm</button>
             <button class="veto-cancel-btn">✕</button>
           </div>`
        : `<div class="veto-overlay"><button class="veto-btn">Veto</button></div>`;
    }

    tile.innerHTML = `
      <div class="card-image-wrap">
        <img src="${cardImageUrl(card)}" alt="${card.name}"
          onerror="this.closest('.card-image-wrap').classList.add('img-error'); this.remove();">
        ${vetoHtml}
      </div>
      <div class="card-info">
        <div class="card-name">${card.name}</div>
        <div class="card-meta">
          <span class="card-cost">💰 ${card.cost}</span>
          <span class="card-type ${typeClass}">${card.types.join(' · ')}</span>
        </div>
        <div class="card-footer">
          <span class="card-set">${setInfo ? setInfo.name : card.set}</span>
          <span class="card-count">×${count}</span>
        </div>
      </div>
    `;
    grid.appendChild(tile);
  });
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

function sortKingdom() {
  if (sortOrder === 'cost') {
    kingdom.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  } else {
    kingdom.sort((a, b) => a.set.localeCompare(b.set) || a.name.localeCompare(b.name));
  }
}

function toggleSort() {
  sortOrder = sortOrder === 'cost' ? 'set' : 'cost';
  document.getElementById('sort-btn').textContent =
    sortOrder === 'cost' ? 'Sort: By Cost' : 'Sort: By Set/Name';
  sortKingdom();
  renderKingdom(parseInt(document.getElementById('players').value) || 2);
}

// ─── Basic supply ─────────────────────────────────────────────────────────────

const BASIC_SUPPLY = [
  { name: 'Copper',   image: 'images/Copper.jpg',   types: ['Treasure'], cost: 0, getCount: p => 60 - 7 * p },
  { name: 'Silver',   image: 'images/Silver.jpg',   types: ['Treasure'], cost: 3, getCount: _p => 40 },
  { name: 'Gold',     image: 'images/Gold.jpg',     types: ['Treasure'], cost: 6, getCount: _p => 30 },
  { name: 'Estate',   image: 'images/Estate.jpg',   types: ['Victory'],  cost: 2, getCount: p => p === 2 ? 8 : 12 },
  { name: 'Duchy',    image: 'images/Duchy.jpg',    types: ['Victory'],  cost: 5, getCount: p => p === 2 ? 8 : 12 },
  { name: 'Province', image: 'images/Province.jpg', types: ['Victory'],  cost: 8, getCount: p => p === 2 ? 8 : 12 },
  { name: 'Curse',    image: 'images/Curse.jpg',    types: ['Curse'],    cost: 0, getCount: p => 10 * (p - 1) },
];

function renderBasicSupply(players) {
  const grid = document.getElementById('supply-grid');
  grid.innerHTML = '';
  BASIC_SUPPLY.forEach(card => {
    const count = card.getCount(players);
    const typeClass = card.types[0] === 'Treasure' ? 'type-treasure'
      : card.types[0] === 'Victory' ? 'type-victory'
      : 'type-curse';
    const tile = document.createElement('div');
    tile.className = 'card-tile';
    tile.innerHTML = `
      <div class="card-image-wrap">
        <img src="${card.image}" alt="${card.name}"
          onerror="this.closest('.card-image-wrap').classList.add('img-error'); this.remove();">
      </div>
      <div class="card-info">
        <div class="card-name">${card.name}</div>
        <div class="card-meta">
          <span class="card-cost">💰 ${card.cost}</span>
          <span class="card-type ${typeClass}">${card.types[0]}</span>
        </div>
        <div class="card-footer">
          <span class="card-set">Base Set (2nd Ed.)</span>
          <span class="card-count">×${count}</span>
        </div>
      </div>
    `;
    grid.appendChild(tile);
  });
}

// ─── Player names ─────────────────────────────────────────────────────────────

function renderPlayerInputs(count) {
  const container = document.getElementById('player-names');
  const existing = Array.from(container.querySelectorAll('input')).map(i => i.value);
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'player-name-input';
    input.placeholder = `Player ${i + 1}`;
    input.value = existing[i] || '';
    container.appendChild(input);
  }
}

function getPlayerNames(count) {
  return Array.from(document.querySelectorAll('.player-name-input'))
    .map((inp, i) => inp.value.trim() || `Player ${i + 1}`);
}

function pickFirstPlayer(players, count) {
  return players[Math.floor(Math.random() * count)];
}

function showFirstPlayer(name) {
  const banner = document.getElementById('first-player-banner');
  banner.textContent = `${name} goes first!`;
  banner.hidden = false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSelectedSets() {
  return Array.from(document.querySelectorAll('#set-checkboxes input:checked')).map(cb => cb.value);
}

function getCardCount(card, players) {
  if (card.isVictory) return players === 2 ? 8 : 12;
  return players <= 4 ? 10 : 12;
}

function cardImageUrl(card) { return card.image || ''; }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.hidden = false;
}

function hideError() { document.getElementById('error-msg').hidden = true; }

init();
