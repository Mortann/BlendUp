using System;
using System.Globalization;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace BlendUp.Unity.Editor
{
    /// <summary>
    /// Lecture/ecriture JSON alignee sur le backend (cles triees, indentation 2
    /// espaces, fins de ligne LF, retour ligne final) pour eviter des diffs Git
    /// parasites quand l'app, l'add-on et Unity ecrivent les memes fiches.
    /// L'usage de JObject preserve tous les champs inconnus (pas de perte au round-trip).
    /// </summary>
    public static class BlendUpJson
    {
        public static JObject ReadObject(string path)
        {
            return JObject.Parse(File.ReadAllText(path));
        }

        public static void WriteObject(string path, JObject obj)
        {
            var sorted = SortToken(obj);

            string json;
            using (var sw = new StringWriter())
            {
                using (var jw = new JsonTextWriter(sw)
                {
                    Formatting = Formatting.Indented,
                    Indentation = 2,
                    IndentChar = ' '
                })
                {
                    sorted.WriteTo(jw);
                }

                json = sw.ToString();
            }

            json = json.Replace("\r\n", "\n");

            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
            }

            File.WriteAllText(path, json + "\n");
        }

        public static void AppendJsonLine(string path, JObject entry)
        {
            var sorted = SortToken(entry);
            var line = sorted.ToString(Formatting.None).Replace("\r\n", "\n");

            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
            }

            File.AppendAllText(path, line + "\n");
        }

        public static string NowIso()
        {
            return DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);
        }

        private static JToken SortToken(JToken token)
        {
            switch (token)
            {
                case JObject obj:
                    var result = new JObject();
                    foreach (var property in obj.Properties().OrderBy(p => p.Name, StringComparer.Ordinal))
                    {
                        result.Add(property.Name, SortToken(property.Value));
                    }

                    return result;
                case JArray array:
                    var sortedArray = new JArray();
                    foreach (var item in array)
                    {
                        sortedArray.Add(SortToken(item));
                    }

                    return sortedArray;
                default:
                    return token.DeepClone();
            }
        }
    }
}
