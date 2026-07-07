import { Boxes, Folder, ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { readProjectFileDataUrl } from "../../blendup/projectLoader";
import type { BlendUpAsset } from "../../blendup/types";
import { assetDirectory, normalizeFolderPath, resolveThumbnailSrc } from "./utils";

export function memberColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 52%, 46%)`;
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AssetAvatars({ names, max = 4, small = false }: { names: string[]; max?: number; small?: boolean }) {
  if (names.length === 0) {
    return <span className="avatar-empty">Non assigne</span>;
  }

  const shown = names.slice(0, max);
  const extra = names.length - shown.length;

  return (
    <span className={`avatar-stack ${small ? "small" : ""}`}>
      {shown.map((name) => (
        <span className="avatar" key={name} style={{ background: memberColor(name) }} title={name}>
          {memberInitials(name)}
        </span>
      ))}
      {extra > 0 ? <span className="avatar more">+{extra}</span> : null}
    </span>
  );
}

export function AssetVisual({
  asset,
  projectRoot,
  small = false
}: {
  asset: BlendUpAsset;
  projectRoot?: string;
  small?: boolean;
}) {
  const thumbnailPath = asset.paths.thumbnail;
  const thumbnail = resolveThumbnailSrc(thumbnailPath, projectRoot, asset.updatedAt);
  const [fallbackThumbnail, setFallbackThumbnail] = useState("");
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  useEffect(() => {
    setFallbackThumbnail("");
    setThumbnailFailed(false);
  }, [asset.id, asset.updatedAt, projectRoot, thumbnailPath]);

  const loadFallbackThumbnail = async () => {
    if (!projectRoot || !thumbnailPath) {
      setThumbnailFailed(true);
      return;
    }

    try {
      const dataUrl = await readProjectFileDataUrl(projectRoot, thumbnailPath);
      if (dataUrl) {
        setFallbackThumbnail(dataUrl);
        setThumbnailFailed(false);
      } else {
        setThumbnailFailed(true);
      }
    } catch {
      setThumbnailFailed(true);
    }
  };

  const source = thumbnailFailed ? "" : fallbackThumbnail || thumbnail;

  if (source) {
    return (
      <span className={`asset-visual ${small ? "small" : ""}`}>
        <img
          alt=""
          onError={() => {
            if (fallbackThumbnail) {
              setThumbnailFailed(true);
              return;
            }
            void loadFallbackThumbnail();
          }}
          src={source}
        />
      </span>
    );
  }

  return (
    <span className={`asset-visual ${small ? "small" : ""} type-${asset.type}`}>
      {asset.type === "texture" || asset.type === "ui_image" ? <ImageIcon size={small ? 14 : 28} /> : <Boxes size={small ? 14 : 28} />}
    </span>
  );
}

export function FolderPreview({
  assets,
  folderPath,
  projectRoot
}: {
  assets: BlendUpAsset[];
  folderPath: string;
  projectRoot?: string;
}) {
  const normalizedFolder = normalizeFolderPath(folderPath);
  const thumbnails = assets
    .filter((asset) => {
      const directory = assetDirectory(asset);
      return directory === normalizedFolder || directory.startsWith(`${normalizedFolder}/`);
    })
    .map((asset) => resolveThumbnailSrc(asset.paths.thumbnail, projectRoot, asset.updatedAt))
    .filter(Boolean)
    .slice(0, 4);

  if (thumbnails.length === 0) {
    return (
      <span className="folder-preview empty">
        <Folder size={22} />
      </span>
    );
  }

  return (
    <span className={`folder-preview count-${thumbnails.length}`}>
      {thumbnails.map((thumbnail, index) => (
        <img alt="" key={`${thumbnail}-${index}`} src={thumbnail} />
      ))}
    </span>
  );
}
