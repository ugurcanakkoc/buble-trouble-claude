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
    for (const [tag, opts] of [['desk', { viewport: { width: 1100, height: 620 } }], ['touch', { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true }]]) {
      const c = await browser.newContext(opts);
      ctxs.push(c);
      const p = await open(tag, {}, c);
      ck(tag + ' title', await p.getByText('Oyun Gecesi').first().isVisible());
      ck(tag + ' 3 game cards', (await p.locator('button.gcard:not(.soon)').count()) === 3);
      for (const g of ['Balon Avı', 'Çağlar Savaşı', 'Bomba']) {
        await pickGame(p, g);
        ck(tag + ' create btn shows ' + g, (await p.getByRole('button', { name: /Oda Kur/ }).innerText()).includes(g));
      }
      await shot(p, '01-menu-' + tag);
      await p.getByRole('button', { name: /Skor Tablosu/ }).click();
      ck(tag + ' board open', await p.locator('.board .board-card').isVisible());
      const tabs = p.locator('.board .tab');
      ck(tag + ' 3 tabs', (await tabs.count()) === 3);
      for (let i = 0; i < (await tabs.count()); i++) {
        await tabs.nth(i).click();
        ck(tag + ' tab' + i + ' on', (await tabs.nth(i).getAttribute('class')).includes('on'));
        await sleep(1200);
        if (i === 0) await shot(p, '01-board-' + tag);
      }
      await p.getByRole('button', { name: 'Kapat', exact: true }).click();
      ck(tag + ' board closed', !(await p.locator('.board .board-card').isVisible()));
      await dropCtx(c);
    }
  } catch (e) {
    res.fatal = String((e && e.message) || e).slice(0, 300);
  } finally {
    await closeAll();
  }
  res.pass = !res.fatal && Object.values(res.checks).every(Boolean);
  res.errors = res.errors.slice(0, 8);
  return JSON.stringify(res);
}
