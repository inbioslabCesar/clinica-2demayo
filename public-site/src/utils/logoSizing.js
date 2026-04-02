export function resolvePublicLogoSize(sizeOption) {
  const key = String(sizeOption || '').trim().toLowerCase()
  const sizes = {
    sm: {
      header: 52,
      landingHeader: 40,
      hero: 56,
      feature: 32,
      footerFrame: 48,
      footerImage: 40,
      decorative: 112,
    },
    md: {
      header: 64,
      landingHeader: 48,
      hero: 64,
      feature: 40,
      footerFrame: 56,
      footerImage: 48,
      decorative: 128,
    },
    lg: {
      header: 84,
      landingHeader: 64,
      hero: 88,
      feature: 52,
      footerFrame: 72,
      footerImage: 64,
      decorative: 160,
    },
    xl: {
      header: 104,
      landingHeader: 76,
      hero: 112,
      feature: 64,
      footerFrame: 88,
      footerImage: 80,
      decorative: 192,
    },
  }
  return sizes[key] || sizes.md
}