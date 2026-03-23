const fs = require("fs");
const path = require("path");
const config = require("../config");

const DOCS_DIR = path.join(config.DATA_DIR, "documents");

async function processImage({ inputPath, outputPath, operations }) {
  if (!fs.existsSync(inputPath)) return { error: `File not found: ${inputPath}` };

  const sharp = require("sharp");
  let pipeline = sharp(inputPath);

  for (const op of (operations || [])) {
    switch (op.type) {
      case "resize":
        pipeline = pipeline.resize(op.width || null, op.height || null, { fit: "inside" });
        break;
      case "crop":
        pipeline = pipeline.extract({ left: op.left || 0, top: op.top || 0, width: op.width, height: op.height });
        break;
      case "convert":
        pipeline = pipeline.toFormat(op.format || "png");
        break;
      case "compress":
        pipeline = pipeline.jpeg({ quality: op.quality || 80 });
        break;
    }
  }

  const ext = operations?.find(o => o.type === "convert")?.format || path.extname(inputPath).slice(1) || "png";
  const filePath = outputPath || path.join(DOCS_DIR, `image_${Date.now()}.${ext}`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  await pipeline.toFile(filePath);
  return { filePath, documentPath: filePath, documentName: path.basename(filePath) };
}

module.exports = { processImage };
