/**
 * The ribbon "K" (same drawing as the favicon in scripts/build-favicons.mjs), coloured by the theme's --k-* variables
 * so it switches with the theme.
 */
const stop = (offset: number, variable: string) => <stop offset={offset} style={{ stopColor: `var(${variable})` }} />;

export default function KLogo({ size = 32 }: { size?: number }) {
  return (
    <svg className="k-logo" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="k-logo-bar" x1="7.6" y1="0" x2="13.3" y2="0" gradientUnits="userSpaceOnUse">{stop(0, '--k-bright')}{stop(0.55, '--k-mid')}{stop(1, '--k-dark')}</linearGradient>
        <linearGradient id="k-logo-arm" x1="14.6" y1="15.4" x2="20.4" y2="4.6" gradientUnits="userSpaceOnUse">{stop(0, '--k-deep')}{stop(0.45, '--k-dark')}{stop(1, '--k-bright')}</linearGradient>
        <linearGradient id="k-logo-leg" x1="14.4" y1="13.6" x2="23.6" y2="29.2" gradientUnits="userSpaceOnUse">{stop(0, '--k-bright')}{stop(0.6, '--k-mid')}{stop(1, '--k-dark')}</linearGradient>
      </defs>
      <rect width="32" height="32" rx="3.5" fill="var(--k-background)" />
      <path d="M18.28 3.8H23.88L16.1 16.5 13.28 12.2V11.6Z" fill="url(#k-logo-arm)" />
      <path d="M7.56 3.8H13.28V28.6Q10.3 28.6 7.56 28.88Z" fill="url(#k-logo-bar)" />
      <path d="M13.28 12L24.44 28.8Q21.2 28.62 17.96 28.6L13.28 21.2Z" fill="url(#k-logo-leg)" />
    </svg>
  );
}
