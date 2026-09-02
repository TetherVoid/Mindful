#!/usr/bin/env python3
"""Render graphify's graph.json as a self-contained, offline 3D viewer.

graphify ships a 2D vis-network page that pulls its library from unpkg, so it
needs a network connection to draw anything. This writes a single HTML file
with the layout, the data and the renderer all inlined — no CDN, no build step,
opens straight from disk.

    python3 scripts/graph3d.py                 # after: graphify update .
    python3 scripts/graph3d.py --in <graph.json> --out <file.html>

The 3D positions are solved here rather than in the browser: a force layout
converges better when it can run a few hundred iterations against numpy than
when it has to stay inside an animation frame, and precomputing means the page
opens already settled instead of writhing for ten seconds.
"""

import argparse
import colorsys
import json
import math
import pathlib
import collections

import numpy as np

SEED = 7
ITERATIONS = 600


def components_of(n_nodes, edges):
    """Connected components — laid out separately, then packed."""
    adj = collections.defaultdict(list)
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    seen, comps = set(), []
    for start in range(n_nodes):
        if start in seen:
            continue
        stack, comp = [start], []
        while stack:
            v = stack.pop()
            if v in seen:
                continue
            seen.add(v)
            comp.append(v)
            stack.extend(adj[v])
        comps.append(sorted(comp))
    comps.sort(key=len, reverse=True)
    return comps


def layout_one(n, edges, communities, iterations):
    """Force-directed layout for a single connected component, centred on 0."""
    rng = np.random.default_rng(SEED + n)
    if n == 1:
        return np.zeros((1, 3))

    pos = rng.normal(size=(n, 3))
    pos /= np.linalg.norm(pos, axis=1, keepdims=True) + 1e-9
    pos *= rng.uniform(0.25, 1.0, size=(n, 1)) ** (1 / 3) * (n ** (1 / 3)) * 6

    src = np.array([e[0] for e in edges], dtype=np.int32) if edges else np.zeros(0, np.int32)
    dst = np.array([e[1] for e in edges], dtype=np.int32) if edges else np.zeros(0, np.int32)

    comm_ids = np.array(communities, dtype=np.int32)
    n_comms = int(comm_ids.max()) + 1 if len(comm_ids) else 1

    # Ideal edge length scaled to the component's volume, so a 256-node cluster
    # spreads instead of collapsing to the same knot a 7-node one makes.
    k = 6.0 * (n ** (1 / 3))

    for step in range(iterations):
        temp = k * 0.28 * (1.0 - step / iterations) ** 1.4 + 0.02
        disp = np.zeros_like(pos)

        delta = pos[:, None, :] - pos[None, :, :]
        dist2 = (delta ** 2).sum(-1) + 1e-6
        np.fill_diagonal(dist2, np.inf)
        disp += (delta * ((k * k) / dist2)[..., None]).sum(axis=1)

        if len(src):
            d = pos[dst] - pos[src]
            dist = np.linalg.norm(d, axis=1, keepdims=True) + 1e-6
            force = d * (dist / k) * 0.5
            np.add.at(disp, src, force)
            np.add.at(disp, dst, -force)

        # Light community cohesion. Strong cohesion collapses each community to
        # a point and the graph reads as a handful of blobs.
        if n_comms > 1:
            centroids = np.zeros((n_comms, 3))
            counts = np.zeros((n_comms, 1))
            np.add.at(centroids, comm_ids, pos)
            np.add.at(counts, comm_ids, 1)
            centroids /= np.maximum(counts, 1)
            disp += (centroids[comm_ids] - pos) * 0.035

        length = np.linalg.norm(disp, axis=1, keepdims=True) + 1e-9
        pos += disp / length * np.minimum(length, temp)

    return pos - pos.mean(axis=0)


