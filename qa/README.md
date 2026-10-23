# QA scripts (Playwright MCP `browser_run_code_unsafe`)

Paste each file's content (a single `async (page) => {...}`) into `browser_run_code_unsafe`, one at a time, in order.
Each creates its own contexts (max 2 open at once, except 03), closes them in `finally`, saves screenshots to
`.playwright-mcp/final-<name>.png`, and returns JSON `{checks, notes, errors, pass}`. Target: the live Vercel URL. Each < ~100 s.

| File | Checks |
|---|---|
| 01-menu-standings.js | Menu, 3 game cards, Skor Tablosu opens, tabs switch, closes; desktop 1100x620 and touch 667x375 |
| 02a-bubble-classic-hostleft.js | 2P Klasik start, both in game; host tab closed, client gets "ayrıldı" toast and returns to menu (up to 30 s wait) |
| 02b-bubble-god-rain.js | 2P Tanrı: both hold Space 1 s (god charges; verify visually), then Yağmur solo 10 s |
| 03-bubble-4room-full.js | 4 contexts 480x270 join (4/4); 5th attempt (extra tab in host context, so only 4 contexts) -> "Oda dolu"; 2 joiners closed; 2P start |
| 04-bomb-solo-bots.js | ~62 s random play vs 3 bots; green "kazandı!" banner pixel heuristic; 5 screenshots (kill feed visual) |
| 05-bomb-team.js | 2 humans Takım start; host/client screenshots to compare |
| 06-war.js | AI mode: 3rd join -> "Oda dolu (en fazla 2 kişi)", both press Digit1, shared gold (visual); then 1'e 1 start |
| 07-netmeter.js | Bubble + bomb 2P, 9 s, clipped client screenshot of meter: expect "P2P" (visual) |

Limits: canvas text (banners, HUD, net meter, kill feed) cannot be read by DOM, so those are visual or heuristic.
A room code is random per run; names are fixed ("Ev", "Konuk"). Console errors from Supabase score calls may show in `errors`.
Do not run while another script is active.
