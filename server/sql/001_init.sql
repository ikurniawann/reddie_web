-- ============================================================
-- Reddie CMS + Chat — schema & seed awal
-- Dijalankan otomatis oleh API saat boot (idempotent via _migrations)
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agents (
  id                serial PRIMARY KEY,
  slug              text UNIQUE NOT NULL,
  name              text NOT NULL,
  image             text,
  description       text,
  system_prompt     text NOT NULL DEFAULT '',
  sort              int  NOT NULL DEFAULT 0,
  show_in_dropdown  boolean NOT NULL DEFAULT true,
  show_in_carousel  boolean NOT NULL DEFAULT false,
  enabled           boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS skills (
  id           serial PRIMARY KEY,
  slug         text UNIQUE NOT NULL,
  title        text NOT NULL,
  subtitle     text,
  description  text,
  icon         text,      -- kelas font-awesome
  color        text,      -- warna aksen tombol
  button_label text,
  sort         int NOT NULL DEFAULT 0,
  enabled      boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS ai_models (
  id         serial PRIMARY KEY,
  provider   text NOT NULL CHECK (provider IN ('anthropic','openai','deepseek','custom','echo')),
  model_id   text NOT NULL,
  label      text NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  sort       int NOT NULL DEFAULT 0,
  UNIQUE (provider, model_id)
);

CREATE TABLE IF NOT EXISTS admin_users (
  id            serial PRIMARY KEY,
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id         serial PRIMARY KEY,
  name       text,
  email      text,
  message    text,
  source     text NOT NULL DEFAULT 'contact',   -- contact | login | chat
  meta       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug text,
  model_id   text,
  ip         text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user','assistant','system')),
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages (session_id, id);

-- ===================== SEED (konten situs saat ini) =====================

INSERT INTO settings (key, value) VALUES
  ('hero',    '{"title":"REDDIE","subtitle":"The Agent Make IT Work","brand":"The AI Agent by WIT."}'),
  ('welcome', '{"badge":"Chat is Protected","title":"Welcome, Mr. Stark!","subtitle":"How can I help you today?","chips":["Suggest reply","Summarize","Extract key details","Detect sentiment","Search knowledge base","Rephrase professionally"]}'),
  ('about',   '{"label":"ABOUT","title_left":"AI AGENT","footer_left":"EXPLORE WORKSPACE","meta":["DEVELOPED BY WIT.ID","JAKARTA, INDONESIA"]}'),
  ('socials', '{"instagram":"https://instagram.com","telegram":"https://telegram.org"}'),
  ('contact', '{"title":"GET IN TOUCH","subtitle":"Let''s build the future of AI automation together."}')
ON CONFLICT (key) DO NOTHING;

INSERT INTO agents (slug, name, image, description, system_prompt, sort, show_in_dropdown, show_in_carousel) VALUES
  ('reddie',   'Reddie',   'assets/Character-Reddie.webp',
   'Reddie is the signature AI Agent developed by <strong>WIT.ID</strong>. Engineered to be the ultimate digital companion, Reddie operates as an autonomous force to streamline IT operations, automate complex workflows, and deliver comprehensive 360° technology solutions.',
   'You are Reddie, the signature AI agent of WIT.ID (Jakarta, Indonesia). You help with IT operations, workflow automation, and technology consulting. Be concise, friendly, and professional. Answer in the language the user uses (Indonesian or English). This is a public demo: politely refuse harmful requests and keep answers under 200 words.',
   1, true, true),
  ('koppie',   'Koppie',   'assets/Shadow-Koppie.webp',
   'Koppie is a specialized database and pipeline controller agent in development. Designed to streamline server synchronizations, coordinate file-system operations, and manage automated workflow hooks.',
   'You are Koppie, a database & data-pipeline specialist agent by WIT.ID. You help with SQL, schema design, ETL, and server sync topics. Be concise and technical. Answer in the user''s language. Public demo: keep answers under 200 words.',
   2, false, true),
  ('pinkie',   'Pinkie',   'assets/Shadow-Pinkie.webp',
   'Pinkie is a creative copywriter and UI template design assistant. Structured to generate content, export organized data matrices, and design responsive mockup templates dynamically.',
   'You are Pinkie, a creative copywriter & UI design assistant by WIT.ID. You help write marketing copy, microcopy, and design suggestions. Be warm and creative. Answer in the user''s language. Public demo: keep answers under 200 words.',
   3, false, true),
  ('primmie',  'Primmie',  'assets/Shadow-Primmie.webp',
   'Primmie is the premium developer coding agent. Engineered to run diagnostic test blocks, execute compiler pipelines, and refactor stylesheet syntax rules with extreme speed.',
   'You are Primmie, a senior software-engineering agent by WIT.ID. You help with code review, debugging, and refactoring across languages. Be precise; show short code snippets when useful. Answer in the user''s language. Public demo: keep answers under 250 words.',
   4, false, true),
  ('sunnie',   'Sunnie',   NULL, NULL,
   'You are Sunnie, a customer-support specialist agent by WIT.ID. You help draft replies, summarize tickets, and detect sentiment. Friendly and empathetic. Answer in the user''s language. Public demo: keep answers under 200 words.',
   5, true, false),
  ('shadowie', 'Shadowie', NULL, NULL,
   'You are Shadowie, a cybersecurity-awareness agent by WIT.ID. You explain security best practices at a high level. You never provide exploit code or harmful instructions. Answer in the user''s language. Public demo: keep answers under 200 words.',
   6, true, false),
  ('titanie',  'Titanie',  NULL, NULL,
   'You are Titanie, an infrastructure & DevOps agent by WIT.ID. You help with Docker, CI/CD, and server topics. Be pragmatic. Answer in the user''s language. Public demo: keep answers under 200 words.',
   7, true, false),
  ('baddie',   'Baddie',   NULL, NULL,
   'You are Baddie, a QA & testing agent by WIT.ID. You help design test cases and find edge cases. Be systematic. Answer in the user''s language. Public demo: keep answers under 200 words.',
   8, true, false),
  ('verdanie', 'Verdanie', NULL, NULL,
   'You are Verdanie, a data-analytics agent by WIT.ID. You help interpret metrics and draft reports. Be clear with numbers. Answer in the user''s language. Public demo: keep answers under 200 words.',
   9, true, false)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO skills (slug, title, subtitle, description, icon, color, button_label, sort) VALUES
  ('pdf',   'Document Generator',   'Exports discussion to PDF',
   'Compile active chat session logs and metadata context into a styled PDF summary.',
   'fa-file-pdf',   '#ef4444', 'Generate PDF Report', 1),
  ('excel', 'Spreadsheet Compiler', 'Exports variables to Excel',
   'Parse conversation values, timelines, and ticket properties into a clean spreadsheet.',
   'fa-file-excel', '#107c41', 'Export to Excel', 2),
  ('sync',  'Database Sync',        'Syncs to server cluster',
   'Commit active ticket parameters and resolved variables into your server sockets.',
   'fa-database',   '#0284c7', 'Sync Server Sockets', 3)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO ai_models (provider, model_id, label, enabled, is_default, sort) VALUES
  ('anthropic', 'claude-sonnet-5',            'Claude Sonnet 5',   true,  true,  1),
  ('anthropic', 'claude-haiku-4-5-20251001',  'Claude Haiku 4.5',  true,  false, 2),
  ('openai',    'gpt-5-mini',                 'GPT-5 Mini',        true,  false, 3),
  ('deepseek',  'deepseek-chat',              'DeepSeek Chat',     true,  false, 4),
  ('echo',      'echo-1',                     'Echo (uji tanpa API key)', false, false, 99)
ON CONFLICT (provider, model_id) DO NOTHING;
