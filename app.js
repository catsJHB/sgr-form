const CORRECT_PIN     = '4560';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxy0CS-6kVqWiJUa190uSVA7VVUWQTrdD3x2W6lqCwlJvKnWJo2nMbaf6qoWVKN_UF0/exec';

const TYPES = {
  powder:           { label:'Powder (High Grade)',  unit:'kg',    pgm:true,  perUnit:false },
  low_grade_powder: { label:'Low Grade Powder',     unit:'kg',    pgm:true,  perUnit:false },
  loose_metals:     { label:'Loose Metals',         unit:'kg',    pgm:false, perUnit:false },
  full_metal_cat:   { label:'Full Metal Cat',       unit:'units', pgm:false, perUnit:true  },
  full_ceramic_cat: { label:'Full Ceramic Cat',     unit:'units', pgm:false, perUnit:true  },
  scrap_metal:      { label:'Scrap Metal',          unit:'kg',    pgm:false, perUnit:false },
};

let basket          = [];
let selectedType    = null;
let currentSupplier = '';
let transactionId   = null;
let pinEntry        = '';

function zarFmt(n) {
  return 'R\u00a0' + parseFloat(n||0).toLocaleString('en-ZA', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function updateClock() {
  const now = new Date();
  document.getElementById('clock-time').textContent = now.toLocaleTimeString('en-ZA', { hour:'2-digit', minute:'2-digit' });
  document.getElementById('clock-date').textContent = now.toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'numeric' });
}

async function fetchFX() {
  try {
    const res  = await fetch('https://api.frankfurter.app/latest?from=USD&to=ZAR,EUR');
    const data = await res.json();
    if (data && data.rates) {
      const zar = data.rates.ZAR, eur = data.rates.EUR;
      document.getElementById('r-usdzar').textContent = zar ? zar.toFixed(2) : '—';
      document.getElementById('r-eurzar').textContent = (zar && eur) ? (zar/eur).toFixed(2) : '—';
      document.getElementById('r-eurusd').textContent = eur ? (1/eur).toFixed(4) : '—';
      document.getElementById('fx-updated').textContent = 'FX ' + new Date().toLocaleTimeString('en-ZA', { hour:'2-digit', minute:'2-digit' });
    }
  } catch(e) {
    document.getElementById('fx-updated').textContent = 'FX offline';
  }
}

function pinPress(val) {
  if (val === 'del') {
    pinEntry = pinEntry.slice(0, -1);
  } else if (pinEntry.length < 4) {
    pinEntry += val;
  }
  updatePinDots();
  if (pinEntry.length === 4) checkPin();
}

function updatePinDots(state) {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('pd' + i);
    dot.className = 'pin-dot';
    if (state === 'error') dot.classList.add('error');
    else if (i < pinEntry.length) dot.classList.add('filled');
  }
}

function checkPin() {
  if (pinEntry === CORRECT_PIN) {
    document.getElementById('pinScreen').style.display = 'none';
  } else {
    updatePinDots('error');
    document.getElementById('pinError').textContent = 'INCORRECT PIN';
    setTimeout(function() {
      pinEntry = '';
      updatePinDots();
      document.getElementById('pinError').textContent = '';
    }, 900);
  }
}

function goStep(n) {
  if (n === 2 && !selectedType) return;
  if (n === 3 && !validateStep2()) return;
  document.querySelectorAll('.form-section').forEach(function(s) { s.classList.remove('visible'); });
  document.getElementById('step' + n).classList.add('visible');
  for (var i = 1; i <= 3; i++) {
    document.getElementById('dot' + i).className = 'step-dot' + (i < n ? ' done' : i === n ? ' active' : '');
  }
  if (n === 2) configureStep2();
  if (n === 3) { buildReview(); updateBasketBar(); }
  window.scrollTo({ top:0, behavior:'smooth' });
}

function configureStep2() {
  var c = TYPES[selectedType];
  document.getElementById('step2Title').textContent = c.label;
  if (currentSupplier && !document.getElementById('supplierName').value)
    document.getElementById('supplierName').value = currentSupplier;
  document.getElementById('fields-kg').style.display      = c.unit === 'kg'    ? 'block' : 'none';
  document.getElementById('fields-units').style.display   = c.unit === 'units' ? 'block' : 'none';
  document.getElementById('pgmCard').style.display        = c.pgm              ? 'block' : 'none';
  document.getElementById('perUnitDisplay').style.display = c.perUnit          ? 'block' : 'none';
  document.getElementById('perKgDisplay').style.display   = c.unit === 'kg'    ? 'block' : 'none';
}

