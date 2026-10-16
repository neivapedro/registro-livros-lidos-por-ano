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

/** Devolve a capa como data URL JPEG. */
export async function photoToCover(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Escolha uma imagem.');
  const image = await loadImage(file);
  const w = image.width;
  const h = image.height;
  if (!w || !h) throw new Error('Não foi possível ler a imagem.');
  const scale = Math.min(1, MAX_W / w, MAX_H / h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  return canvas.toDataURL('image/jpeg', QUALITY);
}
