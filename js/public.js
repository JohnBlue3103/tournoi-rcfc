/* Page publique — résultats en temps réel */

let _tournament = null;
let _equipes    = [];
let _matchs     = [];
let _realtimeCh = null;

const PHASE_LABELS = {
  poule:         'Phase de poules',
  quarts:        'Quarts de finale',
  demies:        'Demi-finales',
  petite_finale: 'Petite finale',
  finale:        'Finale',
  conso_demies:  'Consolante — Demi-finales',
  conso_petite:  'Consolante — Petite finale',
  conso_finale:  'Consolante — Finale',
  classement:    'Matchs de classement',
};

async function init() {
  const tid = new URLSearchParams(location.search).get('t');
  if (tid) await loadTournoi(tid);
  else     await showHome();
}

window.addEventListener('popstate', () => {
  const tid = new URLSearchParams(location.search).get('t');
  if (tid) loadTournoi(tid);
  else     showHome();
});

function formatDate(d) {
  if (!d) return null;
  const [y, m, j] = d.split('-');
  const mois = ['jan.','fév.','mars','avr.','mai','juin','juil.','août','sep.','oct.','nov.','déc.'];
  return `${parseInt(j)} ${mois[parseInt(m) - 1]} ${y}`;
}

/* ===== ACCUEIL ===== */

async function showHome() {
  document.getElementById('view-tournoi').classList.add('hidden');
  document.getElementById('view-home').classList.remove('hidden');

  if (_realtimeCh) { sb.removeChannel(_realtimeCh); _realtimeCh = null; }
  _tournament = null; _equipes = []; _matchs = [];

  const loading = document.getElementById('home-loading');
  const list    = document.getElementById('home-list');
  loading.classList.remove('hidden');
  list.classList.add('hidden');

  const { data: tournois } = await sb.from('tournaments')
    .select('*').order('created_at', { ascending: false });

  loading.classList.add('hidden');
  list.classList.remove('hidden');

  if (!tournois || !tournois.length) {
    list.innerHTML = '<p class="home-empty">Aucun tournoi disponible.</p>';
    return;
  }

  list.innerHTML = `
    <p class="home-section-label">Tournois</p>
    ${tournois.map(t => {
      const actif = t.statut === 'actif';
      const date  = formatDate(t.date);
      const meta  = [t.sport, t.lieu].filter(Boolean).join(' · ');
      return `
      <div class="tournoi-card${actif ? ' actif' : ''}" onclick="navigateToTournoi('${t.id}')">
        <div class="tc-top">
          <span class="tc-status">
            <span class="tc-dot ${actif ? 'tc-dot-live' : 'tc-dot-end'}"></span>
            <span>${actif ? 'En cours' : 'Terminé'}</span>
          </span>
          ${date ? `<span class="tc-date">${date}</span>` : ''}
        </div>
        <div class="tc-nom">${t.nom}</div>
        <div class="tc-bottom">
          <span class="tc-meta">${meta}</span>
          <span class="tc-cta">Voir les résultats →</span>
        </div>
      </div>`;
    }).join('')}`;
}

function navigateToTournoi(tid) {
  history.pushState(null, '', '?t=' + tid);
  loadTournoi(tid);
}

function goHome() {
  history.pushState(null, '', location.pathname);
  showHome();
}

/* ===== TOURNOI ===== */

async function loadTournoi(tid) {
  document.getElementById('view-home').classList.add('hidden');
  document.getElementById('view-tournoi').classList.remove('hidden');

  // Reset onglet sur Agenda
  switchTab('agenda');

  document.getElementById('tab-agenda').innerHTML     = '<p style="padding:2rem;text-align:center;color:#888">Chargement…</p>';
  document.getElementById('tab-classement').innerHTML = '';

  const { data: ts } = await sb.from('tournaments').select('*').eq('id', tid);
  if (!ts || !ts.length) {
    document.getElementById('tab-agenda').innerHTML = '<p class="empty">Tournoi introuvable.</p>';
    return;
  }
  _tournament = ts[0];

  const [{ data: equipes }, { data: matchs }] = await Promise.all([
    sb.from('equipes').select('*').eq('tournament_id', _tournament.id),
    sb.from('matchs').select('*').eq('tournament_id', _tournament.id).order('heure'),
  ]);
  _equipes = equipes || [];
  _matchs  = matchs  || [];

  renderHeader();
  renderAgenda();
  renderClassements();
  renderPhaseFinales();

  // Realtime
  if (_realtimeCh) sb.removeChannel(_realtimeCh);
  _realtimeCh = sb.channel('matchs-live-' + tid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matchs',
        filter: `tournament_id=eq.${_tournament.id}` },
      async () => {
        const { data } = await sb.from('matchs').select('*')
          .eq('tournament_id', _tournament.id).order('heure');
        _matchs = data || [];
        renderAgenda();
        renderClassements();
        renderPhaseFinales();
      })
    .subscribe();
}

