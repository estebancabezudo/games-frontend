export function createSvgAssetPath(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser una ruta SVG relativa al frontend.`);
  }

  const assetPath = value.trim();
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(assetPath);
  } catch {
    throw new Error(`${path} debe ser una ruta SVG relativa válida.`);
  }

  const isAbsolute = decodedPath.startsWith("/")
    || decodedPath.startsWith("\\")
    || /^[a-z][a-z\d+.-]*:/i.test(decodedPath);
  const escapesFrontend = decodedPath.split("/").includes("..");
  const hasUnsupportedParts = decodedPath.includes("\\")
    || decodedPath.includes("?")
    || decodedPath.includes("#")
    || !decodedPath.toLowerCase().endsWith(".svg");
  if (isAbsolute || escapesFrontend || hasUnsupportedParts) {
    throw new Error(`${path} debe ser una ruta SVG relativa al frontend.`);
  }

  return assetPath;
}

export function resolveSvgAssetUrl(assetPath, baseUrl) {
  return new URL(assetPath, baseUrl).href;
}