def solve_layout(n_nodes, edges, communities):
    """Lay out each connected component, then pack them so none overlap."""
    comps = components_of(n_nodes, edges)
    out = np.zeros((n_nodes, 3))

    placed = []  # (centre, radius)
    for ci, comp in enumerate(comps):
        local = {g: i for i, g in enumerate(comp)}
        local_edges = [(local[a], local[b]) for a, b in edges
                       if a in local and b in local]
        local_comms = [communities[g] for g in comp]
        iterations = ITERATIONS if len(comp) > 20 else max(120, ITERATIONS // 3)
        pos = layout_one(len(comp), local_edges, local_comms, iterations)

        radius = float(np.linalg.norm(pos, axis=1).max()) + 4.0 if len(comp) > 1 else 3.0

        if ci == 0:
            centre = np.zeros(3)
        else:
            # Golden-angle directions give an even spread; step outward until
            # this component clears everything already placed.
            idx = ci
            phi = math.acos(1 - 2 * (idx + 0.5) / max(len(comps), 2))
            theta = math.pi * (1 + 5 ** 0.5) * idx
            direction = np.array([math.sin(phi) * math.cos(theta),
                                  math.sin(phi) * math.sin(theta),
                                  math.cos(phi)])
            step = radius * 0.5 + 5
            dist = placed[0][1] + radius + 5
            while any(np.linalg.norm(direction * dist - c) < (r + radius + 5)
                      for c, r in placed):
                dist += step
            centre = direction * dist

        placed.append((centre, radius))
        for i, g in enumerate(comp):
            out[g] = pos[i] + centre

    out -= out.mean(axis=0)
    radii = np.linalg.norm(out, axis=1)
    reference = float(np.percentile(radii, 90)) + 1e-9
    return out * (115.0 / reference)


def palette(n):
    """Evenly spaced hues, alternating lightness so neighbours stay distinct."""
    out = []
    for i in range(max(n, 1)):
        h = (i * 0.618033988749895) % 1.0
        light = 0.62 if i % 2 == 0 else 0.48
        r, g, b = colorsys.hls_to_rgb(h, light, 0.58)
        out.append('#%02x%02x%02x' % (int(r * 255), int(g * 255), int(b * 255)))
    return out


def build(graph_path, out_path):
    graph = json.loads(pathlib.Path(graph_path).read_text())
    raw_nodes = graph['nodes']
    raw_links = graph['links']

    index = {n['id']: i for i, n in enumerate(raw_nodes)}

    degree = collections.Counter()
    for link in raw_links:
        if link['source'] in index and link['target'] in index:
            degree[link['source']] += 1
            degree[link['target']] += 1

    comm_names = []
    comm_of = {}
    for node in raw_nodes:
        name = node.get('community_name') or f"Community {node.get('community', '?')}"
        if name not in comm_of:
            comm_of[name] = len(comm_names)
            comm_names.append(name)

    communities = [comm_of[n.get('community_name') or f"Community {n.get('community', '?')}"]
                   for n in raw_nodes]

    edges = [(index[l['source']], index[l['target']])
             for l in raw_links if l['source'] in index and l['target'] in index]

    positions = solve_layout(len(raw_nodes), edges, communities)

    nodes_out = []
    for i, node in enumerate(raw_nodes):
        nodes_out.append({
            'i': i,
            'l': node.get('label') or node['id'],
            'c': communities[i],
            'd': degree.get(node['id'], 0),
            'f': node.get('source_file') or node.get('file') or '',
            't': node.get('file_type') or '',
            'x': round(float(positions[i][0]), 2),
            'y': round(float(positions[i][1]), 2),
            'z': round(float(positions[i][2]), 2),
        })

    links_out = []
    for link in raw_links:
        if link['source'] not in index or link['target'] not in index:
            continue
        links_out.append({
            's': index[link['source']],
            't': index[link['target']],
            'r': link.get('relation', ''),
            'c': link.get('confidence', ''),
        })

    relations = sorted({l['r'] for l in links_out})
    payload = {
        'nodes': nodes_out,
        'links': links_out,
        'communities': comm_names,
        'colors': palette(len(comm_names)),
        'relations': relations,
        'commit': graph.get('built_at_commit', ''),
        'camDist': round(float(np.percentile(np.linalg.norm(positions, axis=1), 90)) * 2.3, 1),
        'project': pathlib.Path(graph_path).resolve().parent.parent.name,
    }

    html = TEMPLATE.replace('__DATA__', json.dumps(payload, separators=(',', ':')))
    pathlib.Path(out_path).write_text(html)
    return payload


TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Knowledge graph — 3D</title>
<style>
  :root{
    --bg:#0d0d10; --panel:#16161b; --line:#2a2a33; --text:#e8e6e0;
    --muted:#8d8a84; --accent:#e0714f;
  }
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:var(--bg);color:var(--text);
    font:13px/1.5 ui-monospace,"SF Mono",Menlo,Consolas,monospace;overflow:hidden}
  canvas{display:block;cursor:grab}
  canvas.dragging{cursor:grabbing}

  .hud{position:fixed;pointer-events:none;inset:0}
  .hud > *{pointer-events:auto}

  .panel{position:fixed;background:rgba(22,22,27,.94);border:1px solid var(--line);
    backdrop-filter:blur(8px);border-radius:4px}

  #head{top:12px;left:12px;padding:10px 14px;max-width:290px}
  #head h1{margin:0 0 2px;font-size:13px;letter-spacing:.14em;text-transform:uppercase}
  #head p{margin:0;color:var(--muted);font-size:11px}

  #side{top:12px;right:12px;width:264px;max-height:calc(100vh - 24px);
    overflow-y:auto;padding:12px}
  #side h2{margin:14px 0 7px;font-size:10px;letter-spacing:.16em;
    text-transform:uppercase;color:var(--accent)}
  #side h2:first-child{margin-top:0}

  input[type=search]{width:100%;padding:7px 9px;background:#0f0f13;color:var(--text);
    border:1px solid var(--line);border-radius:3px;font:inherit}
  input[type=search]:focus{outline:none;border-color:var(--accent)}

  .row{display:flex;align-items:center;gap:7px;padding:2.5px 0;cursor:pointer;
    color:var(--muted);font-size:11px}
  .row:hover{color:var(--text)}
  .row input{accent-color:var(--accent);margin:0;cursor:pointer}
  .row .sw{width:9px;height:9px;border-radius:2px;flex:0 0 auto}
  .row .ct{margin-left:auto;font-size:10px;opacity:.55}
  .row.off{opacity:.32}

  .btn{display:inline-block;padding:5px 9px;margin:2px 3px 2px 0;background:transparent;
    border:1px solid var(--line);color:var(--muted);border-radius:3px;cursor:pointer;
    font:inherit;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
  .btn:hover{color:var(--text);border-color:var(--text)}
  .btn.on{background:var(--accent);border-color:var(--accent);color:#141310}

  #detail{position:fixed;left:12px;bottom:12px;width:330px;padding:12px;display:none;
    max-height:44vh;overflow-y:auto}
  #detail .nm{font-size:15px;color:var(--text);word-break:break-all;margin-bottom:3px}
  #detail .meta{color:var(--muted);font-size:11px;margin-bottom:9px;word-break:break-all}
  #detail .conn{display:flex;gap:7px;padding:3px 0;border-top:1px solid var(--line);
    font-size:11px;color:var(--muted);cursor:pointer}
  #detail .conn:hover{color:var(--accent)}
  #detail .conn .rel{color:var(--accent);opacity:.75;flex:0 0 88px;font-size:10px}
  #detail .conn .to{word-break:break-all}
  #close{position:absolute;top:8px;right:9px;background:none;border:0;color:var(--muted);
    cursor:pointer;font-size:15px;line-height:1;padding:2px 5px}
  #close:hover{color:var(--text)}

  #tip{position:fixed;padding:3px 7px;background:#000;border:1px solid var(--line);
    border-radius:3px;font-size:11px;pointer-events:none;display:none;white-space:nowrap;z-index:9}
  #hint{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);color:var(--muted);
    font-size:10.5px;letter-spacing:.07em;background:rgba(13,13,16,.82);padding:5px 12px;
    border-radius:3px;pointer-events:none}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div class="hud">
  <div class="panel" id="head">
    <h1 id="proj">Graph</h1>
    <p id="stat"></p>
  </div>

  <div class="panel" id="side">
    <h2>Find</h2>
    <input type="search" id="q" placeholder="search nodes…" autocomplete="off">
    <div style="margin-top:7px">
      <button class="btn" id="b-rot">Auto-rotate</button>
      <button class="btn" id="b-lab">Labels: hubs</button>
      <button class="btn" id="b-reset">Reset view</button>
      <button class="btn" id="b-iso" style="display:none">Exit isolate</button>
    </div>

    <h2>Communities</h2>
    <div style="margin-bottom:5px">
      <button class="btn" id="c-all">All</button><button class="btn" id="c-none">None</button>
    </div>
    <div id="comms"></div>

    <h2>Relations</h2>
    <div id="rels"></div>
  </div>

  <div class="panel" id="detail">
    <button id="close">×</button>
    <div class="nm" id="d-name"></div>
    <div class="meta" id="d-meta"></div>
    <div>
      <button class="btn" id="d-iso">Isolate neighbours</button>
      <button class="btn" id="d-focus">Fly to</button>
    </div>
    <div id="d-conns" style="margin-top:9px"></div>
  </div>

  <div id="tip"></div>
  <div id="hint">drag orbit · wheel zoom · shift-drag or right-drag pan · click node</div>
