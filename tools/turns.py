#!/usr/bin/env python3
"""Turn alerts for ▶ Navigate (Chu 11/26: "Turn left in 200 m").

A GPX line bends on every curve, so a bend alone is not a turn. A turn = the track changes direction by 35° or
more AND the offline map (OpenStreetMap roads in site/offline/tiles, zoom 15) shows a junction there: three or
more ways leave that spot. So riders hear about the places where they could take the wrong way, not every bend.

Run on a computer after build.py (it reads docs/data/tracks.json) and after the offline map is cut:
    python3 tools/turns.py
Writes site/offline/turns.json: {"tracks": {"04": {"sig": "...", "turns": [{"km": 17.83, "dir": "L", "deg": 82, "ways": 3}, ...]}}}.
build.py puts each track's list into tracks.json as t["turns"].
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILES = os.path.join(ROOT, "site", "offline", "tiles")
OUT = os.path.join(ROOT, "site", "offline", "turns.json")
Z = 15
MIN_TURN = 35        # degrees: smaller changes are "keep going"
LOOK_M = 35          # direction in / out measured over this many metres
GROUP_M = 60         # candidates closer than this are one turn (the sharpest wins)
NEAR_M = 20          # a road this close to the turn point counts
ARM_M = 30           # how far along each road to look for its direction
ARM_MERGE = 30       # arms closer than this (degrees) are the same way
R_EARTH = 6371000

# ---------- minimal Mapbox Vector Tile reader (protobuf) ----------
def _varint(b, i):
    r = s = 0
    while True:
        x = b[i]; i += 1; r |= (x & 0x7F) << s; s += 7
        if x < 0x80: return r, i

def _fields(b):
    i, n = 0, len(b)
    while i < n:
        key, i = _varint(b, i); f, w = key >> 3, key & 7
        if w == 0: v, i = _varint(b, i)
        elif w == 2: ln, i = _varint(b, i); v = b[i:i + ln]; i += ln
        elif w == 1: v = b[i:i + 8]; i += 8
        elif w == 5: v = b[i:i + 4]; i += 4
        else: raise ValueError("wire type %d" % w)
        yield f, w, v

def _packed(b):
    i, out = 0, []
    while i < len(b):
        v, i = _varint(b, i); out.append(v)
    return out

def _zz(n): return (n >> 1) ^ -(n & 1)

def read_lines(path, layer_name="roads"):
    """Line features of one layer as lists of tile-pixel rings: [(props, [[(x,y),...], ...]), ...] + extent."""
    b = open(path, "rb").read()
    out, extent = [], 4096
    for f, w, v in _fields(b):
        if f != 3: continue
        name, feats, keys, vals = None, [], [], []
        for lf, lw, lv in _fields(v):
            if lf == 1: name = lv.decode()
            elif lf == 2: feats.append(lv)
            elif lf == 3: keys.append(lv.decode())
            elif lf == 4:
                val = None
                for vf, vw, vv in _fields(lv):
                    if vf == 1: val = vv.decode()
                    elif vf in (4, 5): val = vv
                    elif vf == 6: val = _zz(vv)
                    elif vf == 7: val = bool(vv)
                vals.append(val)
            elif lf == 5: extent = lv
        if name != layer_name: continue
        for fb in feats:
            tags, gtype, geom = [], 0, []
            for ff, fw, fv in _fields(fb):
                if ff == 2: tags = _packed(fv)
                elif ff == 3: gtype = fv
                elif ff == 4: geom = _packed(fv)
            if gtype != 2: continue
            props = {keys[tags[k]]: vals[tags[k + 1]] for k in range(0, len(tags) - 1, 2)}
            lines, x = [], 0; y = 0; i = 0; cur = None
            while i < len(geom):
                cmd, cnt = geom[i] & 7, geom[i] >> 3; i += 1
                if cmd == 7: continue
                for _ in range(cnt):
                    x += _zz(geom[i]); y += _zz(geom[i + 1]); i += 2
                    if cmd == 1:
                        cur = [(x, y)]; lines.append(cur)
                    else: cur.append((x, y))
            out.append((props, [l for l in lines if len(l) > 1]))
    return out, extent

# ---------- geometry ----------
def tile_of(lat, lon):
    n = 2 ** Z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y

def to_ll(tx, ty, px, py, ext):
    n = 2 ** Z
    x, y = tx + px / ext, ty + py / ext
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon

def hav(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0]); dp = p2 - p1; dl = math.radians(b[1] - a[1])
    return 2 * R_EARTH * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))

def brg(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0]); dl = math.radians(b[1] - a[1])
    return (math.degrees(math.atan2(math.sin(dl) * math.cos(p2), math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl))) + 360) % 360

def dang(a, b):  # signed b - a in (-180, 180]
    d = (b - a + 540) % 360 - 180
    return d

def at_dist(line, cum, m):
    m = max(0, min(cum[-1], m))
    lo, hi = 0, len(cum) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if cum[mid] <= m: lo = mid
        else: hi = mid
    seg = cum[hi] - cum[lo] or 1
    f = (m - cum[lo]) / seg
    return (line[lo][0] + (line[hi][0] - line[lo][0]) * f, line[lo][1] + (line[hi][1] - line[lo][1]) * f)

def cumul(line):
    c = [0.0]
    for i in range(1, len(line)): c.append(c[-1] + hav(line[i - 1], line[i]))
    return c

_tiles = {}
def roads_near(lat, lon):
    """Road polylines (lat/lon) from the zoom-15 tile under the point and its 8 neighbours."""
    fx, fy = tile_of(lat, lon); tx, ty = int(fx), int(fy)
    lines = []
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            k = (tx + dx, ty + dy)
            if k not in _tiles:
                p = os.path.join(TILES, str(Z), str(k[0]), f"{k[1]}.mvt")
                got = []
                if os.path.exists(p):
                    feats, ext = read_lines(p)
                    for props, ls in feats:
                        for l in ls: got.append([to_ll(k[0], k[1], x, y, ext) for x, y in l])
                _tiles[k] = got
            lines.extend(_tiles[k])
    return lines

def arms_at(P, lines, own=()):
    """Directions (degrees) of every way leaving point P (own = the track's own way in and out, for trails not on the map)."""
    arms = list(own)
    kx = 111320 * math.cos(math.radians(P[0])); ky = 110540
    for l in lines:
        best = (1e9, 0, 0.0)
        for i in range(len(l) - 1):
            x1, y1 = (l[i][1] - P[1]) * kx, (l[i][0] - P[0]) * ky
            x2, y2 = (l[i + 1][1] - P[1]) * kx, (l[i + 1][0] - P[0]) * ky
            dx, dy = x2 - x1, y2 - y1; s = dx * dx + dy * dy
            f = max(0, min(1, (-x1 * dx - y1 * dy) / s)) if s else 0
            d = math.hypot(x1 + f * dx, y1 + f * dy)
            if d < best[0]: best = (d, i, f)
        if best[0] > NEAR_M: continue
        c = cumul(l); here = c[best[1]] + best[2] * (c[best[1] + 1] - c[best[1]])
        for sign in (-1, 1):
            far = here + sign * ARM_M
            if far < -5 or far > c[-1] + 5: continue          # the way ends here: no arm this side
            if (sign < 0 and here < ARM_M * 0.5) or (sign > 0 and c[-1] - here < ARM_M * 0.5): continue
            arms.append(brg(P, at_dist(l, c, far)))
    # merge arms pointing the same way (the same road cut in two pieces, or two lines drawn on top of each other)
    arms.sort(); groups = []
    for a in arms:
        if groups and abs(dang(groups[-1][-1], a)) <= ARM_MERGE: groups[-1].append(a)
        else: groups.append([a])
    if len(groups) > 1 and abs(dang(groups[-1][-1], groups[0][0])) <= ARM_MERGE:
        groups[0] = groups.pop() + groups[0]
    return [g[len(g) // 2] for g in groups]

def turns_for(t):
    line = [tuple(p) for p in t["line"]]
    cum = cumul(line); scale = t["km"] / (cum[-1] / 1000 or 1)
    cands = []
    for i in range(1, len(line) - 1):
        m = cum[i]
        if m < LOOK_M or cum[-1] - m < LOOK_M: continue
        P = line[i]
        bin_ = brg(at_dist(line, cum, m - LOOK_M), P); bout = brg(P, at_dist(line, cum, m + LOOK_M))
        d = dang(bin_, bout)
        if abs(d) >= MIN_TURN: cands.append((m, d, P, bin_, bout))
    # one turn per corner: the sharpest of candidates within GROUP_M
    best = []
    for c in cands:
        if best and c[0] - best[-1][0] < GROUP_M:
            if abs(c[1]) > abs(best[-1][1]): best[-1] = c
        else: best.append(c)
    out = []
    for m, d, P, bin_, bout in best:
        arms = arms_at(P, roads_near(*P), own=((bin_ + 180) % 360, bout))
        if len(arms) < 3: continue           # no junction: just a bend in the road
        out.append({"km": round(m / 1000 * scale, 3), "dir": "L" if d < 0 else "R", "deg": int(round(abs(d))),
                    "ways": len(arms)})
    return out

def sig(t):
    """Which version of the track line the turns belong to (build.py drops them if the track changed)."""
    return f'{len(t["line"])}:{t["km"]}:{t["line"][0][0]:.5f},{t["line"][-1][1]:.5f}'

def main():
    data = json.load(open(os.path.join(ROOT, "docs", "data", "tracks.json")))
    res = {}
    for t in data["tracks"]:
        res[t["id"]] = {"sig": sig(t), "turns": turns_for(t)}
        print(f'{t["id"]} {t["name"][:32]:32s} {t["km"]:6.1f} km  {len(res[t["id"]]["turns"]):3d} turns')
    json.dump({"made": "tools/turns.py", "tracks": res}, open(OUT, "w"), separators=(",", ":"))
    print("wrote", os.path.relpath(OUT, ROOT))

if __name__ == "__main__":
    main()
