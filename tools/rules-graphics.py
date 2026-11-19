#!/usr/bin/env python3
"""Adds the pictures to site/rules/ and site/leaders/ (Chu 11/19: "as much graphics as possible").
Re-runnable: each card's number circle becomes an icon tile with a small number badge; diagrams are put
in place of <!--fig:NAME--> markers or after a given rule. Run from the repo root: python3 tools/rules-graphics.py"""
import re

S = 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"'
def svg(body, vb="0 0 48 48"):
    return f'<svg viewBox="{vb}" aria-hidden="true">{body}</svg>'

ICON = {
  # community rules
  "bike": f'<circle cx="12" cy="33" r="7" {S}/><circle cx="37" cy="33" r="7" {S}/><path d="M12 33 19 22h11l7 11M19 22l-3-6h-4M30 22l4-8h5M24 33l6-11" {S}/>',
  "private": f'<path d="M5 8h24v15H14l-6 5v-5H5z" {S}/><rect x="27" y="29" width="16" height="12" rx="2" {S}/><path d="M31 29v-4a4 4 0 0 1 8 0v4" {S}/>',
  "map": f'<path d="M5 12 17 8l13 4 13-4v28l-13 4-13-4-12 4z" {S}/><path d="M17 8v28M30 12v28" {S}/>',
  "noshare": f'<circle cx="24" cy="24" r="18" {S}/><path d="M11 11l26 26" {S}/><path d="M18 26l6-6 6 6M24 20v12" {S}/>',
  "notag": f'<path d="M7 25 25 7h15v15L22 40z" {S}/><circle cx="33" cy="15" r="2.5" fill="currentColor"/><path d="M6 6l36 36" {S}/>',
  "village": f'<path d="M5 24 15 15l10 9v16H5z" {S}/><path d="M12 40v-8h6v8" {S}/><path d="M29 38a9 9 0 0 1 16 0" {S}/><path d="M37 38l-4-6" {S}/>',
  "shield": f'<path d="M24 5l15 5v11c0 10-6 17-15 21C15 38 9 31 9 21V10z" {S}/><path d="M24 15v10M24 31v.5" {S}/>',
  "gear": f'<path d="M10 28a14 14 0 0 1 28 0v4H10z" {S}/><path d="M24 14v8M10 32h28" {S}/><path d="M30 26h8" {S}/>',
  "bell": f'<path d="M14 34V22a10 10 0 0 1 20 0v12l4 4H10z" {S}/><path d="M21 42h6M6 6l36 36" {S}/>',
  # leader rules
  "lead": f'<path d="M10 42V6l18 6-18 6" {S}/><circle cx="28" cy="34" r="3.5" fill="currentColor"/><circle cx="36" cy="38" r="3.5" fill="currentColor"/><circle cx="20" cy="38" r="3.5" fill="currentColor"/>',
  "count": f'<circle cx="10" cy="22" r="5" {S}/><circle cx="24" cy="22" r="5" {S}/><circle cx="38" cy="22" r="5" {S}/><path d="M14 36l6 6 14-12" {S}/>',
  "uturn": f'<path d="M34 42V18a10 10 0 0 0-20 0v8" {S}/><path d="M8 20l6 7 6-7" {S}/>',
  "phone": f'<rect x="12" y="4" width="22" height="40" rx="4" {S}/><path d="M20 38h6" {S}/><path d="M23 13v14M16 22l7-4 7 4M19 29l4-2 4 2" {S}/>',
  "brief": f'<circle cx="16" cy="16" r="10" {S}/><path d="M16 10v6l4 3" {S}/><path d="M4 42l13-14 8 8 7-8 12 14z" {S}/>',
  "check": f'<rect x="9" y="7" width="30" height="36" rx="3" {S}/><path d="M18 4h12v6H18z" {S}/><path d="M15 21l3 3 5-5M15 33l3 3 5-5M28 22h6M28 34h6" {S}/>',
  "sweep": f'<circle cx="8" cy="30" r="4" fill="currentColor"/><circle cx="20" cy="30" r="4" fill="currentColor"/><circle cx="32" cy="30" r="4" fill="currentColor"/><path d="M40 33V21" {S}/><path d="M36 15a6 6 0 0 1 8 0M33 11a11 11 0 0 1 14 0" {S}/>',
  "corner": f'<path d="M6 42h14V24h22" {S}/><circle cx="26" cy="34" r="5" {S}/><path d="M36 18l6 6-6 6" {S}/>',
  "record": f'<circle cx="34" cy="13" r="6" fill="#e5484d"/><path d="M5 42c6-14 14 2 20-10s10-12 10-6" {S} stroke-dasharray="1 0"/>',
  "break": f'<path d="M9 18h24v10a12 12 0 0 1-24 0z" {S}/><path d="M33 21h3a5 5 0 0 1 0 10h-4M15 6v6M21 4v8M27 6v6" {S}/>',
  "wrong": f'<path d="M6 40h12a12 12 0 0 0 12-12V8" {S}/><path d="M24 14l6-6 6 6" {S}/><path d="M30 40l12-12" {S} stroke-dasharray="3 5"/>',
  "plan": f'<path d="M24 44S10 30 10 19a14 14 0 0 1 28 0c0 11-14 25-14 25z" {S}/><rect x="18" y="16" width="12" height="9" rx="1.5" {S}/><path d="M20.5 16v-2.5a3.5 3.5 0 0 1 7 0V16" {S}/>',
  "finish": f'<path d="M9 8h12l-1 12a5 5 0 0 1-10 0zM27 8h12l-1 12a5 5 0 0 1-10 0zM15 25v13M33 25v13M10 40h10M28 40h10" {S}/>',
}

