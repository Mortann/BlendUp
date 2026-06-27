using System.IO;
using UnityEngine;

namespace BlendUp.Unity.Editor
{
    /// <summary>
    /// Localisation du projet BlendUp et conversion des chemins relatifs au root
    /// projet vers des chemins AssetDatabase Unity.
    /// </summary>
    public static class BlendUpPaths
    {
        public const string BlendupDirName = ".blendup";

        /// <summary>Remonte depuis le dossier Unity jusqu'a un parent contenant .blendup/project.json.</summary>
        public static string FindProjectRoot()
        {
            var dir = new DirectoryInfo(Application.dataPath); // &lt;root&gt;/Unity/Assets
            while (dir != null)
            {
                var candidate = Path.Combine(dir.FullName, BlendupDirName, "project.json");
                if (File.Exists(candidate))
                {
                    return dir.FullName;
                }

                dir = dir.Parent;
            }

            return null;
        }

        public static string BlendupDir(string root) => Path.Combine(root, BlendupDirName);

        public static string AssetsDir(string root) => Path.Combine(root, BlendupDirName, "assets");

        public static string LogsDir(string root) => Path.Combine(root, BlendupDirName, "logs");

        /// <summary>
        /// Convertit un chemin relatif au root projet (ex "Unity/Assets/Models/x.fbx")
        /// en chemin AssetDatabase ("Assets/Models/x.fbx"). Retourne null si hors du projet Unity.
        /// </summary>
        public static string ToUnityAssetPath(string root, string rootRelativePath)
        {
            if (string.IsNullOrEmpty(rootRelativePath))
            {
                return null;
            }

            var absolute = Path.GetFullPath(Path.Combine(root, rootRelativePath.Replace('\\', '/')));
            var unityProjectDir = Path.GetFullPath(Directory.GetParent(Application.dataPath).FullName); // &lt;root&gt;/Unity

            if (!absolute.StartsWith(unityProjectDir))
            {
                return null;
            }

            var rel = absolute.Substring(unityProjectDir.Length).Replace('\\', '/').TrimStart('/');
            return rel; // "Assets/..."
        }
    }
}
