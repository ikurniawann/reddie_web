import { buildApp } from './app.js';
import { migrate, seedAdmin, seedSettings } from './db.js';
import { ensureInitialVersion } from './content.js';
import { attachBridge } from './bridge.js';

const PORT = Number(process.env.PORT || 8080);

try {
  await migrate();
  await seedAdmin();
  await seedSettings();
  await ensureInitialVersion();
  // WebSocket menumpang server HTTP yang sama, jadi tidak ada port kedua
  // yang perlu dibuka maupun diproksikan terpisah.
  const server = buildApp().listen(PORT, () => console.log(`[reddie-api] listening on :${PORT}`));
  attachBridge(server);
} catch (e) {
  console.error('[boot] fatal:', e.message);
  process.exit(1);
}
