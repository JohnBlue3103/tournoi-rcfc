/* Backoffice admin */

let _tid     = null; // tournament id actif
let _equipes = [];
let _matchs  = [];

/* ===== AUTH ===== */
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pwd   = document.getElementById('login-pwd').value;
  const err   = document.getElementById('login-err');
  err.classList.add('hidden');

  const { error } = await sb.auth.signInWithPassword({ email, password: pwd });
  if (error) {
    err.textContent = 'Email ou mot de passe incorrect.';
    err.classList.remove('hidden');
    return;
  }
  showAdmin();
}

async function doLogout() {
  await sb.auth.signOut();
  document.getElementById('view-admin').classList.add('hidden');
  document.getElementById('view-login').classList.remove('hidden');
}

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) showAdmin();
}

function showAdmin() {
  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('view-admin').classList.remove('hidden');
  loadTournois();
}

/* ===== TABS ===== */
function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page-section').forEach(p => p.classList.add('hidden'));
  document.getElementById('atab-' + tab).classList.add('active');
  document.getElementById('panel-' + tab).classList.remove('hidden');
  if (tab === 'equipes') loadEquipes();
  if (tab === 'matchs')  loadMatchsAdmin();
  if (tab === 'qr')      renderQR();
}

/* ===== TOURNOI ===== */
async function loadTournois() {
  const { data } = await sb.from('tournaments').select('*').order('created_at', { ascending: false });
  const list = document.getElementById('tournois-list');
  if (!data || !data.length) { list.innerHTML = '<p class="empty">Aucun tournoi créé.</p>'; return; }
  list.innerHTML = data.map(t => `
    <div class="item-row">
      <div>
        <div class="item-label">${t.nom}</div>
        <div class="item-sub">${[t.sport, t.date, t.lieu].filter(Boolean).join(' · ')}
          ${_tid === t.id ? ' <strong style="color:var(--primary)">✓ Actif</strong>' : ''}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn-secondary btn-sm" onclick="selectTournoi('${t.id}','${t.nom}')">Sélectionner</button>
        <button class="btn-danger btn-sm" onclick="deleteTournoi('${t.id}')">Supprimer</button>
      </div>
    </div>`).join('');
}

async function saveTournoi() {
  const nom   = document.getElementById('t-nom-input').value.trim();
  const sport = document.getElementById('t-sport').value.trim();
  const date  = document.getElementById('t-date').value || null;
  const lieu  = document.getElementById('t-lieu').value.trim() || null;
  const msg   = document.getElementById('t-msg');
  if (!nom) { showMsg(msg, 'Le nom est obligatoire.', 'error'); return; }

  const payload = { nom, sport, date, lieu };
  let error;
  if (_tid) {
    ({ error } = await sb.from('tournaments').update(payload).eq('id', _tid));
  } else {
    const { data, error: e } = await sb.from('tournaments').insert(payload).select().single();
    error = e;
    if (data) { _tid = data.id; updateAdminTitle(data.nom); }
  }
  if (error) { showMsg(msg, error.message, 'error'); return; }
  showMsg(msg, 'Tournoi enregistré !', 'success');
  loadTournois();
}

function selectTournoi(id, nom) {
  _tid = id;
  updateAdminTitle(nom);
  loadTournois();
  alert(`Tournoi "${nom}" sélectionné. Passez aux onglets Équipes et Matchs.`);
}

async function deleteTournoi(id) {
  if (!confirm('Supprimer ce tournoi et toutes ses données ?')) return;
  await sb.from('tournaments').delete().eq('id', id);
  if (_tid === id) { _tid = null; updateAdminTitle('Admin Tournoi'); }
  loadTournois();
}

function updateAdminTitle(nom) {
  document.getElementById('admin-titre').textContent = nom;
}

/* ===== ÉQUIPES ===== */
async function loadEquipes() {
  if (!_tid) { document.getElementById('equipes-list').innerHTML = '<p class="empty">Sélectionne un tournoi d\'abord.</p>'; return; }
  const { data } = await sb.from('equipes').select('*').eq('tournament_id', _tid).order('groupe').order('nom');
  _equipes = data || [];
  renderEquipes();
  refreshEquipeSelects();
}

