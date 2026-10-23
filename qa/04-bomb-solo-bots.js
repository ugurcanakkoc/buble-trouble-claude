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
    const p = await open('solo');
    await hostRoom(p, 'Solo', 'Bomba');
    await pickMode(p, 'Herkes tek');
    ck('started', await start(p));
    // green-banner detector ("X kazandı!" is #4be37a) in the central band of the screen
    const greenPx = async () => {
      const b = (await p.screenshot({ type: 'jpeg', quality: 60 })).toString('base64');
      return p.evaluate(async (b64) => {
        const img = new Image();
        img.src = 'data:image/jpeg;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, Math.floor(c.height * 0.35), c.width, Math.floor(c.height * 0.3)).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 75) < 25 && Math.abs(d[i + 1] - 227) < 25 && Math.abs(d[i + 2] - 122) < 25) n++;
        return n;
      }, b);
    };
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const t0 = Date.now();
    let last = 0, maxGreen = 0, shots = 0, down = null;
    while (Date.now() - t0 < 62000) {
      if (down) await p.keyboard.up(down);
      down = keys[Math.floor(Math.random() * 4)];
      await p.keyboard.down(down);
      if (Math.random() < 0.35) await p.keyboard.press('Space');
      await sleep(250);
      const el = Date.now() - t0;
      if (el - last > 3000) { last = el; maxGreen = Math.max(maxGreen, await greenPx()); }
      if (el > shots * 12000 + 6000 && shots < 5) { shots++; await shot(p, '04-bomb-solo-' + shots); }
    }
    if (down) await p.keyboard.up(down);
    res.maxGreenPx = maxGreen;
    ck('round-end banner heuristic (green px > 150)', maxGreen > 150);
    res.notes.push('Heuristic only; LEAD: inspect 04-bomb-solo-*.png for banner + kill feed. False may just mean round not ended in 60 s.');
    ck('still on canvas', await inGame(p));
  } catch (e) {
    res.fatal = String((e && e.message) || e).slice(0, 300);
  } finally {
    await closeAll();
  }
  res.pass = !res.fatal && Object.values(res.checks).every(Boolean);
  res.errors = res.errors.slice(0, 8);
  return JSON.stringify(res);
}
