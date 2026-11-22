"""Data for the map on the title slide. Run with the app on :3077 and a freshly reset board:

    python3 presentation/titlemap.py > /tmp/dots.json

Writes slides/img/milwaukee-dark.svg (the slide-4 basemap restyled for a dark slide) and prints four
constants to paste over the ones in slides/index.html, all in the basemap's own 346x618 box:

    DOTS      one [x*10, y*10, confirmed] per request, oldest first
    PARTNERS  [x, y] of each partner organisation in the seed
    TOOK      per request, which partner took it (index into PARTNERS, base 36; '-' = nobody yet)
    MONTH     per request, the month it was logged (0 = January, base 36)

One dot per request logged in 2026: the synthetic archive (/api/history) plus the seeded board.
`confirmed` is 1 when the resident's own answer was "yes, the help arrived". A dot sits near its
neighbourhood's centroid, never at an address: the app stores the area only.
"""
import hashlib, json, math, re, sys, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
LON0, LAT1 = -88.0712, 43.1950                     # same projection as the slide-4 basemap: 20 px per km
KX = 111.32 * math.cos(math.radians(43.06)) * 20.0
KY = 111.2 * 20.0
px = lambda lon, lat: ((lon - LON0) * KX + 4, (LAT1 - lat) * KY + 4)   # +4: the basemap's viewBox starts at -4

svg = (HERE / 'slides/img/milwaukee.svg').read_text()
dark = (svg.replace('fill="none" stroke="#bdb7a8" stroke-width="3.2"', 'fill="none" stroke="#4a505a" stroke-width="2.2"')
           .replace('fill="#ffffff" fill-rule="evenodd" stroke="#e6e2d8" stroke-width=".7"', 'fill="#1b1e23" fill-rule="evenodd" stroke="#30353d" stroke-width=".7"'))
assert dark != svg and dark.count('#1b1e23') == 1, 'the basemap styling changed; update the colours above'
(HERE / 'slides/img/milwaukee-dark.svg').write_text(dark)

geo = (HERE.parent / 'src/lib/geo.ts').read_text()
hoods = {k.strip(): tuple(map(float, v.split(', '))) for k, v in re.findall(r'"?([A-Za-z\' ]+?)"?: \[(4[23]\.\d+, -8[78]\.\d+)\]', geo)}

get = lambda p: json.load(urllib.request.urlopen('http://localhost:3077' + p))['requests']
reqs = [r for r in get('/api/history') + [r for r in get('/api/snapshot') if r['id'].startswith('req-0')] if r['createdAt'].startswith('2026')]
reqs.sort(key=lambda r: r['createdAt'])

seed = (HERE.parent / 'src/lib/db/seed.ts').read_text()
partners = re.findall(r'\{ id: "(p-[a-z]+)", name: "[^"]+".*?coords: \[([\d.]+), (-[\d.]+)\]', seed)
pidx = {pid: k for k, (pid, _, _) in enumerate(partners)}
assert len(partners) <= 36, 'partner index is written as one base-36 character'

out, took, month, missing = [], '', '', set()
for r in reqs:
    c = hoods.get(r['neighborhood'])
    if not c:
        missing.add(r['neighborhood']); continue
    # A small, repeatable scatter so requests from one neighbourhood do not stack on a single point.
    h = int(hashlib.md5(r['id'].encode()).hexdigest(), 16)
    a = math.radians(h % 3600 / 10)
    rad = math.sqrt(((h >> 16) % 10000) / 10000) * 0.0078        # within about 850 m of the centroid
    x, y = px(c[1] + math.cos(a) * rad * 1.35, c[0] + math.sin(a) * rad)
    out.append([round(x * 10), round(y * 10), 1 if r.get('residentFeedback') == 'yes' else 0])
    p = r.get('partnerId') or (r.get('dispatch') or {}).get('partnerId')
    took += '0123456789abcdefghijklmnopqrstuvwxyz'[pidx[p]] if p in pidx else '-'
    month += '0123456789ab'[int(r['createdAt'][5:7]) - 1]

print(f'{len(out)} dots, {sum(d[2] for d in out)} confirmed by the resident, {len(took) - took.count("-")} taken by a partner, missing neighbourhoods: {missing or "none"}', file=sys.stderr)
print('const DOTS = ' + json.dumps(out, separators=(',', ':')) + ';')
print('const PARTNERS = ' + json.dumps([[round(v, 1) for v in px(float(lon), float(lat))] for _, lat, lon in partners], separators=(',', ':')) + ';')
print(f"const TOOK = '{took}';")
print(f"const MONTH = '{month}';")