function renderEquipes() {
  const el = document.getElementById('equipes-list');
  if (!_equipes.length) { el.innerHTML = '<p class="empty">Aucune équipe.</p>'; return; }
  const byGroupe = {};
  _equipes.forEach(e => { (byGroupe[e.groupe || '?'] = byGroupe[e.groupe || '?'] || []).push(e); });
  el.innerHTML = Object.keys(byGroupe).sort().map(g => `
    <p class="groupe-title" style="margin:.75rem 0 .3rem">Poule ${g}</p>
    ${byGroupe[g].map(e => `
      <div class="item-row">
        <span class="item-label">${e.nom}</span>
        <button class="btn-danger btn-sm" onclick="deleteEquipe('${e.id}')">✕</button>
      </div>`).join('')}
  `).join('');
}

async function addEquipe() {
  if (!_tid) { alert('Sélectionne un tournoi d\'abord.'); return; }
  const nom    = document.getElementById('eq-nom').value.trim();
  const groupe = document.getElementById('eq-groupe').value.trim().toUpperCase() || null;
  const msg    = document.getElementById('eq-msg');
  if (!nom) { showMsg(msg, 'Nom obligatoire.', 'error'); return; }

  const { error } = await sb.from('equipes').insert({ tournament_id: _tid, nom, groupe });
  if (error) { showMsg(msg, error.message, 'error'); return; }
  document.getElementById('eq-nom').value = '';
  showMsg(msg, `${nom} ajouté !`, 'success');
  loadEquipes();
}

async function deleteEquipe(id) {
  await sb.from('equipes').delete().eq('id', id);
  loadEquipes();
}

function refreshEquipeSelects() {
  const opts = '<option value="">— Choisir —</option>' + _equipes.map(e => `<option value="${e.id}">${e.nom} (${e.groupe || '?'})</option>`).join('');
  document.getElementById('m-eq1').innerHTML = opts;
  document.getElementById('m-eq2').innerHTML = opts;
}

/* ===== MATCHS ===== */
async function loadMatchsAdmin() {
  if (!_tid) { document.getElementById('matchs-admin-list').innerHTML = '<p class="empty">Sélectionne un tournoi d\'abord.</p>'; return; }
  const [{ data: equipes }, { data: matchs }] = await Promise.all([
    sb.from('equipes').select('*').eq('tournament_id', _tid),
    sb.from('matchs').select('*').eq('tournament_id', _tid).order('heure'),
  ]);
  _equipes = equipes || [];
  _matchs  = matchs  || [];
  refreshEquipeSelects();
  renderMatchsAdmin();
}

