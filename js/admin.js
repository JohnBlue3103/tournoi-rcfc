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

const SUPER_ADMIN = 'john.blue3103@gmail.com';

async function showAdmin() {
  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('view-admin').classList.remove('hidden');
  const { data: { user } } = await sb.auth.getUser();
  if (user?.email !== SUPER_ADMIN) {
    document.querySelectorAll('.super-admin-only').forEach(el => el.style.display = 'none');
  }
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
  if (!_matchs.length) { el.innerHTML = '<p class="empty">Aucun match. Utilise "Générer tous les matchs" ou ajoute-en un manuellement.</p>'; return; }

  const PHASE_ORDER  = ['poule', 'quarts', 'demies', 'petite_finale', 'finale'];
  const PHASE_LABELS = { poule:'Poules', quarts:'Quarts de finale', demies:'Demi-finales', petite_finale:'Petite finale', finale:'Finale' };
  const TERRAINS     = ['Honneur 1', 'Honneur 2', 'Karben 1', 'Karben 2'];
  const TOUS_ARBITRES = ['Lucie', 'Fred', 'Audelyne', 'Emmanuel', 'Damien', 'Brice'];

  const byPhaseGroupe = {};
  _matchs.forEach(m => {
    const key = m.phase === 'poule' ? `poule_${m.groupe||'?'}` : m.phase;
    (byPhaseGroupe[key] = byPhaseGroupe[key] || []).push(m);
  });

  const sections = [];
  const groupes = [...new Set(_matchs.filter(m=>m.phase==='poule').map(m=>m.groupe||'?'))].sort();
  groupes.forEach(g => { if (byPhaseGroupe[`poule_${g}`]) sections.push({ label:`Poule ${g}`, key:`poule_${g}` }); });
  ['quarts','demies','petite_finale','finale'].forEach(p => { if (byPhaseGroupe[p]) sections.push({ label:PHASE_LABELS[p], key:p }); });

  el.innerHTML = sections.map(s => `
    <p class="groupe-title" style="margin:1rem 0 .4rem">${s.label}</p>
    ${byPhaseGroupe[s.key].map(m => `
      <div class="match-edit-card" id="card-${m.id}">
        <div class="match-edit-teams">
          <span class="item-label">${eqMap[m.equipe1_id]||'?'}</span>
          <span style="color:var(--muted);font-weight:700;margin:0 .5rem">vs</span>
          <span class="item-label">${eqMap[m.equipe2_id]||'?'}</span>
          <span class="status-badge status-${m.statut}" style="margin-left:.5rem">${m.statut.replace('_',' ')}</span>
        </div>
        <div class="match-edit-fields">
          <div style="display:flex;align-items:center;gap:.4rem">
            <span style="font-size:.8rem;color:var(--muted)">🕐</span>
            <input type="time" id="h-${m.id}" value="${m.heure||''}" style="width:100px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
          </div>
          <div style="display:flex;align-items:center;gap:.4rem">
            <span style="font-size:.8rem;color:var(--muted)">📍</span>
            <select id="tr-${m.id}" style="padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
              <option value="">— Terrain —</option>
              ${TERRAINS.map(t=>`<option value="${t}" ${m.terrain===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:.4rem">
            <input type="number" min="0" id="s1-${m.id}" value="${m.score1??0}" style="width:48px;text-align:center;padding:.3rem;border:1.5px solid var(--border);border-radius:6px;font-size:1rem;font-weight:700">
            <span style="font-weight:700;color:var(--muted)">–</span>
            <input type="number" min="0" id="s2-${m.id}" value="${m.score2??0}" style="width:48px;text-align:center;padding:.3rem;border:1.5px solid var(--border);border-radius:6px;font-size:1rem;font-weight:700">
          </div>
          <div style="display:flex;align-items:center;gap:.4rem">
            <span style="font-size:.8rem;color:var(--muted)">🟨</span>
            <select id="ar-${m.id}" style="padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
              <option value="">— Arbitre —</option>
              ${TOUS_ARBITRES.map(a=>`<option value="${a}" ${m.arbitre===a?'selected':''}>${a}</option>`).join('')}
            </select>
          </div>
          <select id="st-${m.id}" style="padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem">
            <option value="planifie" ${m.statut==='planifie'?'selected':''}>Planifié</option>
            <option value="en_cours" ${m.statut==='en_cours'?'selected':''}>En cours</option>
            <option value="termine"  ${m.statut==='termine' ?'selected':''}>Terminé</option>
          </select>
          <button class="btn-primary btn-sm" onclick="saveMatch('${m.id}')">✓ Sauvegarder</button>
          <button class="btn-danger btn-sm"  onclick="deleteMatch('${m.id}')">✕</button>
        </div>
      </div>`).join('')}
  `).join('');
}

async function genererRencontres() {
  if (!_tid) { alert('Sélectionne un tournoi d\'abord.'); return; }
  const msg     = document.getElementById('gen-msg');
  const terrain = document.getElementById('gen-terrain').value || null;

  await loadMatchsAdmin();
  const groupes = [...new Set(_equipes.map(e => e.groupe).filter(Boolean))];
  if (!groupes.length) { showMsg(msg, 'Aucune équipe avec poule assignée.', 'error'); return; }

  const inserts = [];
  groupes.forEach(g => {
    const equipes = _equipes.filter(e => e.groupe === g);
    for (let i = 0; i < equipes.length; i++) {
      for (let j = i + 1; j < equipes.length; j++) {
        const dejà = _matchs.find(m =>
          m.phase === 'poule' && m.groupe === g &&
          ((m.equipe1_id === equipes[i].id && m.equipe2_id === equipes[j].id) ||
           (m.equipe1_id === equipes[j].id && m.equipe2_id === equipes[i].id))
        );
        if (!dejà) inserts.push({
          tournament_id: _tid,
          equipe1_id: equipes[i].id,
          equipe2_id: equipes[j].id,
          phase: 'poule', groupe: g,
          terrain: terrain, statut: 'planifie',
        });
      }
    }
  });

  if (!inserts.length) { showMsg(msg, 'Tous les matchs de poule existent déjà.', 'success'); return; }
  const { error } = await sb.from('matchs').insert(inserts);
  if (error) { showMsg(msg, error.message, 'error'); return; }
  showMsg(msg, `${inserts.length} match(s) générés !`, 'success');
  loadMatchsAdmin();
}

async function supprimerTousMatchs() {
  if (!_tid) return;
  if (!confirm('Supprimer TOUS les matchs de ce tournoi ?')) return;
  await sb.from('matchs').delete().eq('tournament_id', _tid);
  loadMatchsAdmin();
}

async function planifierHoraires() {
  const msg   = document.getElementById('planning-msg');
  const debut = document.getElementById('planning-debut').value;
  if (!debut) { showMsg(msg, 'Indique une heure de début.', 'error'); return; }

  // Matchs sans heure assignée, triés par poule puis création
  const aPlanner = _matchs.filter(m => !m.heure)
    .sort((a, b) => (a.groupe||'').localeCompare(b.groupe||'') || a.created_at.localeCompare(b.created_at));

  if (!aPlanner.length) { showMsg(msg, 'Tous les matchs ont déjà un horaire.', 'success'); return; }

  // 2 terrains × 2 demi-terrains = 4 matchs simultanés, slot de 20 min
  const TERRAINS  = ['Honneur 1', 'Honneur 2', 'Karben 1', 'Karben 2'];
  const ARBITRES  = ['Lucie', 'Fred', 'Audelyne', 'Emmanuel'];
  const SLOT_MIN  = 20;

  const [hh, mm] = debut.split(':').map(Number);
  let minutesTotal = hh * 60 + mm;
  let slotIndex    = 0;

  const PAUSE_DEBUT = 20 * 60 + 30; // 20:30
  const PAUSE_FIN   = 21 * 60 + 30; // 21:30

  const updates = aPlanner.map(m => {
    // Saute la pause si on tombe dedans
    if (minutesTotal >= PAUSE_DEBUT && minutesTotal < PAUSE_FIN) {
      minutesTotal = PAUSE_FIN;
      slotIndex = Math.ceil(slotIndex / 4) * 4; // repart sur un slot propre
    }

    const terrain = TERRAINS[slotIndex % 4];
    const arbitre = ARBITRES[slotIndex % 4];
    const h   = Math.floor(minutesTotal / 60);
    const min = minutesTotal % 60;
    const heure = `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;

    slotIndex++;
    if (slotIndex % 4 === 0) minutesTotal += SLOT_MIN;

    return sb.from('matchs').update({ heure, terrain, arbitre }).eq('id', m.id);
  });

  await Promise.all(updates);
  showMsg(msg, `${aPlanner.length} match(s) planifié(s) !`, 'success');
  loadMatchsAdmin();
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

async function saveMatch(id) {
  const score1  = parseInt(document.getElementById('s1-'  + id).value) || 0;
  const score2  = parseInt(document.getElementById('s2-'  + id).value) || 0;
  const statut  = document.getElementById('st-'  + id).value;
  const heure   = document.getElementById('h-'   + id).value || null;
  const terrain = document.getElementById('tr-'  + id).value || null;
  const arbitre = document.getElementById('ar-'  + id)?.value || null;
  await sb.from('matchs').update({ score1, score2, statut, heure, terrain, arbitre }).eq('id', id);
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
