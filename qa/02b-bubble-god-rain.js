async (page) => {
  const URL = 'https://buble-trouble-claude.vercel.app/';
  const OUT = 'c:/Users/UVW-U/Desktop/bubtroub/.playwright-mcp/final-';
  const browser = page.context().browser();
  const res = { checks: {}, notes: [], errors: [] };
  const ck = (k, v) => { res.checks[k] = !!v; return !!v; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ctxs = [];
  const open = async (label, opts = {}, ctx = null) => {
    const c = ctx || await browser.newContext({ viewport: { width: 1100, height: 620 }, ...opts });
    if (!ctx) ctxs.push(c);
    const p = await c.newPage();
    p.on('pageerror', (e) => res.errors.push(label + ': ' + e.message.slice(0, 150)));
    p.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && res.errors.push(label + ' console: ' + m.text().slice(0, 120)));
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.getByPlaceholder('Kullanıcı adın').waitFor({ timeout: 25000 });
    return p;
  };
  const shot = (p, n, o = {}) => p.screenshot({ path: OUT + n + '.png', ...o }).catch(() => res.notes.push('shot ' + n + ' failed'));
  const closeAll = async () => { for (const c of ctxs) await c.close().catch(() => {}); };
  const dropCtx = async (c) => { await c.close().catch(() => {}); const i = ctxs.indexOf(c); if (i >= 0) ctxs.splice(i, 1); };
  const pickGame = (p, title) => p.locator('button.gcard[aria-label="' + title + '"]').click();
  const hostRoom = async (p, name, title) => {
    await p.getByPlaceholder('Kullanıcı adın').fill(name);
    await pickGame(p, title);
    await p.getByRole('button', { name: /Oda Kur/ }).click();
    await p.locator('.code-big').waitFor({ timeout: 20000 });
    return (await p.locator('.code-big').innerText()).trim();
  };
  // returns 'ok' or the error text
  const joinRoom = async (p, name, code) => {
    await p.getByPlaceholder('Kullanıcı adın').fill(name);
    await p.getByPlaceholder('KOD').fill(code);
    await p.getByRole('button', { name: 'Odaya Katıl' }).click();
    return Promise.race([
      p.locator('.code-big').waitFor({ timeout: 20000 }).then(() => 'ok'),
      p.locator('.error:not(:empty)').waitFor({ timeout: 20000 }).then(async () => (await p.locator('.error').first().innerText()).trim()),
    ]).catch(() => 'timeout');
  };
  const count = async (p) => (await p.locator('.count').innerText().catch(() => '')).trim();
  const waitCount = async (p, s, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await count(p)) === s) return true; await sleep(300); } return false; };
  const pickMode = (p, label) => p.locator('button.mode', { hasText: label }).click();
  const start = async (hp, cp) => {
    await hp.getByRole('button', { name: 'Başlat' }).click();
    const gone = async (p) => { try { await p.locator('.lobby').waitFor({ state: 'detached', timeout: 20000 }); return true; } catch { return false; } };
    const r = [await gone(hp)];
    if (cp) r.push(await gone(cp));
    await sleep(1500);
    return r.every(Boolean);
  };
  const inGame = async (p) => (await p.locator('.lobby, .menu').count()) === 0 && (await p.locator('canvas').count()) > 0;
  const hold = async (p, key, ms) => { await p.keyboard.down(key); await sleep(ms); await p.keyboard.up(key); };
  try {
    const h = await open('host');
    const c = await open('client');
    const code = await hostRoom(h, 'Ev', 'Balon Avı');
    ck('client joins', (await joinRoom(c, 'Konuk', code)) === 'ok');
    await waitCount(h, '2/4');
    await pickMode(h, 'Tanrı');
    ck('god started', await start(h, c));
    await sleep(5000);
    await shot(h, '02b-god-before-host');
    await shot(c, '02b-god-before-client');
    // whoever is god charges: both hold Space 1 s (only the god's counts), then release
    await Promise.all([hold(h, 'Space', 1000), hold(c, 'Space', 1000)]);
    await sleep(400);
    await shot(h, '02b-god-after-host');
    await shot(c, '02b-god-after-client');
    res.notes.push('LEAD: in 02b-god-after-* one view should show god cloud/charge, the other a ball');
    ck('both still in game', (await inGame(h)) && (await inGame(c)));
    await dropCtx(h.context());
    await dropCtx(c.context());
    // rain solo 10 s
    const s = await open('solo');
    await hostRoom(s, 'Solo', 'Balon Avı');
    await pickMode(s, 'Yağmur');
    ck('rain started', await start(s));
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      await hold(s, Math.random() < 0.5 ? 'ArrowLeft' : 'ArrowRight', 400);
      await s.keyboard.press('Space');
    }
    await shot(s, '02b-rain-solo');
    ck('rain still in game', await inGame(s));
  } catch (e) {
    res.fatal = String((e && e.message) || e).slice(0, 300);
  } finally {
    await closeAll();
  }
  res.pass = !res.fatal && Object.values(res.checks).every(Boolean);
  res.errors = res.errors.slice(0, 8);
  return JSON.stringify(res);
}
