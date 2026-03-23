const fs = require("fs");
const path = require("path");
const config = require("../config");

const DOCS_DIR = path.join(config.DATA_DIR, "documents");
fs.mkdirSync(DOCS_DIR, { recursive: true });

/**
 * Create a PDF document from structured sections.
 * Uses pdfkit for pure-JS PDF generation (ARM64 safe).
 */
async function createPDF({ title, sections, outputPath }) {
  const PDFDocument = require("pdfkit");
  const filePath = outputPath || path.join(DOCS_DIR, `${sanitize(title)}_${Date.now()}.pdf`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Title
    doc.fontSize(22).font("Helvetica-Bold").text(title, { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    // Sections
    for (const section of sections) {
      if (section.heading) {
        doc.fontSize(14).font("Helvetica-Bold").text(section.heading);
        doc.moveDown(0.3);
      }
      if (section.body) {
        doc.fontSize(11).font("Helvetica").text(section.body, { lineGap: 3 });
        doc.moveDown(0.8);
      }
    }

    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

/**
 * Create a DOCX document from structured sections.
 * Uses the docx npm package (pure JS, ARM64 safe).
 */
async function createDOCX({ title, sections, outputPath }) {
  const docx = require("docx");
  const filePath = outputPath || path.join(DOCS_DIR, `${sanitize(title)}_${Date.now()}.docx`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const children = [];

  // Title
  children.push(new docx.Paragraph({
    children: [new docx.TextRun({ text: title, bold: true, size: 36 })],
    alignment: docx.AlignmentType.CENTER,
    spacing: { after: 300 },
  }));

  // Sections
  for (const section of sections) {
    if (section.heading) {
      children.push(new docx.Paragraph({
        children: [new docx.TextRun({ text: section.heading, bold: true, size: 26 })],
        spacing: { before: 200, after: 100 },
      }));
    }
    if (section.body) {
      // Split body by newlines for proper paragraphs
      const lines = section.body.split("\n");
      for (const line of lines) {
        children.push(new docx.Paragraph({
          children: [new docx.TextRun({ text: line, size: 22 })],
          spacing: { after: 80 },
        }));
      }
    }
  }

  const doc = new docx.Document({
    sections: [{ properties: {}, children }],
  });

  const buffer = await docx.Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Create an HTML document from structured sections.
 */
async function createHTML({ title, sections, outputPath }) {
  const filePath = outputPath || path.join(DOCS_DIR, `${sanitize(title)}_${Date.now()}.html`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}
h1{text-align:center;border-bottom:2px solid #333;padding-bottom:10px}
h2{color:#333;margin-top:25px}p{margin:5px 0}</style></head><body>`;
  html += `<h1>${esc(title)}</h1>`;
  for (const section of sections) {
    if (section.heading) html += `<h2>${esc(section.heading)}</h2>`;
    if (section.body) html += `<p>${esc(section.body).replace(/\n/g, "<br>")}</p>`;
  }
  html += `</body></html>`;
  fs.writeFileSync(filePath, html);
  return filePath;
}

async function createDocument({ type, title, sections, outputPath }) {
  title = title || "Document";
  sections = sections || [];

  switch (type) {
    case "pdf": return createPDF({ title, sections, outputPath });
    case "docx": return createDOCX({ title, sections, outputPath });
    case "html": return createHTML({ title, sections, outputPath });
    default: return createPDF({ title, sections, outputPath });
  }
}

function sanitize(name) {
  return (name || "doc").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
}

function esc(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function createExcel({ title, sheets }) {
  const ExcelJS = require("exceljs");
  const filePath = path.join(DOCS_DIR, `${sanitize(title)}_${Date.now()}.xlsx`);

  const workbook = new ExcelJS.Workbook();
  for (const sheet of (sheets || [])) {
    const ws = workbook.addWorksheet(sheet.name || "Sheet1");
    if (sheet.headers?.length) {
      ws.columns = sheet.headers.map(h => ({ header: h, key: h, width: 18 }));
    }
    for (const row of (sheet.rows || [])) {
      ws.addRow(row);
    }
  }
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

async function readExcel({ filePath, sheetName }) {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const results = [];
  const targetSheets = sheetName
    ? [workbook.getWorksheet(sheetName)].filter(Boolean)
    : workbook.worksheets;

  for (const ws of targetSheets) {
    const headers = [];
    const rows = [];
    ws.eachRow((row, rowNum) => {
      const values = row.values.slice(1); // row.values is 1-indexed
      if (rowNum === 1) {
        headers.push(...values.map(v => String(v || "")));
      } else {
        rows.push(values.map(v => v != null ? String(v) : ""));
      }
    });
    results.push({ name: ws.name, headers, rows });
  }
  return { sheets: results };
}

async function readPDF({ filePath }) {
  const pdfParse = require("pdf-parse");
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return {
    text: data.text || "",
    numPages: data.numpages,
    info: data.info,
  };
}

module.exports = { createDocument, createExcel, readExcel, readPDF };
