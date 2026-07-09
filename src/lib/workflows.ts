/**
 * Mapowanie workflow_id (tabela workflow_settings) → plik .github/workflows/<file>.
 * Ta sama lista jest seedowana w migracji 0008_pipeline_settings.sql.
 */
export const WORKFLOWS = [
  { id: "ingest",               file: "ingest.yml",               description: "RSS ingestion",                                schedule: "co 3h" },
  { id: "process",              file: "process.yml",              description: "LLM processing artykułów (Claude)",            schedule: "06:00 + 18:00 UTC" },
  { id: "compute",              file: "compute.yml",              description: "Talent score compute",                         schedule: "07:00 UTC daily" },
  { id: "ingest_federations",   file: "ingest_federations.yml",   description: "Federacje: PZA, PZKol, PZM (Claude), PZLA, FIS, IFSC, ISU", schedule: "05:00 UTC daily" },
  { id: "ingest_events",        file: "ingest_events.yml",        description: "Kalendarze imprez federacji",                  schedule: "pon 04:00 UTC" },
  { id: "social_discovery",     file: "social_discovery.yml",     description: "Social discovery + brand fit (Serper, Claude)", schedule: "pon 08:00 UTC" },
  { id: "instagram_enrichment", file: "instagram_enrichment.yml", description: "IG enrichment (Apify)",                        schedule: "pon 10:00 UTC" },
  { id: "backup",               file: "backup.yml",               description: "pg_dump backup",                               schedule: "niedz 03:00 UTC" },
] as const;

export type WorkflowId = (typeof WORKFLOWS)[number]["id"];

export const WORKFLOW_IDS: string[] = WORKFLOWS.map((w) => w.id);
