import logo from '@sakura/brand/logo.jpg';
export const sakuraLogo = logo;
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={'sakura-brand' + (compact ? ' compact' : '')}>
      <img src={logo} alt="Sakura Ribbon — Silk Made Strong" width="1080" height="1080" />
      <span>KHÔNG GIAN LÀM VIỆC</span>
    </div>
  );
}
