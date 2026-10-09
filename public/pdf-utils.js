let logoDataUrl = null;
let logoAspectRatio = null;

function prepareLogoForPdf(){
  const img = document.getElementById('logoForPdf');
  if(!img) return;
  const toDataUrl = () => {
    try{
      if(!img.naturalWidth) return;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      logoDataUrl = canvas.toDataURL('image/png');
      logoAspectRatio = img.naturalWidth / img.naturalHeight;
    }catch(e){
      logoDataUrl = null;
    }
  };
  if(img.complete && img.naturalWidth){
    toDataUrl();
  }else{
    img.addEventListener('load', toDataUrl);
  }
}
function toPdfText(value){
  if(value === null || value === undefined) return value;
  return String(value).replace(/μ/g, '\u00B5');
}

function buildPdf(rows, codigo){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  let y = 54;

  if(logoDataUrl && logoAspectRatio){
    const logoH = 40;
    const logoW = logoH * logoAspectRatio;
    doc.addImage(logoDataUrl, 'PNG', marginX, 26, logoW, logoH);
    y = 26 + logoH + 24;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 40, 38);
  doc.text('Resultados do Ensaio de Proficiência', marginX, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(95, 107, 103);
  doc.text(`Código do participante: ${toPdfText(codigo)}`, marginX, y);
  y += 14;
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, marginX, y);
  y += 22;
  const sections = [];
  let current = null;
  rows.slice(1).forEach(([sec, label, value]) => {
    const secName = toPdfText(sec);
    if (!current || current.name !== secName) {
      current = { name: secName, items: [] };
      sections.push(current);
    }
    current.items.push([toPdfText(label), value && String(value).trim() !== '' ? toPdfText(value) : '—']);
  });

  sections.forEach(sec => {
    if (y > 760) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(31, 111, 99);
    doc.text(sec.name, marginX, y);
    y += 8;

    doc.autoTable({
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Campo', 'Valor']],
      body: sec.items,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: [30, 42, 46], lineColor: [220, 225, 220] },
      headStyles: { fillColor: [31, 111, 99], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 244] },
      columnStyles: { 0: { cellWidth: 230 }, 1: { cellWidth: 'auto' } }
    });
    y = doc.lastAutoTable.finalY + 26;
  });

  return doc;
}