</div>

<script>
const DATA = __DATA__;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const N = DATA.nodes, L = DATA.links, COL = DATA.colors;

document.getElementById('proj').textContent = DATA.project || 'Graph';
document.getElementById('stat').textContent =
  N.length + ' nodes · ' + L.length + ' edges · ' + DATA.communities.length + ' communities' +
  (DATA.commit ? ' · ' + DATA.commit.slice(0,8) : '');

/* adjacency, used for isolate + the detail panel */
const adj = N.map(()=>[]);
L.forEach((l,i)=>{ adj[l.s].push({o:l.t,r:l.r,i}); adj[l.t].push({o:l.s,r:l.r,i}); });

const maxDeg = Math.max(1, ...N.map(n=>n.d));

/* ---- camera ---------------------------------------------------------- */
const cam = { yaw:0.6, pitch:-0.25, dist:(DATA.camDist||420), panX:0, panY:0 };
const HOME = {...cam};
let autorot = false, labelMode = 1;          // 0 none · 1 hubs · 2 all
let selected = null, hovered = null, isolate = null;
const commOn = DATA.communities.map(()=>true);
const relOn = {}; DATA.relations.forEach(r=>relOn[r]=true);
let query = '';

function resize(){
  const r = window.devicePixelRatio || 1;
  cv.width = innerWidth * r; cv.height = innerHeight * r;
  cv.style.width = innerWidth+'px'; cv.style.height = innerHeight+'px';
  ctx.setTransform(r,0,0,r,0,0);
}
addEventListener('resize', resize); resize();

