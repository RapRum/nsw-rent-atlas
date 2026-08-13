/* Shared PDF export utilities for selected-area reports. */
(function (global) {
  'use strict';

  function constructor() {
    return global.jspdf && global.jspdf.jsPDF;
  }

  function available() {
    return Boolean(constructor());
  }

  function create() {
    var JsPdf = constructor();
    return JsPdf ? new JsPdf({ unit: 'mm', format: 'a4' }) : null;
  }

  function safeFileName(value) {
    return String(value || 'report').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'report';
  }

  function header(doc, subtitle) {
    doc.setFillColor(75, 95, 211);
    doc.roundedRect(14, 14, 182, 30, 5, 5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('NSW Rent Atlas', 20, 27);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(subtitle, 20, 35);
    doc.text(new Date().toLocaleDateString('en-AU'), 190, 35, { align: 'right' });
    return 56;
  }

  function wrappedText(doc, text, x, y, width, lineHeight) {
    var lines = doc.splitTextToSize(String(text || ''), width);
    doc.text(lines, x, y);
    return y + lines.length * lineHeight;
  }

  function sectionTitle(doc, title, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(25, 38, 61);
    doc.text(title, 16, y);
    return y + 8;
  }

  function ensureSpace(doc, y, required, repeatHeader) {
    if (y + required <= 275) return y;
    doc.addPage();
    if (repeatHeader) repeatHeader();
    return 20;
  }

  function table(doc, config) {
    var x = config.x || 16;
    var y = config.y || 20;
    var widths = config.widths;
    var headers = config.headers;
    var rows = config.rows;
    var aligns = config.aligns || headers.map(function () { return 'left'; });
    var rowHeight = config.rowHeight || 11;
    var totalWidth = widths.reduce(function (sum, width) { return sum + width; }, 0);

    function drawHeader() {
      doc.setFillColor(237, 242, 248);
      doc.rect(x, y, totalWidth, 10, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(43, 56, 81);
      var cx = x;
      headers.forEach(function (label, i) {
        var tx = aligns[i] === 'right' ? cx + widths[i] - 3 : cx + 3;
        doc.text(label, tx, y + 7, { align: aligns[i] });
        cx += widths[i];
      });
      y += 10;
    }

    drawHeader();

    rows.forEach(function (row, rowIndex) {
      if (y + rowHeight > 275) {
        doc.addPage();
        y = 20;
        drawHeader();
      }
      var highlight = Boolean(row.highlight);
      if (highlight) doc.setFillColor(237, 248, 241);
      else if (rowIndex % 2) doc.setFillColor(249, 251, 253);
      else doc.setFillColor(255, 255, 255);
      doc.rect(x, y, totalWidth, rowHeight, 'F');
      doc.setFont('helvetica', highlight ? 'bold' : 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(38, 51, 76);
      var cx = x;
      row.cells.forEach(function (cell, i) {
        var tx = aligns[i] === 'right' ? cx + widths[i] - 3 : cx + 3;
        doc.text(String(cell), tx, y + 7.4, { align: aligns[i] });
        cx += widths[i];
      });
      y += rowHeight;
    });

    return y;
  }

  function callout(doc, title, text, y) {
    var lines = doc.splitTextToSize(String(text || ''), 164);
    var height = Math.max(28, 17 + lines.length * 4.5);
    if (y + height > 275) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(246, 243, 237);
    doc.roundedRect(16, y, 178, height, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(93, 73, 48);
    doc.text(title, 22, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.text(lines, 22, y + 15);
    return y + height;
  }

  function footer(doc, note) {
    var pages = doc.getNumberOfPages();
    for (var i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      doc.setDrawColor(224, 229, 239);
      doc.line(16, 282, 194, 282);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(103, 117, 141);
      doc.text(note, 16, 288);
      doc.text('Page ' + i + ' of ' + pages, 194, 288, { align: 'right' });
    }
  }

  global.ATLAS_PDF = {
    available: available,
    create: create,
    safeFileName: safeFileName,
    header: header,
    wrappedText: wrappedText,
    sectionTitle: sectionTitle,
    ensureSpace: ensureSpace,
    table: table,
    callout: callout,
    footer: footer
  };
}(window));