function renderHeader() {
  document.getElementById('t-nom').textContent   = _tournament.nom;
  const parts = [_tournament.sport, _tournament.date, _tournament.lieu].filter(Boolean);
  document.getElementById('t-infos').textContent = parts.join(' · ');
  document.title = _tournament.nom;
}

function switchTab(tab) {
  document.querySelectorAll('#view-tournoi .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#view-tournoi .tab-panel').forEach(p => p.classList.add('hidden'));
  const btn = document.getElementById('tab-btn-' + tab);
  if (btn) btn.classList.add('active');
  document.getElementById('tab-' + tab).classList.remove('hidden');
}

/* ===== AGENDA ===== */

function renderAgenda() {
  const wrap  = document.getElementById('tab-agenda');
  const eqMap = Object.fromEntries(_equipes.map(e => [e.id, e.nom]));

  if (!_matchs.length) {
    wrap.innerHTML = '<p class="empty">Aucun match planifié.</p>';
    return;
  }

  const byPhase  = {};
  _matchs.forEach(m => {
    const key = m.phase + (m.groupe ? '_' + m.groupe : '');
    (byPhase[key] = byPhase[key] || []).push(m);
  });

  const sections  = [];
  const groupes   = [...new Set(_matchs.filter(m => m.phase === 'poule').map(m => m.groupe).filter(Boolean))].sort();
  const POULE_COLORS = { A: 'pt-A', B: 'pt-B', C: 'pt-C' };
  groupes.forEach(g => {
    const list = byPhase['poule_' + g] || [];
    if (list.length) sections.push({ label: `Poule ${g}`, matchs: list, cls: POULE_COLORS[g] || '' });
  });
  ['quarts','demies','petite_finale','finale','conso_demies','conso_petite','conso_finale','classement'].forEach(p => {
    const list = byPhase[p] || [];
    if (list.length) sections.push({ label: PHASE_LABELS[p], matchs: list, cls: 'pt-ko' });
  });

  wrap.innerHTML = sections.map(s => `
    <p class="phase-title ${s.cls||''}">${s.label}</p>
    ${s.matchs.map(m => renderMatchCard(m, eqMap)).join('')}
  `).join('');
}

function renderMatchCard(m, eqMap) {
  const e1        = eqMap[m.equipe1_id] || '?';
  const e2        = eqMap[m.equipe2_id] || '?';
  const isTermine = m.statut === 'termine';
  const isEnCours = m.statut === 'en_cours';
  const scoreStr  = isTermine || isEnCours ? `${m.score1 ?? 0} - ${m.score2 ?? 0}` : 'vs';
  const metaStr   = [m.heure, m.terrain, m.arbitre ? `🟨 ${m.arbitre}` : null].filter(Boolean).join(' · ');
  return `
    <div class="match-card ${m.statut}">
      <div class="team-name">${e1}</div>
      <div class="score-box">
        <div class="score-val">${scoreStr}</div>
        ${isEnCours ? '<div class="score-meta badge-en-cours">En cours</div>' : ''}
        ${metaStr   ? `<div class="score-meta">${metaStr}</div>` : ''}
      </div>
      <div class="team-name right">${e2}</div>
    </div>`;
}

/* ===== PHASES FINALES ===== */

