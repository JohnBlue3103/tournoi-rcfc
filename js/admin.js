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
  // Restaurer le tournoi sélectionné depuis la session précédente
  const saved = localStorage.getItem('admin_tid');
  const savedNom = localStorage.getItem('admin_tnom');
  if (saved) { _tid = saved; updateAdminTitle(savedNom || 'Tournoi'); }
  const savedTab = localStorage.getItem('admin_tab') || 'tournoi';
  loadTournois();
  switchAdminTab(savedTab);
}

/* ===== TABS ===== */
function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page-section').forEach(p => p.classList.add('hidden'));
  document.getElementById('atab-' + tab).classList.add('active');
  document.getElementById('panel-' + tab).classList.remove('hidden');
  localStorage.setItem('admin_tab', tab);
  if (tab === 'equipes') loadEquipes();
  if (tab === 'matchs')  loadMatchsAdmin();
  if (tab === 'phases')     loadMatchsAdmin().then(renderBracketAdmin);
  if (tab === 'classement') loadMatchsAdmin().then(renderClassementAdmin);
  if (tab === 'qr')         renderQR();
}

/* ===== TOURNOI ===== */
async function loadTournois() {
  const { data } = await sb.from('tournaments').select('*').order('created_at', { ascending: false });
  const list = document.getElementById('tournois-list');
  if (!data || !data.length) { list.innerHTML = '<p class="empty">Aucun tournoi créé.</p>'; return; }
  list.innerHTML = data.map(t => {
    const actif = _tid === t.id;
    return `
    <div class="item-row${actif ? ' item-row-actif' : ''}">
      <div style="flex:1;min-width:0">
        <div class="item-label">${actif ? '✓ ' : ''}${t.nom}</div>
        <div class="item-sub">${[t.sport, t.date, t.lieu].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="item-actions">
        ${actif
          ? `<span class="badge-actif">Sélectionné</span>`
          : `<button class="btn-secondary btn-sm" onclick="selectTournoi('${t.id}','${t.nom}')">Sélectionner</button>`}
        <button class="btn-danger btn-sm" onclick="deleteTournoi('${t.id}')">Supprimer</button>
      </div>
    </div>`;
  }).join('');
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
  localStorage.setItem('admin_tid', id);
  localStorage.setItem('admin_tnom', nom);
  updateAdminTitle(nom);
  loadTournois();
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

let _draggedEquipeId = null;

function renderEquipes() {
  const el = document.getElementById('equipes-list');
  if (!_equipes.length) { el.innerHTML = '<p class="empty">Aucune équipe.</p>'; return; }

  const byGroupe = { A: [], B: [], C: [] };
  _equipes.forEach(e => {
    const g = e.groupe || '?';
    if (!byGroupe[g]) byGroupe[g] = [];
    byGroupe[g].push(e);
  });
  const groupes = [...new Set(['A','B','C','D',...Object.keys(byGroupe)])].filter(g => byGroupe[g]);

  el.innerHTML = `<div class="pool-columns">
    ${groupes.map(g => `
      <div class="pool-col" data-groupe="${g}"
           ondragover="event.preventDefault();this.classList.add('drag-over')"
           ondragleave="this.classList.remove('drag-over')"
           ondrop="dropEquipe(event,'${g}')">
        <div class="pool-col-header">
          <span>Poule ${g}</span>
          <span class="pool-count">${byGroupe[g].length}</span>
        </div>
        ${byGroupe[g].map(e => `
          <div class="team-drag-card" draggable="true" ondragstart="dragEquipe(event,'${e.id}')">
            <span class="drag-handle">⠿</span>
            <input class="equipe-nom-input" id="enom-${e.id}" value="${e.nom.replace(/"/g,'&quot;')}" onblur="renameEquipe('${e.id}')">
            <button class="btn-danger btn-sm" onclick="deleteEquipe('${e.id}')">✕</button>
          </div>`).join('')}
      </div>`).join('')}
  </div>`;
}

function dragEquipe(event, id) {
  _draggedEquipeId = id;
  event.dataTransfer.effectAllowed = 'move';
}

async function dropEquipe(event, newGroupe) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  if (!_draggedEquipeId) return;
  const e = _equipes.find(e => e.id === _draggedEquipeId);
  _draggedEquipeId = null;
  if (!e || e.groupe === newGroupe) return;
  await sb.from('equipes').update({ groupe: newGroupe }).eq('id', e.id);
  loadEquipes();
}

async function repartirAleatoire() {
  if (!_tid || !_equipes.length) return;
  const shuffled = [..._equipes].sort(() => Math.random() - 0.5);
  const n = shuffled.length;
  const pools = ['A','B','C','D'];
  const base  = Math.floor(n / 4);
  const extra = n % 4;
  const updates = [];
  let idx = 0;
  for (let p = 0; p < 4; p++) {
    const size = base + (p < extra ? 1 : 0);
    for (let k = 0; k < size; k++) {
      updates.push({ id: shuffled[idx++].id, groupe: pools[p] });
    }
  }
  await Promise.all(updates.map(u => sb.from('equipes').update({ groupe: u.groupe }).eq('id', u.id)));
  loadEquipes();
}

async function renameEquipe(id) {
  const input = document.getElementById('enom-' + id);
  if (!input) return;
  const nom = input.value.trim();
  if (!nom) { input.value = _equipes.find(e => e.id === id)?.nom || ''; return; }
  await sb.from('equipes').update({ nom }).eq('id', id);
  await loadEquipes();
}

