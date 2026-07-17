import logoUrl from "../assets/blendup-logo.svg";

export function BrandLogo({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand-mark${large ? " large" : ""}`}>
      <img alt="" aria-hidden="true" src={logoUrl} />
    </span>
  );
}
