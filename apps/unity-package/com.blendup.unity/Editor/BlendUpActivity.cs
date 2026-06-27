using System.IO;
using Newtonsoft.Json.Linq;

namespace BlendUp.Unity.Editor
{
    /// <summary>Ajout d'entrees au journal d'activite .blendup/logs/activity.jsonl.</summary>
    public static class BlendUpActivity
    {
        public static void Append(string root, string actor, string type, string assetId, string message)
        {
            var entry = new JObject
            {
                ["time"] = BlendUpJson.NowIso(),
                ["actor"] = actor,
                ["type"] = type,
                ["assetId"] = assetId,
                ["message"] = message
            };

            BlendUpJson.AppendJsonLine(Path.Combine(BlendUpPaths.LogsDir(root), "activity.jsonl"), entry);
        }
    }
}
