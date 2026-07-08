-- Add discovery_status to athletes for auto-discovery pipeline tracking.
-- pipeline auto-creates athletes from news; scout verifies via UI.

alter table athletes
  add column if not exists discovery_status text not null default 'auto_detected'
    check (discovery_status in ('manual', 'auto_detected', 'confirmed', 'rejected'));

-- Existing records were added manually, not by the pipeline
update athletes set discovery_status = 'manual';

create index if not exists athletes_discovery_status_idx on athletes (discovery_status);
