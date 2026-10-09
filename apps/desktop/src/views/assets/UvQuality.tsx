import { Gauge, LoaderCircle, RefreshCw } from "lucide-react";
import type { UvQualitySummary } from "../../blendup/types";
import { formatTimestamp } from "./utils";

export function UvScoreBadge({ quality, ignored = false }: { quality?: UvQualitySummary; ignored?: boolean }) {
  if (ignored || quality?.ignored) return <span className="uv-score-badge ignored" title="Cet asset est exclu du contrôle UV"><Gauge size={12} /> UV · ignoré</span>;
  if (!quality) return null;
  const incomplete = !quality.complete || Boolean(quality.error);
  const appearance = quality.stale ? "stale" : quality.blocked ? "blocked" : incomplete || quality.score < quality.minimumScore ? "stale" : "good";
  return <span className={`uv-score-badge ${appearance}`} title={quality.stale ? "Score ancien, UV à revérifier" : incomplete ? "Vérification UV incomplète" : quality.blocked ? `Export bloqué : minimum ${quality.minimumScore}/100` : "Score UV"}>
    <Gauge size={12} /> UV {quality.score.toFixed(1)}{quality.stale ? " · ancien" : incomplete ? " · incomplet" : "/100"}
  </span>;
}

export function UvQualityPanel({ quality, versionLabel, checking, onCheck, ignored, onSetIgnored, saving }: { quality?: UvQualitySummary; versionLabel?: string; checking: boolean; onCheck: () => void; ignored: boolean; onSetIgnored: (ignored: boolean) => void; saving: boolean }) {
  return <section className="uv-quality-panel">
    <header><div><strong>Qualité UV{versionLabel ? ` · ${versionLabel}` : ""}</strong><UvScoreBadge quality={quality} ignored={ignored} /></div>
      <button disabled={checking || saving || ignored} onClick={onCheck} title="Vérifier l’original, les variantes et les LOD" type="button">{checking ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{checking ? "Vérification…" : "Vérifier"}</button>
    </header>
    <label className="check-field uv-ignore-option"><input type="checkbox" checked={ignored} disabled={checking || saving} onChange={(event) => onSetIgnored(event.target.checked)} /><span>{saving ? "Enregistrement…" : "Ignorer cet asset pour la vérification UV"}</span></label>
    {ignored ? <p>Le contrôle UV et son blocage à l’export sont désactivés pour cet asset, ses variantes et ses LOD.</p> : !quality ? <p>Vérifie les UV pour obtenir un score sans modifier le fichier Blender.</p> : <>
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