/* ---- projection ------------------------------------------------------ */
const proj = new Float32Array(N.length*4);   // x, y, depth, scale
function project(){
  const cy=Math.cos(cam.yaw), sy=Math.sin(cam.yaw);
  const cp=Math.cos(cam.pitch), sp=Math.sin(cam.pitch);
  const cx=innerWidth/2 + cam.panX, cyy=innerHeight/2 + cam.panY;
  const f = Math.min(innerWidth, innerHeight) * 0.9;
  for(let i=0;i<N.length;i++){
    const n=N[i];
    let x = n.x*cy - n.z*sy;
    let z = n.x*sy + n.z*cy;
    let y = n.y*cp - z*sp;
    z     = n.y*sp + z*cp;
    const d = z + cam.dist;
    const s = d > 1 ? f/d : f;
    proj[i*4]   = cx + x*s;
    proj[i*4+1] = cyy + y*s;
    proj[i*4+2] = d;
    proj[i*4+3] = s;
  }
}

/* ---- visibility ------------------------------------------------------ */
function nodeVisible(i){
  const n = N[i];
  if(!commOn[n.c]) return false;
  if(isolate !== null && i !== isolate && !adj[isolate].some(a=>a.o===i)) return false;
  return true;
}
function matches(i){
  return query && N[i].l.toLowerCase().includes(query);
}

