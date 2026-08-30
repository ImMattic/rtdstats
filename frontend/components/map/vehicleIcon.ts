import L from "leaflet";

export function iconPx(zoom: number): number {
  if (zoom <= 9)  return 10;
  if (zoom <= 11) return 16;
  if (zoom <= 13) return 22;
  return 28;
}

const _iconCache = new Map<string, L.DivIcon>();

/**
 * Bus icon: circle body with a small seamless directional tip, single unified path.
 * Rail icon: rounded rectangle with a pointed nose, single seamless path.
 * Both are rotated by `bearing` and scale with zoom.
 */
export function createVehicleIcon(
  bearing: number | null,
  fillColor: string,
  headwayStroke: string,
  outlineColor: string,
  zoom: number,
  isRail: boolean,
): L.DivIcon {
  const rot = Math.round((bearing ?? 0) / 5) * 5;
  const cacheKey = `${isRail ? 1 : 0}|${fillColor || "888888"}|${headwayStroke}|${outlineColor}|${zoom}|${rot}`;
  const cached = _iconCache.get(cacheKey);
  if (cached) return cached;

  const s   = iconPx(zoom);
  const cx  = s / 2;
  const sw  = Math.max(1.5, s / 14);
  const swOuter = sw * 3.5;
  const swInner = sw * 1.5;
  const pad = Math.ceil(swOuter / 2);
  const fill  = `#${fillColor || "888888"}`;
  let svgBody: string;
  let totalH: number;
  let anchorY: number;

  if (isRail) {
    const w  = Math.round(s * 0.52);
    const bH = Math.round(s * 1.15);
    const nH = Math.round(s * 0.28);
    const rx = Math.round(w * 0.32);
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    totalH  = nH + bH + Math.ceil(pad * 2);
    anchorY = Math.round(nH + bH / 2);
    const path = [
      `M ${cx} ${pad}`,
      `L ${x1} ${nH}`,
      `L ${x1} ${nH + bH - rx}`,
      `Q ${x1} ${nH + bH} ${x1 - rx} ${nH + bH}`,
      `L ${x0 + rx} ${nH + bH}`,
      `Q ${x0} ${nH + bH} ${x0} ${nH + bH - rx}`,
      `L ${x0} ${nH}`,
      `Z`,
    ].join(" ");
    svgBody = `<svg width="${s}" height="${totalH}" viewBox="0 0 ${s} ${totalH}" xmlns="http://www.w3.org/2000/svg">
      <path d="${path}" fill="none" stroke="${headwayStroke}" stroke-width="${swOuter}" stroke-linejoin="round"/>
      <path d="${path}" fill="${fill}" stroke="${outlineColor}" stroke-width="${swInner}" stroke-linejoin="round"/>
    </svg>`;
  } else {
    const r    = Math.round(s * 0.39);
    const tip  = Math.round(s * 0.26);
    const h    = r + tip;
    const ty   = Math.round(r * r / h);
    const tx   = Math.round(r * Math.sqrt(h * h - r * r) / h);
    const cy_c = pad + h;
    const tanY = cy_c - ty;
    totalH  = Math.ceil(cy_c + r + pad);
    anchorY = Math.round(cy_c);
    const path = [
      `M ${cx} ${pad}`,
      `L ${cx + tx} ${tanY}`,
      `A ${r} ${r} 0 1 1 ${cx - tx} ${tanY}`,
      `Z`,
    ].join(" ");
    svgBody = `<svg width="${s}" height="${totalH}" viewBox="0 0 ${s} ${totalH}" xmlns="http://www.w3.org/2000/svg">
      <path d="${path}" fill="none" stroke="${headwayStroke}" stroke-width="${swOuter}" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${path}" fill="${fill}" stroke="${outlineColor}" stroke-width="${swInner}" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  const html = `<div style="transform:rotate(${rot}deg);transform-origin:${cx}px ${anchorY}px;width:${s}px;height:${totalH}px;">${svgBody}</div>`;

  const icon = L.divIcon({
    html,
    className: "",
    iconSize:      [s, totalH],
    iconAnchor:    [cx, anchorY],
    tooltipAnchor: [0, -(anchorY + 4)],
  });
  _iconCache.set(cacheKey, icon);
  return icon;
}
