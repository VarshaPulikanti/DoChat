import fs from "fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const SUPPORTED_TYPES = {
  "application/pdf": "pdf",
  "text/plain": "text",
  "text/markdown": "text",
};

export function isSupportedMimeType(mimeType) {
  return mimeType in SUPPORTED_TYPES;
}

async function extractPdfText(filePath) {
  const buffer = await fs.readFile(filePath);
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    pages.push(pageText);
  }

  return pages.join("\n\n").trim();
}

export async function extractText(filePath, mimeType) {
  const type = SUPPORTED_TYPES[mimeType];
  if (!type) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  if (type === "pdf") {
    try {
      const text = await extractPdfText(filePath);
      if (!text) {
        throw new Error(
          "No text found in PDF. It may be scanned/image-only — use a text-based PDF."
        );
      }
      return text;
    } catch (err) {
      throw new Error(`Failed to read PDF: ${err.message}`);
    }
  }

  const text = await fs.readFile(filePath, "utf-8");
  return text.trim();
}
