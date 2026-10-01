import { Gauge, LoaderCircle, RefreshCw } from "lucide-react";
import type { UvQualitySummary } from "../../blendup/types";
import { formatTimestamp } from "./utils";

export function UvScoreBadge({ quality }: { quality?: UvQualitySummary }) {
  if (!quality) return null;
  const incomplete = !quality.complete || Boolean(quality.error);
  const appearance = quality.stale ? "stale" : quality.blocked ? "blocked" : incomplete || quality.score < quality.minimumScore ? "stale" : "good";
  return <span className={`uv-score-badge ${appearance}`} title={quality.stale ? "Score ancien, UV à revérifier" : incomplete ? "Vérification UV incomplète" : quality.blocked ? `Export bloqué : minimum ${quality.minimumScore}/100` : "Score UV"}>
    <Gauge size={12} /> UV {quality.score.toFixed(1)}{quality.stale ? " · ancien" : incomplete ? " · incomplet" : "/100"}
  </span>;
}

export function UvQualityPanel({ quality, checking, onCheck }: { quality?: UvQualitySummary; checking: boolean; onCheck: () => void }) {
  return <section className="uv-quality-panel">
    <header><div><strong>Qualité UV</strong><UvScoreBadge quality={quality} /></div>
      <button disabled={checking} onClick={onCheck} type="button">{checking ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{checking ? "Vérification…" : "Vérifier"}</button>
    </header>
    {!quality ? <p>Vérifie les UV pour obtenir un score sans modifier le fichier Blender.</p> : <>
      <p>{quality.stale ? "Le fichier ou les critères ont changé. Relance la vérification." : quality.blocked ? `Score inférieur au minimum de ${quality.minimumScore}/100, ou contrôle incomplet. L’export est bloqué.` : `Vérifié le ${formatTimestamp(quality.checkedAt)}.`}</p>
      {quality.issues.length ? <ul>{quality.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul> : null}
      {quality.preparationWarnings.length ? <ul>{quality.preparationWarnings.map((issue, i) => <li key={i}>{issue}</li>)}</ul> : null}
      <details><summary>Mesures par maillage et coutures</summary>
        {quality.objects.map((object) => <div className="uv-object-metrics" key={object.objectName}>
          <strong>{object.objectName} · {object.score.toFixed(1)}/100</strong>
          <dl><div><dt>UV valides</dt><dd>{object.validUvPercent} %</dd></div><div><dt>Sans étirement</dt><dd>{object.stretchScore}/100</dd></div><div><dt>Densité régulière</dt><dd>{object.densityScore}/100</dd></div><div><dt>Chevauchements</dt><dd>{object.overlapPercent} %</dd></div><div><dt>Coutures / coupures UV</dt><dd>{object.markedSeams} / {object.uvCuts}</dd></div><div><dt>Coutures non ouvertes</dt><dd>{object.unusedSeams}</dd></div><div><dt>Coupures non marquées</dt><dd>{object.unmarkedCuts}</dd></div></dl>
        </div>)}
      </details>
    </>}
    <small>Le score retient le maillage le plus faible. Les coutures sont un diagnostic de cohérence ; leur placement artistique n’est pas noté.</small>
  </section>;
}
