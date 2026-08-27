/* ResBizAI migration importer.
   Detects and maps CSV exports from Restaurant365, MarginEdge, Toast and
   generic spreadsheets into ResBizAI inventory and menu records.
   Pure functions + a UI shim; no dependencies. */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- CSV */
  function parseCSV(text) {
    text = String(text || '').replace(/^\uFEFF/, '');           // strip BOM
    var rows = [], row = [], cur = '', q = false, i = 0;
    while (i < text.length) {
      var c = text[i], n = text[i + 1];
      if (q) {
        if (c === '"' && n === '"') { cur += '"'; i += 2; continue; }
        if (c === '"') { q = false; i++; continue; }
        cur += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ',') { row.push(cur); cur = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
      cur += c; i++;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }

  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function num(v) {
    if (v == null) return 0;
    var s = String(v).replace(/[$,\s]/g, '').replace(/[()]/g, '');   // (12.34) -> 12.34
    var f = parseFloat(s);
    return isFinite(f) ? f : 0;
  }
  function clean(s) { return String(s == null ? '' : s).trim(); }

  /* ------------------------------------------------------- source detect */
  // Header fingerprints, most specific first.
  var SOURCES = [
    { id: 'r365', label: 'Restaurant365',
      any: ['altid', 'itemcode', 'totcount', 'inventoryuofm', 'purchaseditem'],
      hint: 'Operations \u2192 Inventory \u2192 Items \u2192 Export' },
    { id: 'marginedge', label: 'MarginEdge',
      any: ['productname', 'reportingunit', 'lastpurchaseprice', 'countsheet', 'unitofmeasure'],
      hint: 'Inventory \u2192 Inventory Counts \u2192 Export as CSV' },
    { id: 'toast', label: 'Toast POS',
      any: ['menuname', 'menugroup', 'menuitem', 'plu', 'posname'],
      hint: 'Menus \u2192 Items database \u2192 Export' },
    { id: 'generic', label: 'Spreadsheet', any: [], hint: 'Any CSV with a name column' }
  ];

  function detect(headers) {
    var hs = headers.map(norm);
    for (var i = 0; i < SOURCES.length; i++) {
      var s = SOURCES[i];
      if (!s.any.length) continue;
      var hits = s.any.filter(function (k) { return hs.indexOf(k) >= 0; }).length;
      if (hits >= 1) return s;
    }
    return SOURCES[SOURCES.length - 1];
  }

  /* ------------------------------------------------------- column mapping */
  // Candidate header names per logical field, in priority order.
  var FIELDS = {
    name:  ['name', 'itemname', 'productname', 'description', 'item', 'brand', 'menuitem', 'posname', 'product'],
    unit:  ['inventoryuofm', 'uofm', 'unitofmeasure', 'unit', 'uom', 'countuofm', 'purchaseunit'],
    qty:   ['totcount', 'count', 'quantity', 'qty', 'onhand', 'oh', 'currentquantity', 'casecount'],
    cost:  ['cost', 'unitcost', 'costperunit', 'lastpurchaseprice', 'price', 'itemcost', 'avgcost', 'unitprice'],
    cat:   ['category', 'itemcategory', 'gcategory', 'glaccount', 'reportingcategory', 'menugroup', 'group', 'family', 'class'],
    price: ['price', 'menuprice', 'saleprice', 'basePrice', 'baseprice'],
    par:   ['par', 'parlevel', 'parvalue', 'minqty', 'minimum']
  };

  function mapColumns(headers) {
    var hs = headers.map(norm), map = {};
    Object.keys(FIELDS).forEach(function (f) {
      for (var i = 0; i < FIELDS[f].length; i++) {
        var idx = hs.indexOf(norm(FIELDS[f][i]));
        if (idx >= 0) { map[f] = idx; return; }
      }
    });
    // fall back: first non-numeric column becomes the name
    if (map.name == null && headers.length) map.name = 0;
    return map;
  }

  /* ------------------------------------------------------------- analyse */
  function analyse(text) {
    var rows = parseCSV(text);
    if (rows.length < 2) return { ok: false, error: 'That file has no rows we can read. Export it again as CSV.' };
    var headers = rows[0].map(clean);
    var src = detect(headers);
    var map = mapColumns(headers);
    if (map.name == null) return { ok: false, error: 'We could not find a column of item names.' };

    // R365 exports Purchased Items and Recipes together; only stock items belong
    // in inventory, so note the Type column and split on it.
    var typeIdx = headers.map(norm).indexOf('type');
    var items = [], recipes = [], skipped = 0, seen = {};
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var nm = clean(row[map.name]);
      if (!nm || norm(nm) === 'total' || norm(nm) === 'subtotal') { skipped++; continue; }
      var k = norm(nm);
      if (seen[k]) { skipped++; continue; }              // de-dupe
      seen[k] = true;
      var rec = {
        name: nm,
        unit: map.unit != null ? (clean(row[map.unit]) || 'each') : 'each',
        qty: map.qty != null ? num(row[map.qty]) : 0,
        cost: map.cost != null ? num(row[map.cost]) : 0,
        cat: map.cat != null ? (clean(row[map.cat]) || 'Other') : 'Other',
        price: map.price != null ? num(row[map.price]) : 0,
        par: map.par != null ? num(row[map.par]) : 0
      };
      if (typeIdx >= 0 && norm(row[typeIdx]) === 'recipe') recipes.push(rec);
      else items.push(rec);
    }

    var matched = Object.keys(map).filter(function (f) { return map[f] != null; });
    return {
      ok: true, source: src, headers: headers, mapped: matched,
      unmapped: headers.filter(function (h, i) {
        return matched.every(function (f) { return map[f] !== i; });
      }),
      items: items, recipes: recipes, skipped: skipped, total: rows.length - 1
    };
  }

  /* ------------------------------------------------------------- convert */
  function toInventory(items, startId) {
    var id = startId || 1;
    return items.map(function (x) {
      return {
        id: id++, name: x.name, cat: x.cat || 'Other', unit: x.unit || 'each',
        qty: x.qty || 0, par: x.par || 0, cost: x.cost || 0,
        status: (x.par && x.qty < x.par) ? 'low' : 'ok', notes: 'Imported'
      };
    });
  }

  function toMenu(items, startId) {
    var id = startId || 1;
    return items.map(function (x) {
      return {
        id: id++, name: x.name, desc: '', cat: x.cat || 'Other',
        price: x.price || x.cost || 0, cost: 0, avail: true, recipe: []
      };
    });
  }

  window.RBImport = {
    parseCSV: parseCSV, analyse: analyse,
    toInventory: toInventory, toMenu: toMenu, SOURCES: SOURCES
  };
})();