function renderMatchsAdmin() {
  const el    = document.getElementById('matchs-admin-list');
  const eqMap = Object.fromEntries(_equipes.map(e => [e.id, e.nom]));
  if (!_matchs.length) { el.innerHTML = '<p class="empty">Aucun match planifié.</p>'; return; }

  const PHASE_ORDER = ['poule', 'quarts', 'demies', 'petite_finale', 'finale'];
  const PHASE_LABELS = { poule:'Poules', quarts:'Quarts', demies:'Demies', petite_finale:'Petite finale', finale:'Finale' };

  const byPhase = {};
  _matchs.forEach(m => {
    const key = m.phase;
    (byPhase[key] = byPhase[key] || []).push(m);
  });

  el.innerHTML = PHASE_ORDER.filter(p => byPhase[p]).map(phase => `
    <p class="groupe-title" style="margin:.75rem 0 .35rem">${PHASE_LABELS[phase]}</p>
    ${byPhase[phase].map(m => `
      <div class="item-row" style="flex-wrap:wrap;gap:.5rem">
        <div style="flex:1;min-width:180px">
          <div class="item-label">${eqMap[m.equipe1_id]||'?'} vs ${eqMap[m.equipe2_id]||'?'}</div>
          <div class="item-sub">${[m.heure, m.terrain, m.groupe ? 'Poule '+m.groupe : ''].filter(Boolean).join(' · ')}
            <span class="status-badge status-${m.statut}">${m.statut.replace('_',' ')}</span>
          </div>
        </div>
        <div class="score-editor">
          <input type="number" min="0" value="${m.score1 ?? 0}" id="s1-${m.id}" style="width:52px">
          <span class="score-sep">–</span>
          <input type="number" min="0" value="${m.score2 ?? 0}" id="s2-${m.id}" style="width:52px">
          <select id="st-${m.id}" style="padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem">
            <option value="planifie"  ${m.statut==='planifie'  ?'selected':''}>Planifié</option>
            <option value="en_cours"  ${m.statut==='en_cours'  ?'selected':''}>En cours</option>
            <option value="termine"   ${m.statut==='termine'   ?'selected':''}>Terminé</option>
          </select>
          <button class="btn-primary btn-sm" onclick="saveScore('${m.id}')">✓</button>
          <button class="btn-danger btn-sm"  onclick="deleteMatch('${m.id}')">✕</button>
        </div>
      </div>`).join('')}
  `).join('');
}

async function addMatch() {
  if (!_tid) { alert('Sélectionne un tournoi d\'abord.'); return; }
  const eq1    = document.getElementById('m-eq1').value;
  const eq2    = document.getElementById('m-eq2').value;
  const phase  = document.getElementById('m-phase').value;
  const groupe = document.getElementById('m-groupe').value.trim().toUpperCase() || null;
  const heure  = document.getElementById('m-heure').value || null;
  const terrain= document.getElementById('m-terrain').value.trim() || null;
  const msg    = document.getElementById('m-msg');
  if (!eq1 || !eq2)   { showMsg(msg, 'Sélectionne deux équipes.', 'error'); return; }
  if (eq1 === eq2)    { showMsg(msg, 'Les deux équipes doivent être différentes.', 'error'); return; }

  const { error } = await sb.from('matchs').insert({
    tournament_id: _tid, equipe1_id: eq1, equipe2_id: eq2,
    phase, groupe, heure, terrain, statut: 'planifie',
  });
  if (error) { showMsg(msg, error.message, 'error'); return; }
  showMsg(msg, 'Match planifié !', 'success');
  loadMatchsAdmin();
}

async function saveScore(id) {
  const score1 = parseInt(document.getElementById('s1-' + id).value) || 0;
  const score2 = parseInt(document.getElementById('s2-' + id).value) || 0;
  const statut = document.getElementById('st-' + id).value;
  await sb.from('matchs').update({ score1, score2, statut }).eq('id', id);
  loadMatchsAdmin();
}

async function deleteMatch(id) {
  if (!confirm('Supprimer ce match ?')) return;
  await sb.from('matchs').delete().eq('id', id);
  loadMatchsAdmin();
}

/* ===== QR CODE ===== */
function renderQR() {
  const warn = document.getElementById('qr-select-warn');
  const wrap = document.getElementById('qr-canvas-wrap');
  const urlEl = document.getElementById('qr-url-display');

  if (!_tid) {
    warn.classList.remove('hidden');
    wrap.innerHTML = '';
    urlEl.textContent = '';
    return;
  }
  warn.classList.add('hidden');
  const url = `${location.origin}${location.pathname.replace('admin.html','index.html')}?t=${_tid}`;
  urlEl.textContent = url;
  wrap.innerHTML = '<canvas id="qr-canvas"></canvas>';
  QRCode.toCanvas(document.getElementById('qr-canvas'), url, { width: 220, margin: 2 });
}

function downloadQR() {
  const canvas = document.getElementById('qr-canvas');
  if (!canvas) return;
  const a = document.createElement('a');
  a.download = 'qrcode-tournoi.png';
  a.href = canvas.toDataURL();
  a.click();
}

/* ===== UTILS ===== */
function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

checkSession();
