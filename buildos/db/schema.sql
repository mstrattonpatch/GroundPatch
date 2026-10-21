-- BuildOS — draft PostgreSQL schema (blueprint §8–9).
-- Mirrors src/lib/domain/types.ts. Every tenant-owned table carries org_id;
-- money is stored in cents (bigint). Not yet wired up — the prototype uses an
-- in-memory store with the same shape.

create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abn text,
  created_at timestamptz not null default now()
);

create type role as enum ('director','project_manager','site_supervisor','quality_manager','subcontractor_admin','worker');

create table users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table contractors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  legal_name text not null,
  trading_name text not null,
  abn text,
  trade text,
  created_at timestamptz not null default now()
);

create table memberships (
  user_id uuid not null references users(id),
  org_id uuid not null references organisations(id),
  project_id uuid,                       -- null = organisation-wide
  role role not null,
  contractor_id uuid references contractors(id),
  primary key (user_id, org_id, project_id)
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  code text not null,
  name text not null,
  address text,
  client text,
  type text,
  status text not null default 'construction',
  pm_id uuid references users(id),
  contract_sum_cents bigint not null default 0,   -- original; never changed by variations
  start_date date,
  pc_date date,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  project_id uuid not null references projects(id),
  building text, level text, zone text, room text
);

create table insurances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  contractor_id uuid not null references contractors(id),
  type text not null,
  expires date not null,
  verified boolean not null default false
);

create table workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  contractor_id uuid references contractors(id)
);

create type credential_status as enum ('uploaded','awaiting_verification','verified','expired','rejected','unable_to_verify');

create table credentials (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id),
  type text not null,
  number text,
  expires date,
  status credential_status not null default 'uploaded',
  verified_by uuid references users(id),
  verified_method text,
  verified_at timestamptz
);

create table inductions (
  worker_id uuid not null references workers(id),
  project_id uuid not null references projects(id),
  completed_at timestamptz not null,
  primary key (worker_id, project_id)
);

create table programme_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  project_id uuid not null references projects(id),
  name text not null,
  trade text,
  contractor_id uuid references contractors(id),
  baseline_start date, baseline_finish date,
  forecast_start date, forecast_finish date,
  actual_start date, actual_finish date,
  is_milestone boolean not null default false,
  progress smallint not null default 0 check (progress between 0 and 100),
  status text not null default 'not_started',
  cost_code text
);

create table task_dependencies (
  task_id uuid not null references programme_tasks(id),
  predecessor_id uuid not null references programme_tasks(id),
  primary key (task_id, predecessor_id)
);

create type defect_status as enum ('draft','open','assigned','rectifying','ready_for_verification','closed');

create table defects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  project_id uuid not null references projects(id),
  ref text not null,
  title text not null,
  description text,
  category text,
  location_id uuid references locations(id),
  trade text,
  contractor_id uuid references contractors(id),
  priority text not null default 'medium',
  due_date date,
  status defect_status not null default 'open',
  raised_by uuid not null references users(id),
  raised_at timestamptz not null default now(),
  rectification_note text,
  verified_by uuid references users(id),
  task_id uuid references programme_tasks(id),
  client_key uuid unique,                -- idempotent offline sync
  unique (project_id, ref)
);
create index on defects (org_id, project_id, status);

create table itps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  project_id uuid not null references projects(id),
  ref text not null,
  title text not null,
  template_id uuid,
  template_version int not null,         -- pinned: template edits don't alter active ITPs
  task_id uuid references programme_tasks(id)
);

create table itp_points (
  id uuid primary key default gen_random_uuid(),
  itp_id uuid not null references itps(id),
  seq int not null,
  name text not null,
  acceptance_check text,
  type text not null check (type in ('hold','witness','inspection','test')),
  status text not null default 'pending',
  released_by uuid references users(id),
  released_at timestamptz
);

create table swms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  project_id uuid not null references projects(id),
  ref text not null,
  title text not null,
  activity text,
  contractor_id uuid not null references contractors(id),
  version int not null,
  status text not null default 'submitted',
  high_risk_categories text[] not null default '{}'
);

create table swms_acknowledgements (
  swms_id uuid not null references swms(id),
  worker_id uuid not null references workers(id),
  acknowledged_at timestamptz not null default now(),
  primary key (swms_id, worker_id)
);

create table files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  project_id uuid references projects(id),
  storage_key text not null,             -- private bucket; served via short-lived signed URLs
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  checksum text not null,
  uploaded_by uuid not null references users(id),
  uploaded_at timestamptz not null default now(),
  scan_status text not null default 'pending'
);

create table record_files (
  file_id uuid not null references files(id),
  record_type text not null,
  record_id uuid not null,
  purpose text not null default 'photo',  -- photo | evidence | attachment
  primary key (file_id, record_type, record_id)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  project_id uuid not null references projects(id),
  number text not null,
  title text not null,
  category text,
  revision text not null,
  status text not null check (status in ('current','in_review','superseded')),
  file_id uuid references files(id),
  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now(),
  unique (project_id, number, revision)
);

create table attendance_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  project_id uuid not null references projects(id),
  worker_id uuid not null references workers(id),
  kind text not null check (kind in ('check_in','check_out')),
  at timestamptz not null,
  method text not null,
  override_reason text
);

create table budget_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  project_id uuid not null references projects(id),
  cost_code text not null,
  description text,
  original_budget_cents bigint not null,
  forecast_final_cents bigint not null,
  unique (project_id, cost_code)
);

create table variations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  project_id uuid not null references projects(id),
  ref text not null,
  title text not null,
  reason text,
  amount_cents bigint not null,
  approved_amount_cents bigint,
  time_impact_days int not null default 0,
  status text not null default 'draft',
  raised_at timestamptz not null default now(),
  approved_by uuid references users(id),
  approved_at timestamptz,
  unique (project_id, ref)
);

create table progress_claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  project_id uuid not null references projects(id),
  ref text not null,
  period_end date not null,
  due_date date not null,
  claimed_cents bigint not null,
  certified_cents bigint,
  paid_cents bigint,
  status text not null default 'draft',
  unique (project_id, ref)
);

create table diary_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  project_id uuid not null references projects(id),
  date date not null,
  weather text,
  notes text not null,
  delays text,
  author_id uuid not null references users(id),
  submitted_at timestamptz,
  amends_id uuid references diary_entries(id)   -- amendments, never overwrites
);

-- Append-only audit log. Revoke UPDATE/DELETE from the application role.
create table audit_events (
  id bigserial primary key,
  org_id uuid not null references organisations(id),
  project_id uuid references projects(id),
  record_type text not null,
  record_id uuid not null,
  action text not null,
  actor_id uuid not null references users(id),
  at timestamptz not null default now(),
  from_value text,
  to_value text,
  detail text
);
create index on audit_events (record_type, record_id);