# which icon goes on which card, in page order
ORDER = {
  "site/rules/index.html": ["bike", "private", "map", "noshare", "notag"],
  "site/leaders/index.html": ["lead", "count", "uturn", "phone", "brief", "check", "sweep", "corner", "record", "break", "wrong", "plan", "finish"],
}
ROWS = ["village", "shield", "gear", "bell"]   # "please remember" rows on /rules

CSS = """
/* pictures (tools/rules-graphics.py) */
.ico { position: relative; width: 52px; height: 52px; border-radius: 12px; background: #2a2110; color: var(--accent); display: grid; place-items: center; }
.ico svg { width: 34px; height: 34px; }
.ico .n { position: absolute; top: -7px; left: -7px; min-width: 22px; height: 22px; border-radius: 11px; background: var(--accent); color: #111; font-size: 13px; font-weight: 800; display: grid; place-items: center; padding: 0 5px; }
.rule { grid-template-columns: 52px 1fr; gap: 14px; }
.row { grid-template-columns: 44px 1fr; }
.row .ico { width: 44px; height: 44px; border-radius: 10px; }
.row .ico svg { width: 28px; height: 28px; }
.fig { display: block; width: 100%; height: auto; margin: 10px 0 2px; }
.cards { display: grid; grid-template-columns: auto 1fr; gap: 10px 14px; align-items: center; }
.ycard, .rcard { width: 54px; height: 74px; border-radius: 6px; transform: rotate(-8deg); box-shadow: 0 4px 10px rgba(0,0,0,.5); }
.ycard { background: #f5c518; } .rcard { background: #e5484d; }
.cards b { font-size: 18px; } .cards small { display: block; color: var(--muted); font-size: 14px; font-weight: 600; }
.tiles4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0 4px; }
.tiles4 div { background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 10px 6px; text-align: center; font-size: 13px; font-weight: 700; line-height: 1.25; color: var(--text); }
.tiles4 div i { display: block; font-style: normal; font-size: 26px; margin-bottom: 4px; }
@media (max-width: 520px) { .tiles4 { grid-template-columns: repeat(2, 1fr); } }
"""

