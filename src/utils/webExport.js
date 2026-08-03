/**
 * Web image export — renders the whole idea web to a standalone SVG and
 * rasterizes it to a PNG. Dependency-free; safe to call from the browser.
 */

const CARD_W = 288;
const LINE_H = 18;
const LABEL_H = 22;
const PAD_V = 16;
const MARGIN = 90;
const FONT_STACK = "'Outfit', 'Segoe UI', system-ui, -apple-system, sans-serif";
const GOOGLE_FONT_CSS = "https://fonts.googleapis.com/css2?family=Outfit:wght@500;700&display=swap";

// Rasterizing an SVG happens in an isolated image context that cannot reach the
// page's webfonts, so 'Outfit' silently fell back to a system font in every
// export. Inline the woff2 as a data URI instead. Fetched once per session.
let fontFacePromise = null;

async function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function buildFontFaceCss() {
  const css = await fetch(GOOGLE_FONT_CSS).then((r) => (r.ok ? r.text() : ""));
  const blocks = css.match(/@font-face\s*\{[^}]*\}/g) || [];

  // Google returns one block per subset; the latin subset is emitted last for
  // each weight, so keeping the last match per weight gives us basic latin.
  const byWeight = new Map();
  blocks.forEach((block) => {
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
    const url = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    if (weight && url) byWeight.set(weight, url);
  });

  const faces = await Promise.all(
    Array.from(byWeight.entries()).map(async ([weight, url]) => {
      const buffer = await fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null));
      if (!buffer) return "";
      const base64 = await toBase64(buffer);
      return `@font-face{font-family:'Outfit';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${base64}) format('woff2');}`;
    })
  );

  return faces.filter(Boolean).join("");
}

/** Resolve the inline @font-face CSS, or an empty string if the fetch fails. */
async function getFontFaceCss() {
  if (!fontFacePromise) {
    fontFacePromise = buildFontFaceCss().catch(() => "");
  }
  return fontFacePromise;
}

const TYPE_LABELS = {
  problem: "PROBLEM",
  method: "METHOD",
  application: "APPLICATION",
  assumption: "ASSUMPTION",
  opportunity: "OPPORTUNITY"
};

function escapeXml(value) {
  return String(value ?? "").replace(/[<>&'"]/g, (c) => (
    { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]
  ));
}

function wrapText(text, maxChars, maxLines) {
  const words = String(text ?? "").trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const trimmed = lines.slice(0, maxLines);
    trimmed[maxLines - 1] = `${trimmed[maxLines - 1].slice(0, maxChars - 1)}…`;
    return trimmed;
  }
  return lines;
}

function nodeBox(node) {
  const lines = wrapText(node.content, 30, 6);
  const isRoot = node.isRoot;
  const textH = lines.length * LINE_H;
  const height = (isRoot ? 0 : LABEL_H) + textH + PAD_V * 2;
  return { lines, width: CARD_W, height };
}

