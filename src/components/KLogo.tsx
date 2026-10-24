/** The ribbon "K" (same drawing as the favicon, scripts/build-favicons.mjs), coloured by the theme's --k-* variables. */
export default function KLogo({ size = 32 }: { size?: number }) {
  return (
    <svg className="k-logo" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="k-logo-stem-fold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".5" /></linearGradient>
        <linearGradient id="k-logo-arm-fold" x1="0" y1="1" x2=".45" y2="0"><stop offset="0" stopColor="#000" stopOpacity=".55" /><stop offset=".7" stopColor="#000" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="32" height="32" rx="6" fill="var(--k-background)" />
      <path d="M6 2h6v26.8l-6 1.2z" fill="var(--k-stem)" />
      <path d="M10 8h2v12H9z" fill="url(#k-logo-stem-fold)" />
      <path d="M12 15 20 2h6L16.4 20z" fill="var(--k-arm)" />
      <path d="M12 15 20 2h6L16.4 20z" fill="url(#k-logo-arm-fold)" />
      <path d="M6 8h6.4L26 28.8 19.6 30z" fill="var(--k-leg)" />
    </svg>
  );
}