function calcPer() {
  if (!selectedType) return;
  var c     = TYPES[selectedType];
  var price = parseFloat(document.getElementById('pricePaid').value) || 0;
  if (c.perUnit) {
    var u = parseFloat(document.getElementById('numUnits').value) || 0;
    document.getElementById('perUnitVal').textContent = u > 0 ? zarFmt(price / u) : 'R\u00a00.00';
  }
  if (c.unit === 'kg') {
    var kg = parseFloat(document.getElementById('weightKg').value) || 0;
    document.getElementById('perKgVal').textContent = kg > 0 ? zarFmt(price / kg) : 'R\u00a00.00';
  }
}

function validateStep2() {
  var c = TYPES[selectedType];
  if (!document.getElementById('purchaseDate').value ||
      !document.getElementById('supplierName').value.trim() ||
      !document.getElementById('pricePaid').value) {
    alert('Please fill in Date, Supplier, and Price paid.'); return false;
  }
  if (c.unit === 'kg' && !document.getElementById('weightKg').value) {
    alert('Please enter weight in kg.'); return false;
  }
  if (c.unit === 'units' && !document.getElementById('numUnits').value) {
    alert('Please enter number of units.'); return false;
  }
  return true;
}

function buildItem() {
  var c     = TYPES[selectedType];
  var price = parseFloat(document.getElementById('pricePaid').value) || 0;
  var kg    = c.unit === 'kg'    ? parseFloat(document.getElementById('weightKg').value) || 0 : 0;
  var units = c.unit === 'units' ? parseInt(document.getElementById('numUnits').value)   || 0 : 0;
  var catEl = document.getElementById('catCode');
  return {
    id:            Date.now(),
    time:          new Date().toLocaleTimeString('en-ZA', { hour:'2-digit', minute:'2-digit' }),
    stockType:     selectedType,
    typeLabel:     c.label,
    date:          document.getElementById('purchaseDate').value,
    supplier:      document.getElementById('supplierName').value.trim(),
    kg:            kg,
    units:         units,
    catCode:       catEl ? catEl.value || '' : '',
    price:         price,
    ptReading:     c.pgm ? (parseFloat(document.getElementById('ptReading').value) || '') : '',
    pdReading:     c.pgm ? (parseFloat(document.getElementById('pdReading').value) || '') : '',
    rhReading:     c.pgm ? (parseFloat(document.getElementById('rhReading').value) || '') : '',
    notes:         document.getElementById('notes').value.trim(),
    transactionId: null,
  };
}

function buildReview() {
  var c     = TYPES[selectedType];
  var price = parseFloat(document.getElementById('pricePaid').value) || 0;
  var rows  = [
    ['Stock Type', c.label],
    ['Date',       document.getElementById('purchaseDate').value],
    ['Supplier',   document.getElementById('supplierName').value],
  ];
  if (c.unit === 'kg') {
    var kg = document.getElementById('weightKg').value;
    rows.push(['Weight', kg + ' kg'], ['Price / kg', zarFmt(price / (parseFloat(kg) || 1))]);
  }
  if (c.unit === 'units') {
    var u = document.getElementById('numUnits').value;
    rows.push(['Units', u]);
    var code = document.getElementById('catCode').value;
    if (code) rows.push(['CAT Code', code]);
    rows.push(['Price / unit', zarFmt(price / (parseFloat(u) || 1))]);
  }
  rows.push(['Total Price', zarFmt(price)]);
  if (c.pgm) {
    var pt = document.getElementById('ptReading').value;
    var pd = document.getElementById('pdReading').value;
    var rh = document.getElementById('rhReading').value;
    if (pt) rows.push(['Pt Reading', pt + ' g']);
    if (pd) rows.push(['Pd Reading', pd + ' g']);
    if (rh) rows.push(['Rh Reading', rh + ' g']);
  }
  var notes = document.getElementById('notes').value.trim();
  if (notes) rows.push(['Notes', notes]);
  document.getElementById('reviewContent').innerHTML = rows.map(function(r) {
    return '<div class="crow"><span class="ck">' + r[0] + '</span><span class="cv">' + r[1] + '</span></div>';
  }).join('');
}