/* ---- draw ------------------------------------------------------------ */
const order = new Int32Array(N.length);
function draw(){
  if(autorot) cam.yaw += 0.0022;
  project();

  ctx.fillStyle = '#0d0d10';
  ctx.fillRect(0,0,innerWidth,innerHeight);

  /* edges first, depth-faded */
  ctx.lineWidth = 1;
  for(let e=0;e<L.length;e++){
    const l = L[e];
    if(!relOn[l.r]) continue;
    if(!nodeVisible(l.s) || !nodeVisible(l.t)) continue;
    const hot = selected !== null && (l.s===selected || l.t===selected);
    const a = proj[l.s*4], b = proj[l.s*4+1], c = proj[l.t*4], d = proj[l.t*4+1];
    const depth = (proj[l.s*4+2] + proj[l.t*4+2]) / 2;
    let alpha = Math.max(0.04, Math.min(0.5, 170/depth - 0.25));
    if(selected !== null) alpha = hot ? 0.92 : alpha*0.22;
    ctx.strokeStyle = hot ? 'rgba(224,113,79,'+alpha+')' : 'rgba(150,150,170,'+alpha+')';
    if(l.c === 'INFERRED'){ ctx.setLineDash([3,3]); } else { ctx.setLineDash([]); }
    ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke();
  }
  ctx.setLineDash([]);

  /* nodes back-to-front so near ones overlap far ones */
  let m=0;
  for(let i=0;i<N.length;i++) if(nodeVisible(i)) order[m++]=i;
  const slice = order.subarray(0,m);
  Array.prototype.sort.call(slice,(p,q)=>proj[q*4+2]-proj[p*4+2]);

  const labels = [];
  for(let j=0;j<m;j++){
    const i = slice[j], n = N[i];
    const x=proj[i*4], y=proj[i*4+1], depth=proj[i*4+2], s=proj[i*4+3];
    if(x<-60||x>innerWidth+60||y<-60||y>innerHeight+60) continue;

    const r = Math.max(1.6, (2.2 + 7*Math.sqrt(n.d/maxDeg)) * s/6);
    const dim = Math.max(0.22, Math.min(1, 190/depth - 0.15));
    const hit = matches(i);
    const isSel = i===selected, isHov = i===hovered;
    const near = selected!==null && adj[selected].some(a=>a.o===i);

    let alpha = dim;
    if(query) alpha = hit ? 1 : dim*0.16;
    else if(selected!==null && !isSel && !near) alpha = dim*0.3;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = COL[n.c];
    ctx.beginPath(); ctx.arc(x,y,r,0,6.283); ctx.fill();

    if(isSel || isHov || hit){
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isSel ? '#fff' : '#e0714f';
      ctx.lineWidth = isSel ? 2 : 1.4;
      ctx.beginPath(); ctx.arc(x,y,r+3.5,0,6.283); ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.globalAlpha = 1;

    const wantLabel = labelMode===2 || isSel || isHov || hit || near ||
                      (labelMode===1 && n.d >= 8);
    if(wantLabel && alpha > 0.28) labels.push({x,y,r,t:n.l,hot:isSel||isHov||hit});
  }

  /* labels last so nothing paints over them */
  ctx.font = '11px ui-monospace,Menlo,monospace';
  ctx.textBaseline = 'middle';
  /* Nearest-first, skipping any label that would collide with one already
     drawn. Without this a dense cluster becomes an unreadable pile of text. */
  labels.sort((a,b)=> (b.hot?1:0)-(a.hot?1:0));
  const taken = [];
  for(const lb of labels){
    const w = ctx.measureText(lb.t).width + 6;
    const bx = lb.x+lb.r+3, by = lb.y-7, bw = w, bh = 14;
    if(!lb.hot && taken.some(t => bx < t.x+t.w && bx+bw > t.x && by < t.y+t.h && by+bh > t.y))
      continue;
    taken.push({x:bx,y:by,w:bw,h:bh});
    ctx.fillStyle = 'rgba(13,13,16,.78)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = lb.hot ? '#fff' : '#c9c6c0';
    ctx.fillText(lb.t, bx+3, lb.y);
  }
  requestAnimationFrame(draw);
}

/* ---- picking --------------------------------------------------------- */
function pick(mx,my){
  let best=null, bd=18*18;
  for(let i=0;i<N.length;i++){
    if(!nodeVisible(i)) continue;
    const dx=proj[i*4]-mx, dy=proj[i*4+1]-my, d=dx*dx+dy*dy;
    if(d<bd){ bd=d; best=i; }
  }
  return best;
}

/* ---- interaction ----------------------------------------------------- */
let drag=null;
cv.addEventListener('mousedown',e=>{
  drag={x:e.clientX,y:e.clientY,pan:e.shiftKey||e.button===2,moved:false};
  cv.classList.add('dragging');
});
addEventListener('mousemove',e=>{
  if(drag){
    const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
    if(Math.abs(dx)+Math.abs(dy)>3) drag.moved=true;
    if(drag.pan){ cam.panX+=dx; cam.panY+=dy; }
    else { cam.yaw+=dx*0.006; cam.pitch=Math.max(-1.5,Math.min(1.5,cam.pitch+dy*0.006)); }
    drag.x=e.clientX; drag.y=e.clientY;
    return;
  }
  const i=pick(e.clientX,e.clientY);
  hovered=i;
  const tip=document.getElementById('tip');
  if(i!==null){
    tip.style.display='block'; tip.textContent=N[i].l+'  ·  '+N[i].d+' edges';
    tip.style.left=(e.clientX+13)+'px'; tip.style.top=(e.clientY+13)+'px';
    cv.style.cursor='pointer';
  } else { tip.style.display='none'; cv.style.cursor='grab'; }
});
addEventListener('mouseup',e=>{
  if(drag && !drag.moved){
    const i=pick(e.clientX,e.clientY);
    if(i!==null) select(i); else { selected=null; hideDetail(); }
  }
  drag=null; cv.classList.remove('dragging');
});
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('wheel',e=>{
  e.preventDefault();
  cam.dist = Math.max(30, Math.min(1400, cam.dist * (1 + Math.sign(e.deltaY)*0.11)));
},{passive:false});

/* touch: one finger orbits, two fingers pinch-zoom */
let touch=null;
cv.addEventListener('touchstart',e=>{
  if(e.touches.length===1) touch={x:e.touches[0].clientX,y:e.touches[0].clientY};
  else if(e.touches.length===2) touch={d:Math.hypot(
    e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY)};
},{passive:true});
cv.addEventListener('touchmove',e=>{
  if(!touch) return;
  if(e.touches.length===1 && touch.x!==undefined){
    cam.yaw += (e.touches[0].clientX-touch.x)*0.006;
    cam.pitch = Math.max(-1.5,Math.min(1.5,cam.pitch+(e.touches[0].clientY-touch.y)*0.006));
    touch.x=e.touches[0].clientX; touch.y=e.touches[0].clientY;
  } else if(e.touches.length===2 && touch.d!==undefined){
    const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,
                       e.touches[0].clientY-e.touches[1].clientY);
    cam.dist=Math.max(30,Math.min(1400,cam.dist*(touch.d/d)));
    touch.d=d;
  }
},{passive:true});
cv.addEventListener('touchend',()=>{touch=null},{passive:true});

