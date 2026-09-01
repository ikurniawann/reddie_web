import { buildApp } from './app.js';
import { migrate, seedAdmin } from './db.js';

const PORT = Number(process.env.PORT || 8080);

try {
  await migrate();
  await seedAdmin();
  buildApp().listen(PORT, () => console.log(`[reddie-api] listening on :${PORT}`));
} catch (e) {
  console.error('[boot] fatal:', e.message);
  process.exit(1);
}