function updateBasketBar() {
  var bar = document.getElementById('basketBar');
  if (basket.length === 0) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  var total = basket.reduce(function(s, i) { return s + i.price; }, 0);
  document.getElementById('basketTotal').textContent = zarFmt(total);
  document.getElementById('basketItemCount').textContent =
    basket.length + ' item' + (basket.length > 1 ? 's' : '') + ' already in basket';
  if (document.getElementById('basketReview').style.display !== 'none') renderBasketReview();
}

function toggleBasketReview() {
  var panel  = document.getElementById('basketReview');
  var btn    = document.getElementById('viewBasketBtn');
  var isOpen = panel.style.display !== 'none';
  if (isOpen) {
    panel.style.display = 'none';
    btn.textContent = 'VIEW BASKET \u25bc';
  } else {
    renderBasketReview();
    panel.style.display = 'block';
    btn.textContent = 'HIDE BASKET \u25b2';
  }
}

function renderBasketReview() {
  var container = document.getElementById('basketReviewItems');
  if (basket.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:12px 0;">No items in basket yet.</div>';
    return;
  }
  container.innerHTML = basket.map(function(e) {
    var hasPGM = e.ptReading !== '' || e.pdReading !== '' || e.rhReading !== '';
    var qty    = e.kg > 0 ? e.kg + ' kg' : e.units > 0 ? e.units + ' units' : '';
    var pgm    = hasPGM
      ? '<div class="pgm-pills">'
        + (e.ptReading !== '' ? '<span class="ppill pt">Pt ' + e.ptReading + ' g</span>' : '')
        + (e.pdReading !== '' ? '<span class="ppill pd">Pd ' + e.pdReading + ' g</span>' : '')
        + (e.rhReading !== '' ? '<span class="ppill rh">Rh ' + e.rhReading + ' g</span>' : '')
        + '</div>' : '';
    return '<div class="tx-card" style="margin-bottom:10px;">'
      + '<div class="item-row">'
        + '<div class="item-top">'
          + '<span class="etype-badge b-' + e.stockType + '">' + e.typeLabel + '</span>'
          + '<span class="item-price">' + zarFmt(e.price) + '</span>'
        + '</div>'
        + (qty ? '<div class="drow"><span class="dkey">Quantity</span><span class="dval">' + qty + '</span></div>' : '')
        + (e.catCode ? '<div class="drow"><span class="dkey">CAT Code</span><span class="dval">' + e.catCode + '</span></div>' : '')
        + (e.kg > 0 ? '<div class="drow"><span class="dkey">Price / kg</span><span class="dval">' + zarFmt(e.price / e.kg) + '</span></div>' : '')
        + (e.units > 0 ? '<div class="drow"><span class="dkey">Price / unit</span><span class="dval">' + zarFmt(e.price / e.units) + '</span></div>' : '')
        + pgm
        + (e.notes ? '<div class="note-tag">' + e.notes + '</div>' : '')
      + '</div>'
    + '</div>';
  }).join('');
}

