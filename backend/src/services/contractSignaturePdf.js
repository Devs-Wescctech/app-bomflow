import { PDFDocument } from 'pdf-lib';

const mm = (value) => value * 72 / 25.4;
const placement = (page, x, top, width, height) => ({ page, x, top, width, height });

export const CONTRACT_SIGNATURE_LAYOUTS = Object.freeze({
  bom_auto: [placement(7, 103, 245, 84, 18)],
  bom_corp: [placement(11, 112, 244, 76, 18)],
  bom_ideal: [placement(16, 121, 219, 76, 17)],
  bom_med: [placement(6, 105, 235, 82, 20)],
  bom_familia: [
    placement(15, 105, 203, 82, 17),
    placement(17, 121, 268, 76, 9),
    placement(18, 112, 250, 82, 10),
    placement(19, 112, 253, 82, 10),
  ],
  bom_familia_portabilidade: [placement(15, 105, 226, 82, 18)],
  essencial: [
    placement(5, 121, 258, 76, 17),
    placement(14, 121, 229, 76, 17),
  ],
  perola: [placement(7, 121, 245, 76, 18)],
  rubi: [placement(7, 121, 245, 76, 18)],
  safira: [placement(10, 121, 235, 76, 18)],
  topazio: [placement(10, 121, 238, 76, 18)],
  total_mais_bom_farma: [
    placement(12, 121, 237, 76, 18),
    placement(18, 121, 246, 76, 18),
    placement(20, 121, 246, 76, 18),
  ],
  bom_pet: [placement(7, 105, 225, 82, 17)],
  bom_pet_saude_individual: [
    placement(4, 128, 249, 74, 18),
    placement(10, 105, 191, 82, 18),
  ],
  bom_pet_saude_3pets: [placement(10, 105, 191, 82, 18)],
  combo_multi_bem_estar: [
    placement(1, 128, 270, 74, 12),
    placement(8, 121, 222, 76, 18),
    placement(9, 128, 270, 74, 12),
    placement(16, 121, 230, 76, 18),
    placement(17, 121, 251, 76, 18),
  ],
  novo_combo_multi_bem_estar: [
    placement(1, 128, 270, 74, 12),
    placement(8, 121, 222, 76, 18),
    placement(9, 128, 270, 74, 12),
    placement(16, 121, 230, 76, 18),
    placement(17, 121, 244, 76, 16),
    placement(18, 112, 233, 82, 16),
    placement(19, 112, 243, 82, 16),
  ],
  combo_multi_selecao: [
    placement(1, 128, 270, 74, 12),
    placement(8, 121, 222, 76, 18),
    placement(9, 128, 270, 74, 12),
    placement(16, 121, 222, 76, 18),
  ],
  convalescenca: [placement(1, 112, 253, 76, 16)],
});

export async function applyContractSignature(pdfBuffer, signatureBuffer, productKey) {
  const layouts = CONTRACT_SIGNATURE_LAYOUTS[productKey];
  if (!layouts?.length) {
    const error = new Error('O posicionamento da assinatura ainda não foi mapeado para este produto.');
    error.statusCode = 422;
    throw error;
  }
  const pdf = await PDFDocument.load(pdfBuffer);
  const image = await pdf.embedPng(signatureBuffer);
  const pages = pdf.getPages();
  for (const layout of layouts) {
    const page = pages[layout.page - 1];
    if (!page) continue;
    const boxWidth = mm(layout.width);
    const boxHeight = mm(layout.height);
    const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {
      x: mm(layout.x) + (boxWidth - width) / 2,
      y: page.getHeight() - mm(layout.top) - height,
      width,
      height,
    });
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
