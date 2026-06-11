-- À coller dans l'éditeur SQL de Supabase

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  date date,
  lieu text,
  sport text default 'Football',
  statut text default 'actif',
  created_at timestamptz default now()
);

create table equipes (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade,
  nom text not null,
  groupe text,
  bonus int default 0,
  created_at timestamptz default now()
);
-- ALTER TABLE equipes ADD COLUMN IF NOT EXISTS bonus int DEFAULT 0;

create table matchs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade,
  equipe1_id uuid references equipes(id) on delete cascade,
  equipe2_id uuid references equipes(id) on delete cascade,
  score1 int default 0,
  score2 int default 0,
  groupe text,
  phase text not null default 'poule',
  heure text,
  terrain text,
  statut text default 'planifie',
  arbitre text,
  bonus1 int default 0,
  bonus2 int default 0,
  created_at timestamptz default now()
);

-- Si la table existe déjà (ALTER pour colonnes ajoutées après création) :
-- ALTER TABLE matchs ADD COLUMN IF NOT EXISTS arbitre text;
-- ALTER TABLE matchs ADD COLUMN IF NOT EXISTS bonus1 int DEFAULT 0;
-- ALTER TABLE matchs ADD COLUMN IF NOT EXISTS bonus2 int DEFAULT 0;

-- Lecture publique
alter table tournaments enable row level security;
alter table equipes enable row level security;
alter table matchs enable row level security;

create policy "public read tournaments" on tournaments for select using (true);
create policy "public read equipes"     on equipes     for select using (true);
create policy "public read matchs"      on matchs      for select using (true);

create policy "auth write tournaments" on tournaments for all using (auth.role() = 'authenticated');
create policy "auth write equipes"     on equipes     for all using (auth.role() = 'authenticated');
create policy "auth write matchs"      on matchs      for all using (auth.role() = 'authenticated');
