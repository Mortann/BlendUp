using System.IO;
using Newtonsoft.Json.Linq;

namespace BlendUp.Unity.Editor
{
    public static class BlendUpProject
    {
        public static JObject Load(string root)
        {
            return BlendUpJson.ReadObject(Path.Combine(BlendUpPaths.BlendupDir(root), "project.json"));
        }

        public static string Name(JObject project)
        {
            return (string)project?["name"] ?? "Projet BlendUp";
        }
    }
}
