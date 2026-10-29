// Capa pela foto: reduz a imagem escolhida (câmera ou galeria) para guardar no celular.
// Uma capa fica com cerca de 50 KB: dá para ler o texto da capa ampliada e ainda é leve.

const MAX_W = 480;
const MAX_H = 720;
const QUALITY = 0.75;

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Alguns navegadores não aceitam a opção; tenta pelo <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Reduz a foto para caber em maxW × maxH (sem aumentar) e devolve um data URL JPEG.
 * Usada pela capa e pelo trecho por foto (que precisa de mais detalhe para ler o texto).
 */
export async function resizePhoto(file, { maxW = MAX_W, maxH = MAX_H, quality = QUALITY } = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Escolha uma imagem.');
  const image = await loadImage(file);
  const w = image.width;
  const h = image.height;
  if (!w || !h) throw new Error('Não foi possível ler a imagem.');
  const scale = Math.min(1, maxW / w, maxH / h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}

/** Devolve a capa como data URL JPEG. */
export function photoToCover(file) {
  return resizePhoto(file);
}