function renderPhaseFinales() {
  const wrap  = document.getElementById('tab-phases');
  const eqMap = Object.fromEntries(_equipes.map(e => [e.id, e.nom]));

  const KO      = ['quarts', 'demies', 'petite_finale', 'finale'];
  const CONSO   = ['conso_demies', 'conso_petite', 'conso_finale'];
  const CLASS   = ['classement'];
  const allPhases = [...KO, ...CONSO, ...CLASS];
  const koMatchs = _matchs.filter(m => allPhases.includes(m.phase));

  if (!koMatchs.length) {
    wrap.innerHTML = `
      <div class="bracket-empty">
        <div class="bracket-empty-icon">🏆</div>
        <p>Les phases finales n'ont pas encore débuté.</p>
        <p class="bracket-sub">Les équipes qualifiées seront annoncées après les poules.</p>
      </div>`;
    return;
  }

  const renderSection = (phases, titre, classTitre) => {
    const matchsSection = koMatchs.filter(m => phases.includes(m.phase));
    if (!matchsSection.length) return '';
    return `
      ${titre ? `<p class="bracket-section-title ${classTitre}">${titre}</p>` : ''}
      ${phases.map(phase => {
        const matchs = matchsSection.filter(m => m.phase === phase);
        if (!matchs.length) return '';
        return `
          <div class="bracket-phase">
            <p class="bracket-phase-title">${PHASE_LABELS[phase]||phase}</p>
            ${matchs.map((m, idx) => renderBracketMatch(m, idx, eqMap)).join('')}
          </div>`;
      }).join('')}`;
  };

  wrap.innerHTML =
    renderSection(KO,    '🏆 Tableau principal', 'bst-principal') +
    renderSection(CONSO, '🥈 Consolante',         'bst-conso') +
    renderSection(CLASS, '📋 Classement',          'bst-class');
}

function renderBracketMatch(m, idx, eqMap) {
  const e1  = eqMap[m.equipe1_id] || `Équipe ${idx * 2 + 1}`;
  const e2  = eqMap[m.equipe2_id] || `Équipe ${idx * 2 + 2}`;
  const isT = m.statut === 'termine';
  const isE = m.statut === 'en_cours';
  const score = isT || isE ? `${m.score1 ?? 0} – ${m.score2 ?? 0}` : 'vs';
  const win1  = isT && (m.score1 || 0) > (m.score2 || 0);
  const win2  = isT && (m.score2 || 0) > (m.score1 || 0);
  const meta  = [m.heure, m.terrain].filter(Boolean).join(' · ');
  return `
    <div class="bracket-match ${m.statut}">
      <div class="bm-team${win1 ? ' bm-winner' : ''}">${e1}</div>
      <div class="bm-score">
        <div class="bm-score-val">${score}</div>
        ${meta ? `<div class="bm-meta">${meta}</div>` : ''}
      </div>
      <div class="bm-team right${win2 ? ' bm-winner' : ''}">${e2}</div>
    </div>`;
}

/* ===== CLASSEMENT ===== */

function renderClassements() {
  const groupes = [...new Set(_equipes.map(e => e.groupe).filter(Boolean))].sort();
  const wrap    = document.getElementById('tab-classement');

  if (!groupes.length) {
    wrap.innerHTML = '<p class="empty">Aucune équipe enregistrée.</p>';
    return;
  }

  const allRows = {};
  wrap.innerHTML = groupes.map(g => {
    const rows = calcClassement(g);
    allRows[g] = rows;
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
  }).join('') + (() => {
    const tiers = groupes.map(g => allRows[g]?.[2] ? { ...allRows[g][2], poule: g } : null).filter(Boolean);
    if (tiers.length < 2) return '';
    tiers.sort((a,b) => b.pts - a.pts || (b.bp-b.bc)-(a.bp-a.bc) || b.bp - a.bp);
    return `
      <div class="groupe-block" style="margin-top:1.25rem">
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
      </div>`;
  })();
}

function calcClassement(groupe) {
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
    else              { stats[m.equipe1_id].pts++;     stats[m.equipe2_id].pts++; stats[m.equipe1_id].n++; stats[m.equipe2_id].n++; }
  });
  // Bonus filles : une valeur par équipe, saisie en fin de tournoi
  _equipes.filter(e => e.groupe === groupe).forEach(e => {
    if (stats[e.id] && e.bonus) { stats[e.id].bonus = e.bonus; stats[e.id].pts += e.bonus; }
  });
  return Object.values(stats).sort((a, b) =>
    b.pts - a.pts || (b.bp - b.bc) - (a.bp - a.bc) || b.bp - a.bp
  );
}

init();