async function renameEquipeInline(teamId, newNom) {
  newNom = newNom.trim();
  const e = _equipes.find(e => e.id === teamId);
  if (!newNom || !e || e.nom === newNom) return;
  await sb.from('equipes').update({ nom: newNom }).eq('id', teamId);
  e.nom = newNom;
  document.querySelectorAll(`[data-eid="${teamId}"]`).forEach(el => { el.value = newNom; });
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

async function importEquipes() {
  if (!_tid) { alert('Sélectionne un tournoi d\'abord.'); return; }
  const msg  = document.getElementById('eq-import-msg');
  const raw  = document.getElementById('eq-import').value;
  const noms = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (!noms.length) { showMsg(msg, 'Aucun nom détecté.', 'error'); return; }
  const inserts = noms.map(nom => ({ tournament_id: _tid, nom }));
  const { error } = await sb.from('equipes').insert(inserts);
  if (error) { showMsg(msg, error.message, 'error'); return; }
  document.getElementById('eq-import').value = '';
  showMsg(msg, `${noms.length} équipe(s) ajoutée(s) !`, 'success');
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

let _filtreStatut = 'tous';

function setFiltreStatut(val) {
  _filtreStatut = val;
  document.querySelectorAll('.filtre-btn').forEach(b => b.classList.toggle('active', b.dataset.val === val));
  renderMatchsAdmin();
}

function renderMatchsAdmin() {
  const el    = document.getElementById('matchs-admin-list');
  const eqMap = Object.fromEntries(_equipes.map(e => [e.id, e.nom]));
  if (!_matchs.length) { el.innerHTML = '<p class="empty">Aucun match. Utilise "Générer tous les matchs" ou ajoute-en un manuellement.</p>'; return; }

  const PHASE_LABELS = { poule:'Poules', quarts:'Quarts de finale', demies:'Demi-finales', petite_finale:'Petite finale', finale:'Finale', conso_demies:'Consolante — Demi-finales', conso_petite:'Consolante — Petite finale', conso_finale:'Consolante — Finale', classement:'Matchs de classement' };
  const TERRAINS     = ['H1', 'H2', 'K1', 'K2'];
  const TOUS_ARBITRES = ['Lucie', 'Fred', 'Audelyne', 'Emmanuel', 'Damien', 'Brice'];

  const matchsFiltres = _filtreStatut === 'tous' ? _matchs : _matchs.filter(m => m.statut === _filtreStatut);

  const counts = {
    tous:      _matchs.length,
    planifie:  _matchs.filter(m => m.statut === 'planifie').length,
    en_cours:  _matchs.filter(m => m.statut === 'en_cours').length,
    termine:   _matchs.filter(m => m.statut === 'termine').length,
  };

  const filtreBar = `
    <div class="filtre-bar">
      <button class="filtre-btn${_filtreStatut==='tous'     ? ' active' : ''}" data-val="tous"     onclick="setFiltreStatut('tous')">Tous <span class="filtre-count">${counts.tous}</span></button>
      <button class="filtre-btn${_filtreStatut==='planifie' ? ' active' : ''}" data-val="planifie" onclick="setFiltreStatut('planifie')">Planifiés <span class="filtre-count">${counts.planifie}</span></button>
      <button class="filtre-btn${_filtreStatut==='en_cours' ? ' active' : ''}" data-val="en_cours" onclick="setFiltreStatut('en_cours')">En cours <span class="filtre-count">${counts.en_cours}</span></button>
      <button class="filtre-btn${_filtreStatut==='termine'  ? ' active' : ''}" data-val="termine"  onclick="setFiltreStatut('termine')">Terminés <span class="filtre-count">${counts.termine}</span></button>
    </div>`;

  const PHASE_SHORT  = { quarts:'Quarts', demies:'Demies', petite_finale:'Petite finale', finale:'Finale', conso_demies:'Conso. demies', conso_petite:'Conso. petite', conso_finale:'Conso. finale', classement:'Classement' };
  const GROUPE_COLORS = { A:'#004d98', B:'#a50044', C:'#2d7a2d', D:'#b86c00' };
  const phaseLabel   = m => m.phase === 'poule' ? `Poule ${m.groupe||'?'}` : (PHASE_SHORT[m.phase] || m.phase);
  const phaseColor   = m => m.phase === 'poule' ? (GROUPE_COLORS[m.groupe] || '#555') : '#555';

  const matchCard = m => `
    <div class="match-edit-card" id="card-${m.id}">
      <div class="match-edit-teams">
        ${m.phase === 'poule'
          ? `<input class="equipe-nom-input" data-eid="${m.equipe1_id}" value="${(eqMap[m.equipe1_id]||'?').replace(/"/g,'&quot;')}" onchange="renameEquipeInline('${m.equipe1_id}',this.value)">
             <span style="color:var(--muted);font-weight:700;margin:0 .5rem">vs</span>
             <input class="equipe-nom-input" data-eid="${m.equipe2_id}" value="${(eqMap[m.equipe2_id]||'?').replace(/"/g,'&quot;')}" onchange="renameEquipeInline('${m.equipe2_id}',this.value)">`
          : `<select id="eq1-${m.id}" style="padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;max-width:130px">
               <option value="">— Équipe 1 —</option>
               ${_equipes.map(e=>`<option value="${e.id}" ${m.equipe1_id===e.id?'selected':''}>${e.nom}</option>`).join('')}
             </select>
             <span style="color:var(--muted);font-weight:700;margin:0 .4rem">vs</span>
             <select id="eq2-${m.id}" style="padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;max-width:130px">
               <option value="">— Équipe 2 —</option>
               ${_equipes.map(e=>`<option value="${e.id}" ${m.equipe2_id===e.id?'selected':''}>${e.nom}</option>`).join('')}
             </select>`}
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
          <span style="font-size:.75rem;font-weight:700;color:${phaseColor(m)};background:${phaseColor(m)}18;border:1px solid ${phaseColor(m)}40;padding:.18rem .5rem;border-radius:5px;white-space:nowrap">${phaseLabel(m)}</span>
        </div>
        <select id="st-${m.id}" style="padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem">
          <option value="planifie" ${m.statut==='planifie'?'selected':''}>Planifié</option>
          <option value="en_cours" ${m.statut==='en_cours'?'selected':''}>En cours</option>
          <option value="termine"  ${m.statut==='termine' ?'selected':''}>Terminé</option>
        </select>
        <button class="btn-primary btn-sm" onclick="saveMatch('${m.id}')">✓ Sauvegarder</button>
        <button class="btn-danger btn-sm"  onclick="deleteMatch('${m.id}')">✕</button>
      </div>
    </div>`;

  const sorted = matchsFiltres.slice().sort((a, b) => {
    if (a.heure && b.heure) return a.heure.localeCompare(b.heure);
    if (a.heure) return -1; if (b.heure) return 1;
    return (eqMap[a.equipe1_id]||'').localeCompare(eqMap[b.equipe1_id]||'');
  });

  el.innerHTML = filtreBar + (sorted.length
    ? sorted.map(matchCard).join('')
    : '<p class="empty" style="padding:1.5rem">Aucun match pour ce filtre.</p>');
}

/* ===== BRACKET ADMIN (onglet Phases) ===== */
function renderBracketAdmin() {
  const el = document.getElementById('phases-admin-list');
  if (!el) return;

  const SECTIONS = [
    { titre: '🏆 Tableau principal', cls: 'bst-principal', phases: ['quarts','demies','petite_finale','finale'] },
    { titre: '🥉 Classement 5e-8e',  cls: 'bst-class58',   phases: ['class_demies','class_5e','class_7e'] },
    { titre: '🥈 Consolante 9e-12e', cls: 'bst-conso',     phases: ['conso_quarts','conso_demies','conso_petite','conso_finale'] },
    { titre: '🏅 Classement 13e-16e',cls: 'bst-class',     phases: ['conso_class_demies','conso_class_13','conso_class_15'] },
  ];
  const PHASE_LABELS = {
    quarts:'Quarts de finale', demies:'Demi-finales', petite_finale:'Petite finale', finale:'Finale',
    class_demies:'Demi-finales classement 5e-8e', class_5e:'Match 5e-6e place', class_7e:'Match 7e-8e place',
    conso_quarts:'Consolante — Quarts', conso_demies:'Consolante — Demi-finales', conso_petite:'Consolante — Petite finale', conso_finale:'Consolante — Finale',
    conso_class_demies:'Classement 13e-16e — Demi-finales', conso_class_13:'Match 13e-14e place', conso_class_15:'Match 15e-16e place',
    classement:'Matchs de classement',
  };
  const TERRAINS = ['H1','H2','K1','K2'];

  // Calcul heure de début recommandée : fin du dernier match de poule + 45min pause
  const pouleHeures = _matchs.filter(m => m.phase === 'poule' && m.heure).map(m => m.heure).sort();
  const debutPhasesHtml = (() => {
    if (!pouleHeures.length) return '';
    const [hh, mm] = pouleHeures[pouleHeures.length - 1].split(':').map(Number);
    const total = hh * 60 + mm + 12 + 45; // 12min match + 45min pause repas
    const h = String(Math.floor(total / 60)).padStart(2, '0');
    const m = String(total % 60).padStart(2, '0');
    return `<div style="background:#004d9812;border:1.5px solid #004d9830;border-radius:8px;padding:.6rem 1rem;margin-bottom:1rem;font-size:.88rem;color:#004d98;font-weight:600">
      🕐 Phases finales recommandées à partir de <strong>${h}:${m}</strong>
      <span style="font-weight:400;color:#555"> (dernier match de poule ${pouleHeures[pouleHeures.length-1]} + 12min + 45min pause)</span>
      <br><span style="font-weight:400;color:#555;font-size:.82rem">⏱ Durée des matchs phases finales &amp; consolante : 15 min</span>
    </div>`;
  })();

  const koMatchs = _matchs.filter(m => SECTIONS.flatMap(s => s.phases).includes(m.phase));

  if (!koMatchs.length) {
    el.innerHTML = '<p class="empty">Aucune phase finale générée. Utilise les boutons dans l\'onglet Matchs.</p>';
    return;
  }

  const eqOpts = `<option value="">— À définir —</option>` +
    _equipes.map(e => `<option value="${e.id}">${e.nom}</option>`).join('');

  el.innerHTML = debutPhasesHtml + SECTIONS.map(sec => {
    const matchsSec = koMatchs.filter(m => sec.phases.includes(m.phase));
    if (!matchsSec.length) return '';
    return `
      <p class="bracket-section-title ${sec.cls}">${sec.titre}</p>
      ${sec.phases.map(phase => {
        const matchsPhase = matchsSec.filter(m => m.phase === phase);
        if (!matchsPhase.length) return '';
        return `
          <p class="bracket-phase-title">${PHASE_LABELS[phase]}</p>
          ${matchsPhase.map((m, idx) => `
            <div class="match-edit-card" id="bcard-${m.id}">
              <div class="bracket-team-row">
                <select id="beq1-${m.id}" class="bracket-team-select">
                  ${eqOpts.replace(`value="${m.equipe1_id}"`, `value="${m.equipe1_id}" selected`)}
                </select>
                <span class="bracket-vs">vs</span>
                <select id="beq2-${m.id}" class="bracket-team-select">
                  ${eqOpts.replace(`value="${m.equipe2_id}"`, `value="${m.equipe2_id}" selected`)}
                </select>
              </div>
              <div class="match-edit-fields" style="margin-top:.5rem">
                <div style="display:flex;align-items:center;gap:.4rem">
                  <span style="font-size:.8rem;color:var(--muted)">🕐</span>
                  <input type="time" id="bh-${m.id}" value="${m.heure||''}" style="width:100px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
                </div>
                <div style="display:flex;align-items:center;gap:.4rem">
                  <span style="font-size:.8rem;color:var(--muted)">📍</span>
                  <select id="btr-${m.id}" style="padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
                    <option value="">— Terrain —</option>
                    ${TERRAINS.map(t=>`<option value="${t}" ${m.terrain===t?'selected':''}>${t}</option>`).join('')}
                  </select>
                </div>
                <div style="display:flex;align-items:center;gap:.4rem">
                  <input type="number" min="0" id="bs1-${m.id}" value="${m.score1??0}" style="width:48px;text-align:center;padding:.3rem;border:1.5px solid var(--border);border-radius:6px;font-size:1rem;font-weight:700">
                  <span style="font-weight:700;color:var(--muted)">–</span>
                  <input type="number" min="0" id="bs2-${m.id}" value="${m.score2??0}" style="width:48px;text-align:center;padding:.3rem;border:1.5px solid var(--border);border-radius:6px;font-size:1rem;font-weight:700">
                </div>
                <select id="bst-${m.id}" style="padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem">
                  <option value="planifie" ${m.statut==='planifie'?'selected':''}>Planifié</option>
                  <option value="en_cours" ${m.statut==='en_cours'?'selected':''}>En cours</option>
                  <option value="termine"  ${m.statut==='termine' ?'selected':''}>Terminé</option>
                </select>
                <button class="btn-primary btn-sm" onclick="saveBracketMatch('${m.id}')">✓ Sauvegarder</button>
              </div>
            </div>`).join('')}`;
      }).join('')}`;
  }).join('');
}

async function saveBracketMatch(id) {
  const eq1    = document.getElementById('beq1-' + id)?.value || null;
  const eq2    = document.getElementById('beq2-' + id)?.value || null;
  const heure  = document.getElementById('bh-'   + id)?.value || null;
  const terrain= document.getElementById('btr-'  + id)?.value || null;
  const score1 = parseInt(document.getElementById('bs1-' + id)?.value) || 0;
  const score2 = parseInt(document.getElementById('bs2-' + id)?.value) || 0;
  const statut = document.getElementById('bst-'  + id)?.value;
  await sb.from('matchs').update({ equipe1_id: eq1, equipe2_id: eq2, heure, terrain, score1, score2, statut }).eq('id', id);
  // Recharger puis propager le résultat dans le bracket
  await loadMatchsAdmin();
  const saved = _matchs.find(m => m.id === id);
  if (saved && saved.statut === 'termine') await propagateBracket(saved);
  loadMatchsAdmin().then(renderBracketAdmin);
}

async function propagateBracket(m) {
  const s1 = m.score1 || 0, s2 = m.score2 || 0;
  if (s1 === s2) return; // match nul : pas de propagation automatique
  const winner = s1 > s2 ? m.equipe1_id : m.equipe2_id;
  const loser  = s1 > s2 ? m.equipe2_id : m.equipe1_id;
  const byCreated = (a, b) => a.created_at.localeCompare(b.created_at);

  if (m.phase === 'quarts') {
    const quarts = _matchs.filter(q => q.phase === 'quarts').sort(byCreated);
    const idx    = quarts.findIndex(q => q.id === m.id);
    // Gagnant → demies principale
    const demies = _matchs.filter(d => d.phase === 'demies').sort(byCreated);
    const targetD = demies[Math.floor(idx / 2)];
    if (targetD) {
      const slot = idx % 2 === 0 ? { equipe1_id: winner } : { equipe2_id: winner };
      await sb.from('matchs').update(slot).eq('id', targetD.id);
    }
    // Perdant → class_demies (demi-finales 5e-8e)
    const classDemies = _matchs.filter(d => d.phase === 'class_demies').sort(byCreated);
    const targetC = classDemies[Math.floor(idx / 2)];
    if (targetC) {
      const slot = idx % 2 === 0 ? { equipe1_id: loser } : { equipe2_id: loser };
      await sb.from('matchs').update(slot).eq('id', targetC.id);
    }
  }

  if (m.phase === 'class_demies') {
    const classDemies = _matchs.filter(d => d.phase === 'class_demies').sort(byCreated);
    const idx   = classDemies.findIndex(d => d.id === m.id);
    const wSlot = idx === 0 ? { equipe1_id: winner } : { equipe2_id: winner };
    const lSlot = idx === 0 ? { equipe1_id: loser  } : { equipe2_id: loser  };
    const match5 = _matchs.find(f => f.phase === 'class_5e');
    const match7 = _matchs.find(f => f.phase === 'class_7e');
    if (match5) await sb.from('matchs').update(wSlot).eq('id', match5.id);
    if (match7) await sb.from('matchs').update(lSlot).eq('id', match7.id);
  }

  if (m.phase === 'conso_quarts') {
    const consoQ = _matchs.filter(q => q.phase === 'conso_quarts').sort(byCreated);
    const idx    = consoQ.findIndex(q => q.id === m.id);
    // Gagnant → conso_demies (9e-12e)
    const consoD = _matchs.filter(d => d.phase === 'conso_demies').sort(byCreated);
    const targetD = consoD[Math.floor(idx / 2)];
    if (targetD) {
      const slot = idx % 2 === 0 ? { equipe1_id: winner } : { equipe2_id: winner };
      await sb.from('matchs').update(slot).eq('id', targetD.id);
    }
    // Perdant → conso_class_demies (13e-16e)
    const consoCD = _matchs.filter(d => d.phase === 'conso_class_demies').sort(byCreated);
    const targetC = consoCD[Math.floor(idx / 2)];
    if (targetC) {
      const slot = idx % 2 === 0 ? { equipe1_id: loser } : { equipe2_id: loser };
      await sb.from('matchs').update(slot).eq('id', targetC.id);
    }
  }

  if (m.phase === 'conso_class_demies') {
    const consoCD = _matchs.filter(d => d.phase === 'conso_class_demies').sort(byCreated);
    const idx   = consoCD.findIndex(d => d.id === m.id);
    const wSlot = idx === 0 ? { equipe1_id: winner } : { equipe2_id: winner };
    const lSlot = idx === 0 ? { equipe1_id: loser  } : { equipe2_id: loser  };
    const m13 = _matchs.find(f => f.phase === 'conso_class_13');
    const m15 = _matchs.find(f => f.phase === 'conso_class_15');
    if (m13) await sb.from('matchs').update(wSlot).eq('id', m13.id);
    if (m15) await sb.from('matchs').update(lSlot).eq('id', m15.id);
  }

  if (m.phase === 'demies') {
    const demies = _matchs.filter(d => d.phase === 'demies').sort(byCreated);
    const idx    = demies.findIndex(d => d.id === m.id);
    const wSlot  = idx === 0 ? { equipe1_id: winner } : { equipe2_id: winner };
    const lSlot  = idx === 0 ? { equipe1_id: loser  } : { equipe2_id: loser  };
    const finale = _matchs.find(f => f.phase === 'finale');
    const petite = _matchs.find(p => p.phase === 'petite_finale');
    if (finale) await sb.from('matchs').update(wSlot).eq('id', finale.id);
    if (petite) await sb.from('matchs').update(lSlot).eq('id', petite.id);
  }
}

async function genererRencontres() {
  if (!_tid) { alert('Sélectionne un tournoi d\'abord.'); return; }
  const msg = document.getElementById('gen-msg');

  await loadMatchsAdmin();
  const groupes = [...new Set(_equipes.map(e => e.groupe).filter(Boolean))].sort();
  if (!groupes.length) { showMsg(msg, 'Aucune équipe avec poule assignée.', 'error'); return; }

  // Construire les matchs par groupe puis interleaver pour mélanger les poules dans les créneaux
  const matchsParGroupe = {};
  groupes.forEach(g => {
    matchsParGroupe[g] = [];
    const equipes = _equipes.filter(e => e.groupe === g);
    for (let i = 0; i < equipes.length; i++) {
      for (let j = i + 1; j < equipes.length; j++) {
        const dejà = _matchs.find(m =>
          m.phase === 'poule' && m.groupe === g &&
          ((m.equipe1_id === equipes[i].id && m.equipe2_id === equipes[j].id) ||
           (m.equipe1_id === equipes[j].id && m.equipe2_id === equipes[i].id))
        );
        if (!dejà) matchsParGroupe[g].push({
          tournament_id: _tid,
          equipe1_id: equipes[i].id,
          equipe2_id: equipes[j].id,
          phase: 'poule', groupe: g,
          statut: 'planifie',
        });
      }
    }
  });

  // Interleaver : 1 match de chaque poule à tour de rôle → les scheduler les regroupe par créneau
  const inserts = [];
  const maxLen = Math.max(...groupes.map(g => matchsParGroupe[g].length));
  for (let i = 0; i < maxLen; i++) {
    groupes.forEach(g => { if (matchsParGroupe[g][i]) inserts.push(matchsParGroupe[g][i]); });
  }

  if (!inserts.length) {
    showMsg(msg, 'Tous les matchs de poule existent déjà.', 'success');
    loadMatchsAdmin();
    return;
  }

  // Assigner heure / terrain / arbitre sans conflit d'équipe
  const TERRAINS  = ['H1', 'H2', 'K1', 'K2'];
  const ARBITRES  = ['Lucie', 'Fred', 'Audelyne', 'Emmanuel', 'Brice'];
  const duree     = parseInt(document.getElementById('param-duree')?.value)  || 12;
  const pauseMin  = parseInt(document.getElementById('param-pause')?.value)  || 5;
  const SLOT_MIN  = duree + pauseMin;
  const debutVal  = document.getElementById('param-debut')?.value  || '17:30';
  const toMins    = t => { const [h,m]=t.split(':'); return +h*60+ +m; };
  const toTime    = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

  // Normalise les accents pour la comparaison de noms
  const normalize  = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ORG_NOMS   = ['fc merguez', 'beltranos', 'tefoucee'];
  const orgIds     = new Set(_equipes.filter(e => ORG_NOMS.some(n => normalize(e.nom).includes(n))).map(e => e.id));

  // Équipes absentes au premier créneau (organisation) = mêmes équipes
  const skipIds    = new Set([...orgIds]);

  const PREMIER_SLOT = toMins(debutVal);
  const teamBusy    = {};

  // Pré-marquer le premier créneau pour les équipes absentes
  skipIds.forEach(id => {
    (teamBusy[id] = teamBusy[id] || new Set()).add(PREMIER_SLOT);
  });
  const isOrgMatch = m => orgIds.has(m.equipe1_id) || orgIds.has(m.equipe2_id);
  const TERRAINS_H = new Set(['H1','H2']); // terrains acceptant les équipes orga

  // Priorité 2 : accepte les matchs consécutifs si besoin pour remplir les terrains
  const remaining = [...inserts];
  let mins = PREMIER_SLOT;

  while (remaining.length > 0) {
    const slotBusy = new Set();

    for (let ti = 0; ti < TERRAINS.length && remaining.length > 0; ti++) {
      const hOnly = !TERRAINS_H.has(TERRAINS[ti]); // K1/K2 : interdit aux orga
      const free  = m => !slotBusy.has(m.equipe1_id) && !slotBusy.has(m.equipe2_id) && (!hOnly || !isOrgMatch(m));
      const rested= m => !(teamBusy[m.equipe1_id] || new Set()).has(mins) && !(teamBusy[m.equipe2_id] || new Set()).has(mins);

      // Priorité 1 : sans back-to-back + respect terrain orga
      let idx = remaining.findIndex(m => free(m) && rested(m));
      // Priorité 2 : back-to-back accepté si nécessaire
      if (idx === -1) idx = remaining.findIndex(m => free(m));
      if (idx === -1) break;

      const m = remaining.splice(idx, 1)[0];
      slotBusy.add(m.equipe1_id);
      slotBusy.add(m.equipe2_id);
      [mins, mins + SLOT_MIN].forEach(t => {
        (teamBusy[m.equipe1_id] = teamBusy[m.equipe1_id] || new Set()).add(t);
        (teamBusy[m.equipe2_id] = teamBusy[m.equipe2_id] || new Set()).add(t);
      });
      m.terrain = TERRAINS[ti];
      m.arbitre = ARBITRES[ti % ARBITRES.length];
      m.heure   = toTime(mins);
    }

    mins += SLOT_MIN;
  }

  const { error } = await sb.from('matchs').insert(inserts);
  if (error) { showMsg(msg, error.message, 'error'); return; }
  showMsg(msg, `${inserts.length} match(s) générés avec horaires à partir de 17h45 !`, 'success');
  loadMatchsAdmin();
}

async function genererPhasesFinales() {
  if (!_tid) { alert('Sélectionne un tournoi d\'abord.'); return; }
  const msg = document.getElementById('phases-msg');
  const nb  = parseInt(document.getElementById('phases-nb').value) || 8;

  const existants = _matchs.filter(m => ['quarts','demies','petite_finale','finale'].includes(m.phase));
  if (existants.length) { showMsg(msg, 'Structure déjà générée. Supprime les matchs KO d\'abord.', 'error'); return; }

  const inserts = [];
  if (nb === 8) for (let i = 0; i < 4; i++) inserts.push({ tournament_id: _tid, phase: 'quarts', statut: 'planifie' });
  for (let i = 0; i < 2; i++) inserts.push({ tournament_id: _tid, phase: 'demies', statut: 'planifie' });
  inserts.push({ tournament_id: _tid, phase: 'petite_finale', statut: 'planifie' });
  inserts.push({ tournament_id: _tid, phase: 'finale', statut: 'planifie' });

  const { error } = await sb.from('matchs').insert(inserts);
  if (error) { showMsg(msg, error.message, 'error'); return; }
  showMsg(msg, `Tableau généré (${nb} équipes) !`, 'success');
  loadMatchsAdmin();
}

async function genererConsolante() {
  if (!_tid) { alert('Sélectionne un tournoi d\'abord.'); return; }
  const msg = document.getElementById('conso-msg');
  await loadMatchsAdmin();
  const existants = _matchs.filter(m => ['conso_quarts','conso_demies','conso_petite','conso_finale','conso_class_demies','conso_class_13','conso_class_15'].includes(m.phase));
  if (existants.length) { showMsg(msg, 'Consolante déjà générée.', 'error'); return; }
  const nb = parseInt(document.getElementById('conso-nb').value) || 8;
  const inserts = [];
  if (nb === 8) {
    for (let i = 0; i < 4; i++) inserts.push({ tournament_id: _tid, phase: 'conso_quarts',       statut: 'planifie' });
    for (let i = 0; i < 2; i++) inserts.push({ tournament_id: _tid, phase: 'conso_class_demies', statut: 'planifie' });
    inserts.push({ tournament_id: _tid, phase: 'conso_class_13', statut: 'planifie' });
    inserts.push({ tournament_id: _tid, phase: 'conso_class_15', statut: 'planifie' });
  }
  if (nb >= 4) {
    for (let i = 0; i < 2; i++) inserts.push({ tournament_id: _tid, phase: 'conso_demies', statut: 'planifie' });
    inserts.push({ tournament_id: _tid, phase: 'conso_petite', statut: 'planifie' });
  }
  inserts.push({ tournament_id: _tid, phase: 'conso_finale', statut: 'planifie' });
  const { error } = await sb.from('matchs').insert(inserts);
  if (error) { showMsg(msg, error.message, 'error'); return; }
  showMsg(msg, `Consolante générée (${nb} équipes) !`, 'success');
  loadMatchsAdmin();
}

async function genererClassement5_8() {
  if (!_tid) { alert('Sélectionne un tournoi d\'abord.'); return; }
  const msg = document.getElementById('class58-msg');
  await loadMatchsAdmin();
  const existants = _matchs.filter(m => ['class_demies','class_5e','class_7e'].includes(m.phase));
  if (existants.length) { showMsg(msg, 'Classement 5e-8e déjà généré.', 'error'); return; }
  const quarts = _matchs.filter(m => m.phase === 'quarts');
  if (!quarts.length) { showMsg(msg, 'Génère d\'abord les quarts de finale.', 'error'); return; }
  const inserts = [
    { tournament_id: _tid, phase: 'class_demies', statut: 'planifie' },
    { tournament_id: _tid, phase: 'class_demies', statut: 'planifie' },
    { tournament_id: _tid, phase: 'class_5e',     statut: 'planifie' },
    { tournament_id: _tid, phase: 'class_7e',     statut: 'planifie' },
  ];
  const { error } = await sb.from('matchs').insert(inserts);
  if (error) { showMsg(msg, error.message, 'error'); return; }
  showMsg(msg, 'Classement 5e-8e généré !', 'success');
  loadMatchsAdmin();
}

async function planifierPhasesFinales() {
  if (!_tid) return;
  const msg     = document.getElementById('ko-plan-msg');
  const startVal= document.getElementById('ko-debut')?.value || '21:30';
  const toMins  = t => { const [h,m]=t.split(':'); return +h*60+ +m; };
  const toTime  = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  const TERRAINS= ['H1','H2','K1','K2'];
  const ARBITRES= ['Lucie','Fred','Audelyne','Emmanuel','Brice'];
  const SLOT    = 15 + 5; // 15 min match + 5 min entre tours

  // Ordre fixe des tours (matches simultanés sur les terrains disponibles)
  const ROUNDS = [
    ['quarts'],
    ['conso_quarts'],
    ['demies',       'class_demies'],
    ['conso_demies', 'conso_class_demies'],
    ['conso_finale', 'class_5e', 'class_7e', 'conso_class_13'],
    ['petite_finale','conso_class_15'],
    ['finale'],
  ];

  await loadMatchsAdmin();
  const byCreated = (a, b) => a.created_at.localeCompare(b.created_at);

  let mins = toMins(startVal);
  const updates = [];

  for (const phases of ROUNDS) {
    const roundMatchs = phases.flatMap(p => _matchs.filter(m => m.phase === p).sort(byCreated));
    if (!roundMatchs.length) { mins += SLOT; continue; }
    const isFinale = phases.includes('finale');
    roundMatchs.forEach((m, i) => {
      updates.push({ id: m.id, heure: toTime(mins), terrain: TERRAINS[i % TERRAINS.length], arbitre: ARBITRES[i % ARBITRES.length] });
    });
    mins += (isFinale ? 20 : 15) + 5;
  }

  if (!updates.length) { showMsg(msg, 'Aucun match de phase finale trouvé.', 'error'); return; }
  await Promise.all(updates.map(u => sb.from('matchs').update({ heure: u.heure, terrain: u.terrain, arbitre: u.arbitre }).eq('id', u.id)));
  showMsg(msg, `${updates.length} matchs planifiés à partir de ${startVal} !`, 'success');
  loadMatchsAdmin().then(renderBracketAdmin);
}

async function supprimerTousMatchs() {
  if (!_tid) return;
  if (!confirm('Supprimer TOUS les matchs de ce tournoi ?')) return;
  await sb.from('matchs').delete().eq('tournament_id', _tid);
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
  const update  = { score1, score2, statut, heure, terrain, arbitre };
  const eq1sel  = document.getElementById('eq1-' + id);
  const eq2sel  = document.getElementById('eq2-' + id);
  if (eq1sel) update.equipe1_id = eq1sel.value || null;
  if (eq2sel) update.equipe2_id = eq2sel.value || null;
  await sb.from('matchs').update(update).eq('id', id);
  await loadMatchsAdmin();
  renderClassementAdmin();
}

async function deleteMatch(id) {
  if (!confirm('Supprimer ce match ?')) return;
  await sb.from('matchs').delete().eq('id', id);
  loadMatchsAdmin();
}

/* ===== CLASSEMENT ADMIN ===== */
function renderClassementAdmin() {
  const el = document.getElementById('classement-admin-list');
  if (!el) return;

  const groupes = [...new Set(_equipes.map(e => e.groupe).filter(Boolean))].sort();
  if (!groupes.length) {
    el.innerHTML = '<p class="empty">Aucune équipe avec poule assignée.</p>';
    return;
  }

  // Section bonus filles (une valeur par équipe)
  const toutesEquipes = _equipes.filter(e => groupes.includes(e.groupe)).sort((a,b) => (a.groupe||'').localeCompare(b.groupe||'') || a.nom.localeCompare(b.nom));
  el.innerHTML = `
    <div class="bonus-admin-block">
      <p class="section-title" style="font-size:.95rem;margin-bottom:.5rem">⚥ Bonus filles — fin de phase de poules</p>
      <p style="font-size:.82rem;color:var(--muted);margin-bottom:.4rem">Le bonus est accordé <strong>uniquement si les féminines ont été présentes sur <u>tous</u> les matchs</strong> de poule.</p>
      <p style="font-size:.82rem;color:var(--muted);margin-bottom:.85rem">+1 pt = 1 fille présente sur tous les matchs · +2 pts = 2 filles · +3 pts = 3 filles</p>
      <div class="bonus-admin-grid">
        ${toutesEquipes.map(e => `
          <div class="bonus-admin-row">
            <span class="bonus-admin-nom">${e.nom} <span style="color:var(--muted);font-size:.78rem">(Poule ${e.groupe})</span></span>
            <select class="bonus-select" id="bteam-${e.id}" onchange="saveTeamBonus('${e.id}', this.value)">
              ${[0,1,2,3].map(n => `<option value="${n}" ${(e.bonus||0)===n?'selected':''}>${n === 0 ? 'Pas de bonus' : '+'+n+' pt'+(n>1?'s':'')}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>
    </div>
    <hr style="margin:1.25rem 0;border:none;border-top:1px solid var(--border)">
    ${groupes.map(g => {
      const rows = calcClassementAdmin(g);
      return `
        <div class="groupe-block">
          <p class="groupe-title">Poule ${g}</p>
          <table class="standings-table">
            <thead><tr>
              <th>Équipe</th><th>J</th><th>V</th><th>N</th><th>D</th>
              <th>BP</th><th>BC</th><th>Diff</th>
              <th title="Bonus filles">⚥</th>
              <th class="pts-col">Pts</th>
            </tr></thead>
            <tbody>
              ${rows.map((r, i) => `
                <tr class="${i < 2 ? 'qualifie' : ''}">
                  <td>${r.nom}</td>
                  <td>${r.j}</td><td>${r.v}</td><td>${r.n}</td><td>${r.d}</td>
                  <td>${r.bp}</td><td>${r.bc}</td>
                  <td>${r.bp - r.bc >= 0 ? '+' : ''}${r.bp - r.bc}</td>
                  <td style="color:var(--accent);font-weight:600">${r.bonus > 0 ? '+'+r.bonus : '—'}</td>
                  <td class="pts-col">${r.pts}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }).join('')}
    ${(() => {
      if (groupes.length >= 4) return ''; // 4 poules → top-2 suffit, pas de meilleur 3ème
      const tiers = groupes.map(g => { const rows = calcClassementAdmin(g); return rows[2] ? { ...rows[2], poule: g } : null; }).filter(Boolean);
      if (tiers.length < 2) return '';
      tiers.sort((a,b) => b.pts - a.pts || (b.bp-b.bc)-(a.bp-a.bc) || b.bp - a.bp);
      return `
        <hr style="margin:1.25rem 0;border:none;border-top:1px solid var(--border)">
        <div class="groupe-block">
          <p class="groupe-title" style="color:var(--accent)">🏅 Meilleurs 3èmes</p>
          <table class="standings-table">
            <thead><tr><th>Équipe</th><th>Poule</th><th>BP</th><th>BC</th><th>Diff</th><th class="pts-col">Pts</th></tr></thead>
            <tbody>
              ${tiers.map((r,i) => `
                <tr class="${i < 2 ? 'qualifie' : ''}">
                  <td>${r.nom}</td><td>Poule ${r.poule}</td>
                  <td>${r.bp}</td><td>${r.bc}</td>
                  <td>${r.bp-r.bc >= 0?'+':''}${r.bp-r.bc}</td>
                  <td class="pts-col">${r.pts}</td>
                </tr>`).join('')}
            </tbody>
          </table>
          <p style="font-size:.78rem;color:var(--muted);margin-top:.4rem">Les 2 premiers (en vert) rejoignent les quarts de finale.</p>
        </div>`;
    })()}`;
}

async function saveTeamBonus(equipeId, val) {
  await sb.from('equipes').update({ bonus: parseInt(val) || 0 }).eq('id', equipeId);
  await loadMatchsAdmin();
  renderClassementAdmin();
}

function calcClassementAdmin(groupe) {
  const stats = {};
  _equipes.filter(e => e.groupe === groupe).forEach(e => {
    stats[e.id] = { nom: e.nom, pts: 0, j: 0, v: 0, n: 0, d: 0, bp: 0, bc: 0, bonus: 0 };
  });
  _matchs.filter(m => m.groupe === groupe && m.statut === 'termine').forEach(m => {
    if (!stats[m.equipe1_id] || !stats[m.equipe2_id]) return;
    const s1 = m.score1 || 0, s2 = m.score2 || 0;
    stats[m.equipe1_id].j++; stats[m.equipe2_id].j++;
    stats[m.equipe1_id].bp += s1; stats[m.equipe1_id].bc += s2;
    stats[m.equipe2_id].bp += s2; stats[m.equipe2_id].bc += s1;
    if      (s1 > s2) { stats[m.equipe1_id].pts += 3; stats[m.equipe1_id].v++; stats[m.equipe2_id].d++; }
    else if (s2 > s1) { stats[m.equipe2_id].pts += 3; stats[m.equipe2_id].v++; stats[m.equipe1_id].d++; }
    else              { stats[m.equipe1_id].pts++; stats[m.equipe2_id].pts++; stats[m.equipe1_id].n++; stats[m.equipe2_id].n++; }
  });
  // Bonus filles : une valeur par équipe
  _equipes.filter(e => e.groupe === groupe).forEach(e => {
    if (stats[e.id] && e.bonus) { stats[e.id].bonus = e.bonus; stats[e.id].pts += e.bonus; }
  });
  return Object.values(stats).sort((a, b) =>
    b.pts - a.pts || (b.bp - b.bc) - (a.bp - a.bc) || b.bp - a.bp
  );
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
