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
    // COMPROMISE: 4 tiny contexts (480x270) for join/lobby; the 5th attempt is a new TAB in the host context;
    // then 2 joiners are closed before a 2-player start.
    const o = { viewport: { width: 480, height: 270 } };
    const h = await open('host', o);
    const code = await hostRoom(h, 'Ev', 'Balon Avı');
    const js = [];
    for (let i = 1; i <= 3; i++) {
      const j = await open('j' + i, o);
      ck('join ' + i, (await joinRoom(j, 'K' + i, code)) === 'ok');
      js.push(j);
    }
    ck('count 4/4', await waitCount(h, '4/4'));
    await shot(h, '03-lobby-4');
    const extra = await open('fifth', o, h.context());
    const r = await joinRoom(extra, 'Besinci', code);
    ck('5th gets Oda dolu', /Oda dolu/.test(r));
    res.notes.push('5th msg: ' + r);
    await extra.close();
    await dropCtx(js[1].context());
    await dropCtx(js[2].context());
    ck('count drops to 2/4', await waitCount(h, '2/4', 25000));
    await pickMode(h, 'Klasik');
    ck('started with 2', await start(h, js[0]));
    await sleep(2000);
    await shot(h, '03-game-host');
    await shot(js[0], '03-game-client');
  } catch (e) {
    res.fatal = String((e && e.message) || e).slice(0, 300);
  } finally {
    await closeAll();
  }
  res.pass = !res.fatal && Object.values(res.checks).every(Boolean);
  res.errors = res.errors.slice(0, 8);
  return JSON.stringify(res);
}
