let allCards = [];
let allSets = [];
let kingdom = [];

async function init() {
  const res = await fetch('data/cards.json');
  const data = await res.json();
  allCards = data.cards;
  allSets = data.sets;

  renderSetCheckboxes();
  setupControls();
  generateKingdom();
  renderBasicSupply(2);
}

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
  document.getElementById('generate-btn').addEventListener('click', generateKingdom);
}

function onSettingsChange() {
  const selected = getSelectedSets();
  const maxSetsInput = document.getElementById('max-sets');
  const minPerSetInput = document.getElementById('min-per-set');

  // Keep max-sets capped at number of selected sets
  maxSetsInput.max = selected.length || 1;
  if (parseInt(maxSetsInput.value) > selected.length) {
    maxSetsInput.value = selected.length;
  }

  // Warn if constraints are unsatisfiable
  const maxSets = parseInt(maxSetsInput.value) || 1;
  const minPerSet = parseInt(minPerSetInput.value) || 1;
  const needed = maxSets * minPerSet;
  const warning = document.getElementById('constraint-warning');
  if (needed > 10) {
    warning.textContent = `Warning: ${maxSets} sets × ${minPerSet} min per set = ${needed} cards, but a kingdom only has 10. Reduce max sets or min per set.`;
    warning.hidden = false;
  } else {
    warning.hidden = true;
  }
}

function getSelectedSets() {
  return Array.from(document.querySelectorAll('#set-checkboxes input:checked')).map(cb => cb.value);
}

function getCardCount(card, players) {
  if (card.isVictory) {
    return players === 2 ? 8 : 12;
  }
  return players <= 4 ? 10 : 12;
}

function generateKingdom() {
  const selectedSetIds = getSelectedSets();
  if (selectedSetIds.length === 0) {
    showError('Select at least one set.');
    return;
  }

  const players = parseInt(document.getElementById('players').value) || 2;
  renderBasicSupply(players);
  const maxSets = Math.min(parseInt(document.getElementById('max-sets').value) || selectedSetIds.length, selectedSetIds.length);
  const minPerSet = parseInt(document.getElementById('min-per-set').value) || 1;

  if (maxSets * minPerSet > 10) {
    showError('Constraints are unsatisfiable: reduce max sets or min per set.');
    return;
  }

  // Randomly pick which sets to draw from (up to maxSets)
  const shuffledSets = shuffle([...selectedSetIds]).slice(0, maxSets);

  // Pool of cards per chosen set
  const poolBySet = {};
  shuffledSets.forEach(setId => {
    poolBySet[setId] = shuffle(allCards.filter(c => c.set === setId));
  });

  const picked = [];

  // Guarantee minimum per set
  shuffledSets.forEach(setId => {
    const toTake = Math.min(minPerSet, poolBySet[setId].length);
    const taken = poolBySet[setId].splice(0, toTake);
    picked.push(...taken);
  });

  // Fill remaining slots from the combined remaining pool
  const remaining = shuffledSets.flatMap(setId => poolBySet[setId]);
  shuffle(remaining);
  for (const card of remaining) {
    if (picked.length >= 10) break;
    picked.push(card);
  }

  kingdom = picked.slice(0, 10).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  renderKingdom(players);
  hideError();
}

function renderKingdom(players) {
  const grid = document.getElementById('kingdom-grid');
  const empty = document.getElementById('empty-state');
  grid.innerHTML = '';

  document.getElementById('kingdom-count').textContent =
    kingdom.length ? `${kingdom.length} cards · ${players} player${players !== 1 ? 's' : ''}` : '';

  if (kingdom.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  kingdom.forEach(card => {
    const count = getCardCount(card, players);
    const setInfo = allSets.find(s => s.id === card.set);
    const imgUrl = cardImageUrl(card);
    const typeClass = card.types.includes('Attack') ? 'type-attack'
      : card.types.includes('Victory') ? 'type-victory'
      : card.types.includes('Reaction') ? 'type-reaction'
      : 'type-action';

    const tile = document.createElement('div');
    tile.className = 'card-tile';
    tile.innerHTML = `
      <div class="card-image-wrap">
        <img
          src="${imgUrl}"
          alt="${card.name}"
          onerror="this.closest('.card-image-wrap').classList.add('img-error'); this.remove();"
        >
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

function cardImageUrl(card) {
  return card.image || '';
}

const BASIC_SUPPLY = [
  { name: 'Copper',   image: 'images/Copper.jpg',   types: ['Treasure'], getCount: p => 60 - 7 * p },
  { name: 'Silver',   image: 'images/Silver.jpg',   types: ['Treasure'], getCount: _p => 40 },
  { name: 'Gold',     image: 'images/Gold.jpg',     types: ['Treasure'], getCount: _p => 30 },
  { name: 'Estate',   image: 'images/Estate.jpg',   types: ['Victory'],  getCount: p => p === 2 ? 8 : 12 },
  { name: 'Duchy',    image: 'images/Duchy.jpg',    types: ['Victory'],  getCount: p => p === 2 ? 8 : 12 },
  { name: 'Province', image: 'images/Province.jpg', types: ['Victory'],  getCount: p => p === 2 ? 8 : 12 },
  { name: 'Curse',    image: 'images/Curse.jpg',    types: ['Curse'],    getCount: p => 10 * (p - 1) },
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
          <span class="card-type ${typeClass}">${card.types[0]}</span>
        </div>
        <div class="card-footer">
          <span class="card-set">Base</span>
          <span class="card-count">×${count}</span>
        </div>
      </div>
    `;
    grid.appendChild(tile);
  });
}

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

function hideError() {
  document.getElementById('error-msg').hidden = true;
}

init();