/* ---- detail panel ---------------------------------------------------- */
const detail=document.getElementById('detail');
function hideDetail(){ detail.style.display='none'; }
function select(i){
  selected=i;
  const n=N[i];
  document.getElementById('d-name').textContent=n.l;
  document.getElementById('d-meta').textContent=
    [DATA.communities[n.c], n.d+' edges', n.f||n.t||''].filter(Boolean).join('  ·  ');
  const box=document.getElementById('d-conns'); box.innerHTML='';
  const seen=new Set();
  adj[i].slice().sort((a,b)=>N[b.o].d-N[a.o].d).forEach(a=>{
    const key=a.o+'|'+a.r; if(seen.has(key)) return; seen.add(key);
    const row=document.createElement('div'); row.className='conn';
    row.innerHTML='<span class="rel">'+a.r+'</span><span class="to">'+N[a.o].l+'</span>';
    row.onclick=()=>select(a.o);
    box.appendChild(row);
  });
  detail.style.display='block';
  document.getElementById('b-iso').style.display = isolate!==null ? 'inline-block' : 'none';
}
document.getElementById('close').onclick=()=>{selected=null;hideDetail()};
document.getElementById('d-iso').onclick=()=>{
  isolate = isolate===selected ? null : selected;
  document.getElementById('b-iso').style.display = isolate!==null?'inline-block':'none';
};
document.getElementById('d-focus').onclick=()=>{
  if(selected===null) return;
  const n=N[selected];
  cam.yaw = Math.atan2(-n.z, n.x) + Math.PI/2;
  cam.pitch = -0.2; cam.dist = 120; cam.panX = 0; cam.panY = 0;
};
document.getElementById('b-iso').onclick=()=>{
  isolate=null; document.getElementById('b-iso').style.display='none';
};

