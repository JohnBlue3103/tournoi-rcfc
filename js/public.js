/* Page publique — résultats en temps réel */

let _tournament = null;
let _equipes    = [];
let _matchs     = [];

const PHASE_LABELS = {
  poule:         'Phase de poules',
  quarts:        'Quarts de finale',
  demies:        'Demi-finales',
  petite_finale: 'Petite finale',
  finale:        'Finale',
};

async function init() {
  const params = new URLSearchParams(location.search);
  const tid    = params.get('t');

  let query = sb.from('tournaments').select('*');
  if (tid) query = query.eq('id', tid);
  else     query = query.eq('statut', 'actif').order('created_at', { ascending: false }).limit(1);

  const { data: ts } = await query;
  if (!ts || !ts.length) {
    document.getElementById('app-loading').textContent = 'Tournoi introuvable.';
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
  renderClassements();
  renderMatchs();

  document.getElementById('app-loading').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Temps réel : mise à jour des scores
  sb.channel('matchs-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matchs',
        filter: `tournament_id=eq.${_tournament.id}` },
      async () => {
        const { data } = await sb.from('matchs').select('*')
          .eq('tournament_id', _tournament.id).order('heure');
        _matchs = data || [];
        renderClassements();
        renderMatchs();
      })
    .subscribe();
}

function renderHeader() {
  document.getElementById('t-nom').textContent = _tournament.nom;
  const parts = [_tournament.sport, _tournament.date, _tournament.lieu].filter(Boolean);
  document.getElementById('t-infos').textContent = parts.join(' · ');
  document.title = _tournament.nom;
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  event.target.classList.add('active');
  document.getElementById('tab-' + tab).classList.remove('hidden');
}

/* ===== CLASSEMENTS PAR POULE ===== */
function renderClassements() {
  const groupes = [...new Set(_equipes.map(e => e.groupe).filter(Boolean))].sort();
  const wrap    = document.getElementById('classements-wrap');

  if (!groupes.length) {
    wrap.innerHTML = '<p class="empty">Aucune équipe enregistrée.</p>';
    return;
  }

  wrap.innerHTML = groupes.map(g => {
    const rows = calcClassement(g);
    return `
      <div class="groupe-block">
        <p class="groupe-title">Poule ${g}</p>
        <table class="standings-table">
          <thead><tr>
            <th>Équipe</th><th>J</th><th>V</th><th>N</th><th>D</th>
            <th>BP</th><th>BC</th><th>Diff</th><th class="pts-col">Pts</th>
          </tr></thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr class="${i < 2 ? 'qualifie' : ''}">
                <td>${r.nom}</td>
                <td>${r.j}</td><td>${r.v}</td><td>${r.n}</td><td>${r.d}</td>
                <td>${r.bp}</td><td>${r.bc}</td><td>${r.bp - r.bc >= 0 ? '+' : ''}${r.bp - r.bc}</td>
                <td class="pts-col">${r.pts}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }).join('');
}

function calcClassement(groupe) {
  const stats = {};
  _equipes.filter(e => e.groupe === groupe).forEach(e => {
    stats[e.id] = { nom: e.nom, pts: 0, j: 0, v: 0, n: 0, d: 0, bp: 0, bc: 0 };
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
  return Object.values(stats).sort((a, b) =>
    b.pts - a.pts || (b.bp - b.bc) - (a.bp - a.bc) || b.bp - a.bp
  );
}

/* ===== MATCHS ===== */
function renderMatchs() {
  const wrap  = document.getElementById('matchs-wrap');
  const eqMap = Object.fromEntries(_equipes.map(e => [e.id, e.nom]));

  const PHASE_ORDER = ['poule', 'quarts', 'demies', 'petite_finale', 'finale'];
  const byPhase = {};
  _matchs.forEach(m => {
    const key = m.phase + (m.groupe ? '_' + m.groupe : '');
    (byPhase[key] = byPhase[key] || []).push(m);
  });

  if (!_matchs.length) {
    wrap.innerHTML = '<p class="empty">Aucun match planifié.</p>';
    return;
  }

  const sections = [];

  // Affiche d'abord les poules par groupe, puis les phases KO dans l'ordre
  const groupes = [...new Set(_matchs.filter(m => m.phase === 'poule').map(m => m.groupe).filter(Boolean))].sort();
  groupes.forEach(g => {
    const list = byPhase['poule_' + g] || [];
    if (list.length) sections.push({ label: `Poule ${g}`, matchs: list });
  });

  ['quarts', 'demies', 'petite_finale', 'finale'].forEach(phase => {
    const list = byPhase[phase] || [];
    if (list.length) sections.push({ label: PHASE_LABELS[phase], matchs: list });
  });

  wrap.innerHTML = sections.map(s => `
    <p class="phase-title">${s.label}</p>
    ${s.matchs.map(m => {
      const e1 = eqMap[m.equipe1_id] || '?';
      const e2 = eqMap[m.equipe2_id] || '?';
      const isTermine  = m.statut === 'termine';
      const isEnCours  = m.statut === 'en_cours';
      const scoreStr   = isTermine || isEnCours ? `${m.score1 ?? 0} - ${m.score2 ?? 0}` : 'vs';
      const metaStr    = [m.heure, m.terrain, m.arbitre ? `🟨 ${m.arbitre}` : null].filter(Boolean).join(' · ');
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
    }).join('')}
  `).join('');
}

init();