function addItemToBasket() {
  var item = buildItem();
  if (!transactionId) transactionId = Date.now();
  item.transactionId = transactionId;
  basket.push(item);
  currentSupplier = item.supplier;
  selectedType = null;
  document.querySelectorAll('.type-btn').forEach(function(b) { b.classList.remove('selected'); });
  document.getElementById('nextBtn1').disabled = true;
  ['weightKg','numUnits','catCode','pricePaid','ptReading','pdReading','rhReading','notes'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('.form-section').forEach(function(s) { s.classList.remove('visible'); });
  document.getElementById('step1').classList.add('visible');
  for (var i = 1; i <= 3; i++) {
    document.getElementById('dot' + i).className = 'step-dot' + (i === 1 ? ' active' : '');
  }
  window.scrollTo({ top:0, behavior:'smooth' });
}

async function closeTransaction() {
  var lastItem = buildItem();
  if (!transactionId) transactionId = Date.now();
  lastItem.transactionId = transactionId;
  basket.push(lastItem);

  var supplier  = lastItem.supplier;
  var txTotal   = basket.reduce(function(s, i) { return s + i.price; }, 0);
  var itemCount = basket.length;
  var toSend    = basket.slice();

  basket = []; transactionId = null; currentSupplier = '';

  document.getElementById('purchaseForm').style.display = 'none';
  document.getElementById('confirmScreen').classList.add('visible');
  document.getElementById('confirmSub').textContent =
    supplier + ' \u00b7 ' + itemCount + ' item' + (itemCount > 1 ? 's' : '') + ' \u00b7 ' + zarFmt(txTotal);
  document.getElementById('confirmSummaryEl').innerHTML =
    '<div class="crow"><span class="ck">Customer</span><span class="cv">' + supplier + '</span></div>' +
    '<div class="crow"><span class="ck">Items recorded</span><span class="cv">' + itemCount + '</span></div>' +
    '<div class="crow"><span class="ck">Total paid out</span><span class="cv" style="color:var(--accent)">' + zarFmt(txTotal) + '</span></div>';
  window.scrollTo({ top:0, behavior:'smooth' });

  showStatus('Saving to spreadsheet\u2026', 'sending');
  try {
    await Promise.all(toSend.map(function(item) {
      var form = new FormData();
      form.append('data', JSON.stringify(item));
      return fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body:   form,
      });
    }));
    showStatus('\u2713 Saved to spreadsheet', 'success');
  } catch(err) {
    showStatus('Connection error \u2014 tell your manager.', 'fail');
  }
}

function showStatus(msg, type) {
  var el = document.getElementById('submitStatus');
  el.textContent = msg;
  el.className   = 'submit-status ' + type;
}

function resetForm() {
  selectedType = null; basket = []; transactionId = null; currentSupplier = '';
  document.getElementById('purchaseForm').style.display = 'block';
  document.getElementById('confirmScreen').classList.remove('visible');
  document.getElementById('submitStatus').className = 'submit-status';
  document.querySelectorAll('.type-btn').forEach(function(b) { b.classList.remove('selected'); });
  document.getElementById('nextBtn1').disabled = true;
  document.getElementById('purchaseForm').reset();
  document.getElementById('purchaseDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('basketBar').style.display    = 'none';
  document.getElementById('basketReview').style.display = 'none';
  for (var i = 1; i <= 3; i++) {
    document.getElementById('dot' + i).className = 'step-dot' + (i === 1 ? ' active' : '');
  }
  document.querySelectorAll('.form-section').forEach(function(s) { s.classList.remove('visible'); });
  document.getElementById('step1').classList.add('visible');
  window.scrollTo({ top:0, behavior:'smooth' });
}

document.addEventListener('DOMContentLoaded', function() {

  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // FX rates
  fetchFX();
  setInterval(fetchFX, 5 * 60 * 1000);

  // Default date
  document.getElementById('purchaseDate').value = new Date().toISOString().split('T')[0];

  // PIN buttons
  document.querySelectorAll('.pin-btn[data-val]').forEach(function(btn) {
    btn.addEventListener('click', function() { pinPress(btn.getAttribute('data-val')); });
  });

  // Stock type buttons
  document.querySelectorAll('.type-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.type-btn').forEach(function(b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      selectedType = btn.dataset.type;
      document.getElementById('nextBtn1').disabled = false;
    });
  });

  // Navigation buttons
  document.getElementById('nextBtn1').addEventListener('click', function() { goStep(2); });
  document.getElementById('backBtn2').addEventListener('click', function() { goStep(1); });
  document.getElementById('nextBtn2').addEventListener('click', function() { goStep(3); });
  document.getElementById('editBtn3').addEventListener('click', function() { goStep(2); });
  document.getElementById('addAnotherBtn').addEventListener('click', addItemToBasket);
  document.getElementById('closeTransBtn').addEventListener('click', closeTransaction);
  document.getElementById('newCustomerBtn').addEventListener('click', resetForm);
  document.getElementById('viewBasketBtn').addEventListener('click', toggleBasketReview);

  // Live price calculations
  ['pricePaid','numUnits','weightKg'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', calcPer);
  });
});