function curvePath(x1, y1, x2, y2) {
  const cp = Math.max(50, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x2 - cp} ${y2}, ${x2} ${y2}`;
}

/**
 * Build a standalone SVG string for the whole web.
 * @param {Array} nodes  node list ({id, content, type, parentId, isRoot, round})
 * @param {Map} layout   Map<id, {x, y}>
 * @param {Object} typeColors
 */
export function buildWebSvg(nodes, layout, typeColors, title = "ThinkStorm", fontFaceCss = "") {
  const boxes = new Map();
  nodes.forEach((n) => boxes.set(n.id, nodeBox(n)));

  // Bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach((n) => {
    const p = layout.get(n.id);
    if (!p) return;
    const b = boxes.get(n.id);
    minX = Math.min(minX, p.x - b.width / 2);
    maxX = Math.max(maxX, p.x + b.width / 2);
    minY = Math.min(minY, p.y - b.height / 2);
    maxY = Math.max(maxY, p.y + b.height / 2);
  });
  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; maxX = CARD_W; maxY = 120;
  }

  const ox = -minX + MARGIN;
  const oy = -minY + MARGIN;
  const width = Math.ceil(maxX - minX + MARGIN * 2);
  const height = Math.ceil(maxY - minY + MARGIN * 2 + 40);

  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Edges
  const edgeEls = [];
  nodes.forEach((n) => {
    if (!n.parentId || !byId.has(n.parentId)) return;
    const a = layout.get(n.parentId);
    const b = layout.get(n.id);
    if (!a || !b) return;
    const color = typeColors[n.type] || "#94a3b8";
    edgeEls.push(
      `<path d="${curvePath(a.x + ox, a.y + oy, b.x + ox, b.y + oy)}" fill="none" stroke="${color}" stroke-width="2.25" stroke-opacity="0.7" stroke-linecap="round"/>`
    );
  });

  // Round lineage links (dashed)
  const roots = nodes.filter((n) => n.isRoot).sort((a, b) => (a.round || 1) - (b.round || 1));
  for (let i = 1; i < roots.length; i += 1) {
    const a = layout.get(roots[i - 1].id);
    const b = layout.get(roots[i].id);
    if (!a || !b) continue;
    edgeEls.push(
      `<path d="${curvePath(a.x + ox, a.y + oy, b.x + ox, b.y + oy)}" fill="none" stroke="#18c6d6" stroke-width="2" stroke-opacity="0.6" stroke-dasharray="7 7" stroke-linecap="round"/>`
    );
  }

  // Cards
  const cardEls = [];
  nodes.forEach((n) => {
    const p = layout.get(n.id);
    if (!p) return;
    const b = boxes.get(n.id);
    const x = p.x + ox - b.width / 2;
    const y = p.y + oy - b.height / 2;
    const color = typeColors[n.type] || "#1f9ed6";

    if (n.isRoot) {
      const lines = b.lines;
      const textStart = y + b.height / 2 - ((lines.length - 1) * LINE_H) / 2;
      const tspans = lines.map((ln, i) =>
        `<tspan x="${x + b.width / 2}" y="${textStart + i * LINE_H}">${escapeXml(ln)}</tspan>`
      ).join("");
      cardEls.push(
        `<g>
          <rect x="${x}" y="${y}" width="${b.width}" height="${b.height}" rx="16" fill="url(#rootGrad)"/>
          <text font-family="${FONT_STACK}" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">${tspans}</text>
        </g>`
      );
      return;
    }

    const lines = b.lines;
    const labelY = y + PAD_V + 4;
    const textStart = y + LABEL_H + PAD_V + 4;
    const tspans = lines.map((ln, i) =>
      `<tspan x="${x + 16}" y="${textStart + i * LINE_H}">${escapeXml(ln)}</tspan>`
    ).join("");
    cardEls.push(
      `<g>
        <rect x="${x}" y="${y}" width="${b.width}" height="${b.height}" rx="13" fill="#ffffff" stroke="rgba(15,23,42,0.10)"/>
        <rect x="${x}" y="${y}" width="4" height="${b.height}" rx="2" fill="${color}"/>
        <text x="${x + 16}" y="${labelY + 8}" font-family="${FONT_STACK}" font-size="9.5" font-weight="700" letter-spacing="0.6" fill="${color}">${escapeXml(TYPE_LABELS[n.type] || "IDEA")}</text>
        <text font-family="${FONT_STACK}" font-size="12.5" font-weight="500" fill="#0f172a">${tspans}</text>
      </g>`
    );
  });

  return {
    width,
    height,
    svg:
`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    ${fontFaceCss ? `<style type="text/css">${fontFaceCss}</style>` : ""}
    <linearGradient id="rootGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2575e6"/>
      <stop offset="55%" stop-color="#1f9ed6"/>
      <stop offset="100%" stop-color="#18c6d6"/>
    </linearGradient>
    <radialGradient id="bgGrad" cx="50%" cy="0%" r="100%">
      <stop offset="0%" stop-color="#f3f4fd"/>
      <stop offset="100%" stop-color="#eef1f8"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
  ${edgeEls.join("\n  ")}
  ${cardEls.join("\n  ")}
  <text x="${MARGIN}" y="${height - 28}" font-family="${FONT_STACK}" font-size="13" font-weight="600" fill="#94a3b8">${escapeXml(title)} · generated with ThinkStorm</text>
</svg>`
  };
}

/**
 * Trigger a browser download for a Blob.
 *
 * Revoking the object URL synchronously after `click()` races the download in
 * Firefox and can cancel it outright, so the revoke is deferred a tick.
 */
export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Rasterize an SVG string to PNG and trigger a download. */
export function downloadWebImage(svg, width, height, filename = "thinkstorm-web") {
  return new Promise((resolve, reject) => {
    const scale = 2;
    // `unescape` is deprecated; encode the UTF-8 bytes explicitly instead.
    const utf8 = new TextEncoder().encode(svg);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < utf8.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, utf8.subarray(i, i + CHUNK));
    }
    const svg64 = `data:image/svg+xml;base64,${btoa(binary)}`;

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Failed to render image"));
            return;
          }
          triggerDownload(blob, `${filename}.png`);
          resolve();
        }, "image/png");
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Failed to load SVG for export"));
    img.src = svg64;
  });
}

/** Build + rasterize + download in one call, with the webfont inlined. */
export async function exportWebImage(nodes, layout, typeColors, title, filename) {
  const fontFaceCss = await getFontFaceCss();
  const { svg, width, height } = buildWebSvg(nodes, layout, typeColors, title, fontFaceCss);
  await downloadWebImage(svg, width, height, filename);
}
