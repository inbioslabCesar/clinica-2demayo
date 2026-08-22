const MEDICO_COLOR_TOKENS = [
  { accent: "#1d4ed8", soft: "rgba(29, 78, 216, 0.14)" },
  { accent: "#0f766e", soft: "rgba(15, 118, 110, 0.14)" },
  { accent: "#be123c", soft: "rgba(190, 18, 60, 0.14)" },
  { accent: "#6d28d9", soft: "rgba(109, 40, 217, 0.14)" },
  { accent: "#0369a1", soft: "rgba(3, 105, 161, 0.14)" },
  { accent: "#15803d", soft: "rgba(21, 128, 61, 0.14)" },
  { accent: "#b45309", soft: "rgba(180, 83, 9, 0.14)" },
  { accent: "#4338ca", soft: "rgba(67, 56, 202, 0.14)" },
  { accent: "#c2410c", soft: "rgba(194, 65, 12, 0.14)" },
  { accent: "#a21caf", soft: "rgba(162, 28, 175, 0.14)" },
  { accent: "#0e7490", soft: "rgba(14, 116, 144, 0.14)" },
  { accent: "#4d7c0f", soft: "rgba(77, 124, 15, 0.14)" },
  { accent: "#9f1239", soft: "rgba(159, 18, 57, 0.14)" },
  { accent: "#334155", soft: "rgba(51, 65, 85, 0.14)" },
  { accent: "#7c2d12", soft: "rgba(124, 45, 18, 0.14)" },
];

function stableHashString(value) {
  const input = String(value || "");
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getTokenByMedicoName(medicoName) {
  const nombre = String(medicoName || "").trim().toLowerCase();
  if (!nombre) {
    return { accent: "#64748b", soft: "rgba(100, 116, 139, 0.14)" };
  }
  const idx = stableHashString(nombre) % MEDICO_COLOR_TOKENS.length;
  return MEDICO_COLOR_TOKENS[idx];
}

export function getMedicoAccentColor(medicoName) {
  return getTokenByMedicoName(medicoName).accent;
}

export function getMedicoSoftColor(medicoName) {
  return getTokenByMedicoName(medicoName).soft;
}
