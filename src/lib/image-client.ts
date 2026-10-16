/** Reduz a imagem no navegador (lado máx. `maxSide`, JPEG) e devolve base64 sem prefixo. */
export async function compressImage(file: File, maxSide = 1800): Promise<{ mimeType: string; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return { mimeType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}
