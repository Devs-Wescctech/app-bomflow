import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROPOSALS_DIR = path.join(__dirname, '../../public/proposals');
const LOGO_PATH = path.join(__dirname, '../../public/logo-bompastor.png');

if (!fs.existsSync(PROPOSALS_DIR)) {
  fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
}

function parseJsonField(field) {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  if (typeof field === 'string') {
    try {
      const parsed = JSON.parse(field);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') {
    return { r: 0, g: 102, b: 204 };
  }
  
  let cleanHex = hex.replace('#', '');
  
  // Support 3-digit hex
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 102, b: 204 };
}

function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function lightenColor(hex, percent) {
  const rgb = hexToRgb(hex);
  const factor = percent / 100;
  return {
    r: Math.min(255, Math.round(rgb.r + (255 - rgb.r) * factor)),
    g: Math.min(255, Math.round(rgb.g + (255 - rgb.g) * factor)),
    b: Math.min(255, Math.round(rgb.b + (255 - rgb.b) * factor))
  };
}

export async function generateProposalPDF(template, lead, agent) {
  return new Promise((resolve, reject) => {
    try {
      const fileName = `proposta_${lead.id}_${Date.now()}.pdf`;
      const filePath = path.join(PROPOSALS_DIR, fileName);
      
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const stream = fs.createWriteStream(filePath);
      
      doc.pipe(stream);
      
      const primaryColor = template.color_primary || template.colorPrimary || '#0066cc';
      const productName = template.product_name || template.productName || template.name;
      const price = parseFloat(template.price) || 0;
      const features = parseJsonField(template.features);
      const terms = parseJsonField(template.terms);
      const validityDays = template.validity_days || template.validityDays || 7;
      const paymentMethods = template.payment_methods || template.paymentMethods || '';
      const paymentDueDay = template.payment_due_day || template.paymentDueDay || 10;
      
      const leadName = lead.name || lead.full_name || lead.contact_name || 'Cliente';
      const leadPhone = lead.phone || lead.cell_phone || lead.whatsapp || '';
      const leadEmail = lead.email || '';
      const leadCpf = lead.cpf || '';
      const agentName = agent?.name || agent?.full_name || 'Consultor';
      const agentPhone = agent?.phone || '';
      const agentEmail = agent?.email || '';
      
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + validityDays);
      
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 40;
      const contentWidth = pageWidth - (margin * 2);
      
      // ==================== HEADER ====================
      const headerHeight = 100;
      doc.rect(0, 0, pageWidth, headerHeight).fill(primaryColor);
      
      // Gradient overlay effect
      const lightColor = lightenColor(primaryColor, 30);
      doc.rect(0, 0, pageWidth * 0.4, headerHeight)
         .fill(`rgb(${lightColor.r}, ${lightColor.g}, ${lightColor.b})`);
      
      // Logo
      if (fs.existsSync(LOGO_PATH)) {
        try {
          doc.image(LOGO_PATH, margin, 20, { height: 60 });
        } catch (e) {
          console.log('Could not load logo:', e.message);
        }
      }
      
      // Header title
      doc.fillColor('white')
         .fontSize(24)
         .font('Helvetica-Bold')
         .text('PROPOSTA COMERCIAL', pageWidth / 2 - 100, 35, { width: 250, align: 'center' });
      
      // Proposal number
      const proposalNumber = `#${Date.now().toString().slice(-6)}`;
      doc.fontSize(10)
         .font('Helvetica')
         .text(`Proposta ${proposalNumber}`, pageWidth - margin - 120, 25, { width: 120, align: 'right' });
      
      doc.text(`${new Date().toLocaleDateString('pt-BR')}`, pageWidth - margin - 120, 40, { width: 120, align: 'right' });
      
      // ==================== PRODUCT HIGHLIGHT ====================
      const productBoxY = headerHeight + 20;
      const productBoxHeight = 70;
      
      doc.roundedRect(margin, productBoxY, contentWidth, productBoxHeight, 8)
         .fillAndStroke('#f8fafc', '#e2e8f0');
      
      doc.fillColor(primaryColor)
         .fontSize(11)
         .font('Helvetica-Bold')
         .text('PRODUTO / SERVICO', margin + 20, productBoxY + 15);
      
      doc.fillColor('#1e293b')
         .fontSize(18)
         .font('Helvetica-Bold')
         .text(productName, margin + 20, productBoxY + 35, { width: contentWidth - 40 });
      
      // ==================== CLIENT & CONSULTANT INFO ====================
      const infoY = productBoxY + productBoxHeight + 20;
      const infoBoxWidth = (contentWidth - 20) / 2;
      const infoBoxHeight = 110;
      
      // Client box
      doc.roundedRect(margin, infoY, infoBoxWidth, infoBoxHeight, 8)
         .fillAndStroke('#ffffff', '#e2e8f0');
      
      doc.roundedRect(margin, infoY, infoBoxWidth, 28, 8)
         .fill(primaryColor);
      doc.rect(margin, infoY + 20, infoBoxWidth, 8).fill(primaryColor);
      
      doc.fillColor('white')
         .fontSize(11)
         .font('Helvetica-Bold')
         .text('DADOS DO CLIENTE', margin + 15, infoY + 8);
      
      let clientY = infoY + 40;
      doc.fillColor('#475569').fontSize(10).font('Helvetica');
      
      doc.font('Helvetica-Bold').text('Nome:', margin + 15, clientY);
      doc.font('Helvetica').text(truncateText(leadName, 30), margin + 60, clientY);
      clientY += 18;
      
      if (leadPhone) {
        doc.font('Helvetica-Bold').text('Telefone:', margin + 15, clientY);
        doc.font('Helvetica').text(truncateText(leadPhone, 20), margin + 70, clientY);
        clientY += 18;
      }
      
      if (leadEmail) {
        doc.font('Helvetica-Bold').text('E-mail:', margin + 15, clientY);
        doc.font('Helvetica').text(truncateText(leadEmail, 28), margin + 60, clientY);
        clientY += 18;
      }
      
      if (leadCpf) {
        doc.font('Helvetica-Bold').text('CPF:', margin + 15, clientY);
        doc.font('Helvetica').text(truncateText(leadCpf, 18), margin + 50, clientY);
      }
      
      // Consultant box
      const consultantX = margin + infoBoxWidth + 20;
      doc.roundedRect(consultantX, infoY, infoBoxWidth, infoBoxHeight, 8)
         .fillAndStroke('#ffffff', '#e2e8f0');
      
      doc.roundedRect(consultantX, infoY, infoBoxWidth, 28, 8)
         .fill('#64748b');
      doc.rect(consultantX, infoY + 20, infoBoxWidth, 8).fill('#64748b');
      
      doc.fillColor('white')
         .fontSize(11)
         .font('Helvetica-Bold')
         .text('CONSULTOR RESPONSAVEL', consultantX + 15, infoY + 8);
      
      let consultantY = infoY + 40;
      doc.fillColor('#475569').fontSize(10).font('Helvetica');
      
      doc.font('Helvetica-Bold').text('Nome:', consultantX + 15, consultantY);
      doc.font('Helvetica').text(truncateText(agentName, 30), consultantX + 60, consultantY);
      consultantY += 18;
      
      if (agentPhone) {
        doc.font('Helvetica-Bold').text('Telefone:', consultantX + 15, consultantY);
        doc.font('Helvetica').text(truncateText(agentPhone, 20), consultantX + 70, consultantY);
        consultantY += 18;
      }
      
      if (agentEmail) {
        doc.font('Helvetica-Bold').text('E-mail:', consultantX + 15, consultantY);
        doc.font('Helvetica').text(truncateText(agentEmail, 28), consultantX + 60, consultantY);
      }
      
      // ==================== PRICE BOX ====================
      const priceY = infoY + infoBoxHeight + 20;
      const priceBoxHeight = 80;
      
      doc.roundedRect(margin, priceY, contentWidth, priceBoxHeight, 8)
         .fill(primaryColor);
      
      // Price highlight
      doc.fillColor('white')
         .fontSize(12)
         .font('Helvetica')
         .text('INVESTIMENTO MENSAL', margin + 30, priceY + 15);
      
      doc.fontSize(36)
         .font('Helvetica-Bold')
         .text(`R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + 30, priceY + 35);
      
      // Payment info on right
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor('rgba(255,255,255,0.9)');
      
      if (paymentMethods) {
        doc.text(`Pagamento: ${paymentMethods}`, pageWidth - margin - 180, priceY + 25, { width: 150, align: 'right' });
      }
      doc.text(`Vencimento: dia ${paymentDueDay}`, pageWidth - margin - 180, priceY + 45, { width: 150, align: 'right' });
      
      // ==================== FEATURES ====================
      let currentY = priceY + priceBoxHeight + 25;
      const maxFeatures = 8; // Limit to prevent overflow
      const displayFeatures = features.slice(0, maxFeatures);
      
      if (displayFeatures.length > 0) {
        doc.fillColor(primaryColor)
           .fontSize(13)
           .font('Helvetica-Bold')
           .text('BENEFICIOS INCLUSOS', margin, currentY);
        
        currentY += 25;
        
        const featureColWidth = (contentWidth - 20) / 2;
        let featureY = currentY;
        let colIndex = 0;
        
        displayFeatures.forEach((feature, idx) => {
          const xPos = margin + (colIndex * (featureColWidth + 20));
          
          // Professional checkmark icon with gradient effect
          const cx = xPos + 8;
          const cy = featureY + 6;
          const r = 8;
          
          // Outer circle with shadow effect
          doc.circle(cx + 0.5, cy + 0.5, r).fill('#059669');
          doc.circle(cx, cy, r).fill('#10b981');
          
          // Inner checkmark path (vector drawing)
          doc.save()
             .translate(cx - 5, cy - 4)
             .path('M2.5 5.5 L4.5 7.5 L8.5 2.5')
             .lineWidth(2)
             .strokeColor('white')
             .stroke()
             .restore();
          
          doc.fillColor('#334155')
             .fontSize(10)
             .font('Helvetica')
             .text(truncateText(feature, 45), xPos + 22, featureY, { width: featureColWidth - 30 });
          
          if (colIndex === 0) {
            colIndex = 1;
          } else {
            colIndex = 0;
            featureY += 25;
          }
        });
        
        currentY = featureY + (colIndex === 1 ? 25 : 0) + 20;
      }
      
      // ==================== DESCRIPTION ====================
      if (template.description) {
        doc.fillColor(primaryColor)
           .fontSize(13)
           .font('Helvetica-Bold')
           .text('DESCRICAO', margin, currentY);
        
        currentY += 20;
        
        doc.fillColor('#475569')
           .fontSize(10)
           .font('Helvetica')
           .text(template.description, margin, currentY, { width: contentWidth });
        
        currentY += doc.heightOfString(template.description, { width: contentWidth }) + 20;
      }
      
      // ==================== TERMS ====================
      const maxTerms = 5; // Limit to prevent overflow
      const displayTerms = terms.slice(0, maxTerms);
      if (displayTerms.length > 0 && currentY < pageHeight - 150) {
        doc.fillColor('#64748b')
           .fontSize(11)
           .font('Helvetica-Bold')
           .text('TERMOS E CONDICOES', margin, currentY);
        
        currentY += 18;
        
        doc.fontSize(8).font('Helvetica').fillColor('#94a3b8');
        
        displayTerms.forEach((term, idx) => {
          if (currentY < pageHeight - 100) {
            doc.text(`${idx + 1}. ${truncateText(term, 100)}`, margin, currentY, { width: contentWidth });
            currentY += 14;
          }
        });
      }
      
      // ==================== VALIDITY BADGE ====================
      const validityY = Math.min(currentY + 15, pageHeight - 130);
      
      doc.roundedRect(margin, validityY, 200, 30, 5)
         .fillAndStroke('#fef3c7', '#f59e0b');
      
      doc.fillColor('#92400e')
         .fontSize(10)
         .font('Helvetica-Bold')
         .text(`Valida ate: ${validUntil.toLocaleDateString('pt-BR')}`, margin + 15, validityY + 10);
      
      // ==================== FOOTER ====================
      const footerY = pageHeight - 50;
      
      doc.rect(0, footerY - 10, pageWidth, 60).fill('#f1f5f9');
      
      doc.fillColor('#64748b')
         .fontSize(8)
         .font('Helvetica')
         .text('Bom Flow CRM - Sistema de Gestao de Relacionamento', margin, footerY, { align: 'center', width: contentWidth });
      
      doc.text(`Documento gerado em ${new Date().toLocaleDateString('pt-BR')} as ${new Date().toLocaleTimeString('pt-BR')}`, margin, footerY + 12, { align: 'center', width: contentWidth });
      
      doc.text('Este documento e uma proposta comercial e nao representa contrato.', margin, footerY + 24, { align: 'center', width: contentWidth });
      
      doc.end();
      
      stream.on('finish', () => {
        resolve({
          filePath,
          fileName,
          publicUrl: `/proposals/${fileName}`
        });
      });
      
      stream.on('error', reject);
      
    } catch (error) {
      reject(error);
    }
  });
}

export async function generateManualProposalPDF(formData, lead, agent) {
  return new Promise((resolve, reject) => {
    try {
      const fileName = `proposta_${lead.id}_${Date.now()}.pdf`;
      const filePath = path.join(PROPOSALS_DIR, fileName);

      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const primaryColor = '#1a56db';
      const textDark = '#1e293b';
      const textMid = '#374151';
      const borderColor = '#cbd5e1';

      const clientName = (formData.clientName || lead.nome_fantasia || lead.razao_social || lead.contact_name || lead.name || 'Cliente').toString();
      const clientPhone = (formData.clientPhone || lead.phone || lead.contact_phone || '').toString();
      let productNames = [];
      if (Array.isArray(formData.products) && formData.products.length > 0) {
        productNames = formData.products
          .filter((p) => {
            const preco = parseFloat(p && p.price) || 0;
            return Math.abs(preco - 0.01) >= 0.005;
          })
          .map((p) => (p && (p.name || p.productName) ? (p.name || p.productName).toString() : ''))
          .filter((n) => n.trim());
      } else if (formData.productName) {
        productNames = [formData.productName.toString()];
      }
      const description = (formData.description || '').toString();
      const planValue = (formData.planValue || '').toString();
      const observations = (formData.observations || '').toString();

      let validUntilText = '';
      if (formData.validUntil) {
        const d = new Date(formData.validUntil);
        validUntilText = isNaN(d.getTime())
          ? String(formData.validUntil)
          : d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      }

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 50;
      const contentWidth = pageWidth - margin * 2;

      // ==================== TOPO AZUL ====================
      const topBarH = 8;
      doc.rect(0, 0, pageWidth, topBarH).fill(primaryColor);

      // ==================== HEADER ====================
      let currentY = topBarH + 20;

      // Logo: imagem real (212×103 original → exibida com height=50)
      const logoHeight = 50;
      if (fs.existsSync(LOGO_PATH)) {
        try {
          doc.image(LOGO_PATH, margin, currentY, { height: logoHeight });
        } catch (e) { /* ignore */ }
      }

      doc.fillColor(primaryColor)
         .fontSize(22)
         .font('Helvetica-Bold')
         .text('PROPOSTA COMERCIAL', margin, currentY + (logoHeight / 2) - 11, { width: contentWidth, align: 'right' });

      currentY += logoHeight + 14;

      doc.moveTo(margin, currentY)
         .lineTo(margin + contentWidth, currentY)
         .lineWidth(1)
         .strokeColor(primaryColor)
         .stroke();

      currentY += 10;

      if (validUntilText) {
        doc.fillColor(textMid)
           .fontSize(10)
           .font('Helvetica')
           .text(`Proposta válida até: ${validUntilText}`, margin, currentY, { width: contentWidth, align: 'right' });
        currentY += 18;
      }

      currentY += 14;

      // ==================== HELPERS ====================
      const drawSectionTitle = (title, withMarker = true) => {
        if (withMarker) {
          doc.rect(margin, currentY + 3, 6, 12).fill(primaryColor);
          doc.fillColor(textDark)
             .fontSize(11)
             .font('Helvetica-Bold')
             .text(title, margin + 14, currentY);
        } else {
          doc.fillColor(textDark)
             .fontSize(11)
             .font('Helvetica-Bold')
             .text(title, margin, currentY);
        }
        currentY += 18;
        doc.moveTo(margin, currentY)
           .lineTo(margin + contentWidth, currentY)
           .lineWidth(0.5)
           .strokeColor(borderColor)
           .stroke();
        currentY += 12;
      };

      const drawField = (label, value, multiline = false) => {
        doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold');
        doc.text(label.toUpperCase(), margin, currentY, { characterSpacing: 0.4 });
        currentY += 14;
        const displayValue = value && value.trim() ? value : '';
        doc.fillColor(textDark).fontSize(11).font('Helvetica');
        if (multiline) {
          const h = displayValue ? doc.heightOfString(displayValue, { width: contentWidth }) : 14;
          if (displayValue) doc.text(displayValue, margin, currentY, { width: contentWidth });
          currentY += h + 6;
        } else {
          if (displayValue) doc.text(displayValue, margin, currentY, { width: contentWidth });
          currentY += 16;
        }
        doc.moveTo(margin, currentY)
           .lineTo(margin + contentWidth, currentY)
           .lineWidth(0.5)
           .strokeColor(borderColor)
           .stroke();
        currentY += 16;
      };

      // ==================== DADOS DO CLIENTE ====================
      drawSectionTitle('DADOS DO CLIENTE');
      drawField('Nome do Cliente', clientName);
      drawField('Telefone', clientPhone);

      currentY += 6;

      // ==================== SERVIÇO CONTRATADO ====================
      drawSectionTitle('SERVIÇO CONTRATADO');
      const productsText = productNames.length > 0
        ? productNames.join('\n')
        : '';
      drawField('Produtos / Serviços', productsText, true);
      drawField('Descrição resumida', description, true);

      currentY += 6;

      // ==================== VALORES ====================
      drawSectionTitle('VALORES');
      doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold');
      doc.text('VALOR DO PLANO', margin, currentY, { characterSpacing: 0.4 });
      currentY += 14;
      doc.fillColor(primaryColor).fontSize(18).font('Helvetica-Bold');
      doc.text(planValue && planValue.trim() ? planValue : '', margin, currentY);
      currentY += 28;
      doc.moveTo(margin, currentY)
         .lineTo(margin + contentWidth, currentY)
         .lineWidth(0.5)
         .strokeColor(borderColor)
         .stroke();
      currentY += 16;

      currentY += 6;

      // ==================== OBSERVACOES ====================
      drawSectionTitle('OBSERVAÇÕES', false);
      doc.fillColor(textMid).fontSize(10).font('Helvetica');
      const obsText = observations && observations.trim() ? observations : '';
      if (obsText) {
        const obsH = doc.heightOfString(obsText, { width: contentWidth });
        doc.text(obsText, margin, currentY, { width: contentWidth });
        currentY += obsH + 16;
      } else {
        currentY += 16;
      }

      // ==================== ASSINATURA ====================
      const signatureY = Math.max(currentY + 40, pageHeight - 110);
      const sigLineW = 240;
      const sigLineX = pageWidth / 2 - sigLineW / 2;
      doc.moveTo(sigLineX, signatureY)
         .lineTo(sigLineX + sigLineW, signatureY)
         .lineWidth(1)
         .strokeColor(textMid)
         .stroke();
      doc.fillColor(textMid)
         .fontSize(10)
         .font('Helvetica')
         .text('Assinatura do Cliente', sigLineX, signatureY + 7, { width: sigLineW, align: 'center' });

      // ==================== RODAPE ====================
      const footerY = pageHeight - 32;
      doc.rect(0, footerY - 8, pageWidth, 40).fill('#f8fafc');
      doc.fillColor('#94a3b8')
         .fontSize(7.5)
         .font('Helvetica')
         .text(
           `Emitido em ${new Date().toLocaleDateString('pt-BR')} · Este documento é uma proposta comercial e não constitui contrato.`,
           margin, footerY, { align: 'center', width: contentWidth }
         );

      // faixa rodapé
      doc.rect(0, pageHeight - 8, pageWidth, 8).fill(primaryColor);

      doc.end();

      stream.on('finish', () => {
        resolve({ filePath, fileName, publicUrl: `/proposals/${fileName}` });
      });
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

export function getProposalPath(fileName) {
  return path.join(PROPOSALS_DIR, fileName);
}

export function deleteProposal(fileName) {
  const filePath = path.join(PROPOSALS_DIR, fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