/* ---- controls -------------------------------------------------------- */
const bRot=document.getElementById('b-rot'), bLab=document.getElementById('b-lab');
bRot.onclick=()=>{ autorot=!autorot; bRot.classList.toggle('on',autorot); };
const LABELS=['Labels: off','Labels: hubs','Labels: all'];
bLab.classList.add('on');
bLab.onclick=()=>{ labelMode=(labelMode+1)%3; bLab.textContent=LABELS[labelMode];
  bLab.classList.toggle('on',labelMode>0); };
document.getElementById('b-reset').onclick=()=>{ Object.assign(cam,HOME);
  selected=null; isolate=null; hideDetail();
  document.getElementById('b-iso').style.display='none'; };
document.getElementById('q').oninput=e=>{ query=e.target.value.trim().toLowerCase(); };

/* community + relation toggles */
const commCounts={}; N.forEach(n=>commCounts[n.c]=(commCounts[n.c]||0)+1);
const commBox=document.getElementById('comms');
DATA.communities.forEach((name,i)=>{
  const row=document.createElement('label'); row.className='row';
  row.innerHTML='<input type="checkbox" checked><span class="sw" style="background:'+COL[i]+'"></span>'+
    '<span>'+name+'</span><span class="ct">'+(commCounts[i]||0)+'</span>';
  row.querySelector('input').onchange=e=>{ commOn[i]=e.target.checked;
    row.classList.toggle('off',!e.target.checked); };
  commBox.appendChild(row);
});
function setAllComms(v){
  commBox.querySelectorAll('.row').forEach((row,i)=>{
    row.querySelector('input').checked=v; commOn[i]=v; row.classList.toggle('off',!v);
  });
}
document.getElementById('c-all').onclick=()=>setAllComms(true);
document.getElementById('c-none').onclick=()=>setAllComms(false);

const relCounts={}; L.forEach(l=>relCounts[l.r]=(relCounts[l.r]||0)+1);
const relBox=document.getElementById('rels');
DATA.relations.forEach(r=>{
  const row=document.createElement('label'); row.className='row';
  row.innerHTML='<input type="checkbox" checked><span>'+r+'</span>'+
    '<span class="ct">'+(relCounts[r]||0)+'</span>';
  row.querySelector('input').onchange=e=>{ relOn[r]=e.target.checked;
    row.classList.toggle('off',!e.target.checked); };
  relBox.appendChild(row);
});

addEventListener('keydown',e=>{
  if(e.key==='Escape'){ selected=null; isolate=null; hideDetail();
    document.getElementById('b-iso').style.display='none'; }
  if(e.key==='r' && e.target.tagName!=='INPUT') bRot.click();
  if(e.key==='l' && e.target.tagName!=='INPUT') bLab.click();
});

draw();
</script>
</body>
</html>
"""


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='src', default='graphify-out/graph.json')
    ap.add_argument('--out', dest='out', default='graphify-out/graph-3d.html')
    args = ap.parse_args()

    result = build(args.src, args.out)
    size = pathlib.Path(args.out).stat().st_size
    print(f"{args.out}  —  {len(result['nodes'])} nodes, {len(result['links'])} edges, "
          f"{len(result['communities'])} communities, {size/1024:.0f} KB, no external requests")