# diagrams (labels only use words from the rules)
T = 'font-family="system-ui,-apple-system,sans-serif" font-weight="700"'
ORDER_FIG = f'''<svg class="fig" viewBox="0 0 360 96" role="img" aria-label="Leader first, sweeping rider last, a radio each">
<path d="M18 44H342" stroke="#2a2e35" stroke-width="18" stroke-linecap="round"/>
<path d="M330 44 344 44" stroke="#f5a524" stroke-width="4" stroke-linecap="round"/><path d="M336 36l10 8-10 8" fill="none" stroke="#f5a524" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="300" cy="44" r="14" fill="#f5a524"/><text x="300" y="49" text-anchor="middle" font-size="13" fill="#111" {T}>L</text>
<circle cx="250" cy="44" r="10" fill="#9aa0a9"/><circle cx="210" cy="44" r="10" fill="#9aa0a9"/><circle cx="170" cy="44" r="10" fill="#9aa0a9"/><circle cx="130" cy="44" r="10" fill="#9aa0a9"/><circle cx="90" cy="44" r="10" fill="#9aa0a9"/>
<circle cx="40" cy="44" r="14" fill="#2f9e6e"/><text x="40" y="49" text-anchor="middle" font-size="13" fill="#fff" {T}>S</text>
<path d="M300 22a8 8 0 0 1 0-0M292 16a12 12 0 0 1 16 0M288 10a18 18 0 0 1 24 0" fill="none" stroke="#f5a524" stroke-width="2.5" stroke-linecap="round"/>
<path d="M32 16a12 12 0 0 1 16 0M28 10a18 18 0 0 1 24 0" fill="none" stroke="#2f9e6e" stroke-width="2.5" stroke-linecap="round"/>
<text x="300" y="84" text-anchor="middle" font-size="13" fill="#f5a524" {T}>Leader</text>
<text x="170" y="84" text-anchor="middle" font-size="13" fill="#9aa0a9" {T}>the group</text>
<text x="22" y="84" text-anchor="start" font-size="13" fill="#7ee2a8" {T}>Sweeping rider</text>
</svg>'''
BREAK_FIG = f'''<svg class="fig" viewBox="0 0 360 70" role="img" aria-label="Ride 1 to 2 hours, stop 15 minutes, repeat">
<rect x="4" y="18" width="130" height="22" rx="11" fill="#1f5fbf"/><text x="69" y="34" text-anchor="middle" font-size="13" fill="#fff" {T}>ride 1–2 h</text>
<rect x="140" y="18" width="40" height="22" rx="11" fill="#f5a524"/><text x="160" y="34" text-anchor="middle" font-size="12" fill="#111" {T}>15′</text>
<rect x="186" y="18" width="130" height="22" rx="11" fill="#1f5fbf"/><text x="251" y="34" text-anchor="middle" font-size="13" fill="#fff" {T}>ride 1–2 h</text>
<rect x="322" y="18" width="34" height="22" rx="11" fill="#f5a524"/><text x="339" y="34" text-anchor="middle" font-size="12" fill="#111" {T}>15′</text>
<text x="160" y="60" text-anchor="middle" font-size="12" fill="#9aa0a9" {T}>break</text><text x="339" y="60" text-anchor="middle" font-size="12" fill="#9aa0a9" {T}>break</text>
</svg>'''
CARDS_FIG = '''<div class="cards"><div class="ycard"></div><div><small>The first time</small><b>you'll get a warning</b></div><div class="rcard"></div><div><small>If it happens again</small><b>you'll be banned</b></div></div>'''
GEAR_FIG = '<div class="tiles4"><div><i>🪖</i>helmet</div><div><i>🥾</i>high boots</div><div><i>🦵</i>knee protection</div><div><i>🧤</i>gloves</div></div>'
CHECK_FIG = '<div class="tiles4"><div><i>⛽</i>100% full tank</div><div><i>💧</i>food + 3 L water</div><div><i>🏍️</i>CRF or lighter</div><div><i>🪖</i>minimum gear</div></div>'

def icon_tile(name, n=None):
    return f'<div class="ico">{svg(ICON[name])}' + (f'<span class="n">{n}</span>' if n is not None else "") + '</div>'

def apply(path):
    s = open(path).read()
    if "/* pictures (tools/rules-graphics.py) */" not in s:
        s = s.replace("</style>", CSS + "</style>")
    names = ORDER[path]
    i = 0
    def repl(m):
        nonlocal i
        n = m.group(1); name = names[i] if i < len(names) else None; i += 1
        return icon_tile(name, n) if name else m.group(0)
    s = re.sub(r'<div class="num">(\d+)</div>', repl, s)
    if path.endswith("rules/index.html"):
        # warning → ban as yellow and red cards
        s = re.sub(r'<div class="strikes">.*?</div></div></div>', CARDS_FIG, s, count=1, flags=re.S)
        j = 0
        def rrow(m):
            nonlocal j
            name = ROWS[j] if j < len(ROWS) else None; j += 1
            return f'<div class="row">{icon_tile(name)}' if name else m.group(0)
        s = re.sub(r'<div class="row"><i>[^<]*</i>', rrow, s)
        s = s.replace('gloves on every group ride.</span></div></div>', 'gloves on every group ride.</span>' + GEAR_FIG + '</div></div>', 1)
    else:
        s = s.replace('<b>Find the sweeping rider</b>', '<b>Find the sweeping rider</b>' + ORDER_FIG, 1)
        s = s.replace('<b>Take a break every 1–2 hours</b>', '<b>Take a break every 1–2 hours</b>' + BREAK_FIG, 1)
        s = s.replace('<p>Check that every rider has:</p>', '<p>Check that every rider has:</p>' + CHECK_FIG, 1)
    open(path, "w").write(s)
    print(path, "icons:", i)

for p in ORDER:
    apply(p)
