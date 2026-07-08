-- Add breakthrough detection columns to news_articles
-- Populated by process.py (Claude Haiku LLM analysis)

alter table news_articles
  add column if not exists is_breakthrough boolean not null default false,
  add column if not exists breakthrough_type text check (
    breakthrough_type in ('debut', 'podium', 'record', 'title')
  );

create index if not exists news_articles_is_breakthrough_idx
  on news_articles (is_breakthrough, published_at desc)
  where is_breakthrough = true;
