import type { BlendUpAsset, BlendUpProblem } from "./types";

const priority = { error: 0, warning: 1, info: 2 };
export function readableError(message: string) {
  const lines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cause = [...lines].reverse().find((line) => /^(RuntimeError|ValueError|TypeError|OSError|FileNotFoundError|PermissionError):/.test(line)) ?? lines.at(-1) ?? "L’opération n’a pas abouti.";
  return cause.replace(/^(RuntimeError|ValueError|TypeError|OSError|FileNotFoundError|PermissionError):\s*/, "").slice(0, 400);
}
export function groupProblems(problems: BlendUpProblem[], assets: BlendUpAsset[], filters = { query: "", severity: "all", category: "all" }) {
  const groups = new Map<string, { id: string; asset?: BlendUpAsset; severity: BlendUpProblem["severity"]; problems: BlendUpProblem[] }>();
  const query = filters.query.trim().toLocaleLowerCase();
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  for (const problem of problems) {
    const asset = problem.assetId ? assetsById.get(problem.assetId) : undefined;
    if (filters.severity !== "all" && problem.severity !== filters.severity) continue;
    if (filters.category !== "all" && (problem.category ?? (problem.assetId ? "export" : "project")) !== filters.category) continue;
    if (query && ![asset?.name, asset?.sourcePath, problem.title, problem.detail, problem.versionLabel].some((text) => text?.toLocaleLowerCase().includes(query))) continue;
    const id = problem.assetId ?? "project";
    const group = groups.get(id) ?? { id, asset, severity: problem.severity, problems: [] };
    if (priority[problem.severity] < priority[group.severity]) group.severity = problem.severity;
    group.problems.push(problem);
    groups.set(id, group);
  }
  return [...groups.values()].map((group) => ({ ...group, problems: group.problems.sort((a, b) => priority[a.severity] - priority[b.severity]) })).sort((a, b) => priority[a.severity] - priority[b.severity] || (a.asset?.name ?? "").localeCompare(b.asset?.name ?? ""));
}
