// ═══════════════════════════════════════════════════════════════════════════
// KB Seeding — file parser & text chunker
// ═══════════════════════════════════════════════════════════════════════════
//
// Two responsibilities:
//   1. parseInputFile(file)         — dispatch uploaded files to a
//                                     format-appropriate text extractor
//   2. chunkText(text, maxChars)    — split text into chunks for Pass 1
//                                     batch processing, preserving natural
//                                     boundaries where possible
//
// Supported file types (v1):
//   - text/plain (.txt)
//   - text/markdown (.md, .markdown)
//   - text/html (.html, .htm)        — Confluence exports, web pages
//   - DOCX (.docx)                   — Word documents (requires `mammoth`)
//   - Images (.png, .jpg, .jpeg, .webp) — described via Claude vision in
//                                     image-extraction.js, not chunked here
//
// PDF support is intentionally deferred — adds another library, and most
// source material can be exported to one of the above formats.

// cheerio is loaded lazily inside htmlToText so that the module can load
// even if cheerio isn't installed (e.g., users who never upload HTML files).
// `npm install cheerio` is required to actually parse HTML uploads.

// Block-content elements that emit a complete text node with structure.
// Container elements (div, section, article, ul, ol, etc.) are recursed
// into rather than emitted directly.
const BLOCK_CONTENT_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "li", "blockquote", "pre", "dd", "dt",
]);

// ─── HTML → text ────────────────────────────────────────────────────────────

// Convert HTML to a plain-text representation that preserves structure
// hints (headings, paragraph breaks, list bullets). Output is roughly
// markdown-shaped, which gives the chunker meaningful split points.
function htmlToText(html) {
  // Lazy require — parser module must load even if cheerio isn't installed.
  let cheerio;
  try {
    cheerio = require("cheerio");
  } catch {
    throw new Error("HTML parsing requires the 'cheerio' package. Run: npm install cheerio");
  }
  const $ = cheerio.load(html);

  // Strip non-content elements
  $("script, style, nav, footer, iframe, noscript, .nav, .footer").remove();

  const parts = [];

  function process(el) {
    // Text nodes
    if (el.type === "text") {
      const text = el.data.replace(/\s+/g, " ").trim();
      if (text) parts.push(text + " ");
      return;
    }

    if (!el.tagName) return;
    const tag = el.tagName.toLowerCase();
    const $el = $(el);

    // Block content — emit collapsed text with structural marker
    if (BLOCK_CONTENT_TAGS.has(tag)) {
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (!text) return;

      if (tag === "h1")        parts.push(`\n\n# ${text}\n`);
      else if (tag === "h2")   parts.push(`\n\n## ${text}\n`);
      else if (tag === "h3")   parts.push(`\n\n### ${text}\n`);
      else if (/^h[4-6]$/.test(tag)) parts.push(`\n\n#### ${text}\n`);
      else if (tag === "li") {
        const isOrdered = el.parent?.tagName?.toLowerCase() === "ol";
        parts.push(`\n${isOrdered ? "1." : "-"} ${text}`);
      }
      else if (tag === "blockquote") parts.push(`\n\n> ${text}\n`);
      else if (tag === "pre")        parts.push(`\n\n\`\`\`\n${text}\n\`\`\`\n`);
      else                            parts.push(`\n\n${text}`);
      return;
    }

    // Special tags
    if (tag === "br") { parts.push("\n"); return; }
    if (tag === "hr") { parts.push("\n\n---\n"); return; }
    if (tag === "img") {
      const alt = $el.attr("alt");
      if (alt && alt.trim()) parts.push(`[image: ${alt.trim()}] `);
      return;
    }
    if (tag === "table") {
      // Render as pipe-separated rows; loses cell-spanning nuance but
      // preserves the data well enough for extraction.
      const rows = [];
      $el.find("tr").each((_, tr) => {
        const cells = [];
        $(tr).find("td, th").each((_, cell) => {
          cells.push($(cell).text().replace(/\s+/g, " ").trim());
        });
        if (cells.some(c => c.length > 0)) rows.push(cells.join(" | "));
      });
      if (rows.length) parts.push(`\n\n${rows.join("\n")}\n`);
      return;
    }

    // Container elements — recurse into children (including text nodes)
    $el.contents().each((_, child) => process(child));
  }

  const $body = $("body");
  const $root = $body.length ? $body : $.root();
  $root.contents().each((_, el) => process(el));

  return parts
    .join("")
    .replace(/[ \t]+/g, " ")        // collapse runs of spaces
    .replace(/\n{3,}/g, "\n\n")     // max one blank line between blocks
    .trim();
}

// ─── DOCX → text ────────────────────────────────────────────────────────────

// Convert a DOCX buffer to markdown-flavored text. Mammoth handles
// headings, lists, paragraph breaks, and basic formatting cleanly.
// Lazy-required so the module loads even if mammoth isn't installed —
// you only hit the missing dep when someone actually uploads a .docx.
async function docxToText(buffer) {
  let mammoth;
  try {
    mammoth = require("mammoth");
  } catch (err) {
    throw new Error(
      "DOCX parsing requires the 'mammoth' package. Run: npm install mammoth"
    );
  }
  const result = await mammoth.convertToMarkdown({ buffer });
  // mammoth.messages contains warnings; ignore for now, surface if needed
  return result.value;
}

// ─── Source type detection ──────────────────────────────────────────────────

// Resolve a file's source type from mimetype with extension fallback.
// Multer sometimes returns generic 'application/octet-stream' for files
// dragged from certain OS/browser combos, so extension fallback matters.
function detectSourceType(file) {
  const mime = (file.mimetype || "").toLowerCase();
  const name = (file.originalname || "").toLowerCase();

  if (mime === "text/markdown" ||
      name.endsWith(".md") ||
      name.endsWith(".markdown")) {
    return "markdown";
  }
  if (mime === "text/html" ||
      name.endsWith(".html") ||
      name.endsWith(".htm")) {
    return "html";
  }
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx")) {
    return "docx";
  }
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg" ||
      mime === "image/webp" ||
      name.endsWith(".png") || name.endsWith(".jpg") ||
      name.endsWith(".jpeg") || name.endsWith(".webp")) {
    return "image";
  }
  if (mime.startsWith("text/") || name.endsWith(".txt")) {
    return "text";
  }
  return null;
}

// Resolve the canonical MIME type for an image file. Returns null for
// non-image uploads. Multer can hand back 'application/octet-stream' or
// non-standard 'image/jpg' depending on the browser, so we normalize
// based on extension when needed. Claude vision accepts image/png,
// image/jpeg, and image/webp — those are the three we emit.
function imageMediaType(file) {
  const mime = (file.mimetype || "").toLowerCase();
  const name = (file.originalname || "").toLowerCase();
  if (mime === "image/png" || name.endsWith(".png")) return "image/png";
  if (mime === "image/jpeg" || mime === "image/jpg" ||
      name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (mime === "image/webp" || name.endsWith(".webp")) return "image/webp";
  return null;
}

// ─── parseInputFile (exported) ──────────────────────────────────────────────

/**
 * Parse an uploaded file into a normalized representation. The return
 * shape depends on source_type:
 *
 *   text / markdown / html / docx → { text, source_type }
 *   image                         → { buffer, source_type: 'image',
 *                                     media_type, original_name }
 *
 * @param {{ originalname: string, mimetype: string, buffer: Buffer }} file
 *   A Multer file object from `upload.array("files")`.
 * @returns {Promise<object>}
 * @throws  Error if the file type is unsupported or parsing fails.
 */
async function parseInputFile(file) {
  if (!file || !file.buffer) {
    throw new Error("parseInputFile: missing file buffer");
  }

  const sourceType = detectSourceType(file);
  if (!sourceType) {
    throw new Error(
      `Unsupported file type: ${file.originalname} (${file.mimetype || "no mimetype"})`
    );
  }

  if (sourceType === "text" || sourceType === "markdown") {
    return { text: file.buffer.toString("utf8"), source_type: sourceType };
  }
  if (sourceType === "html") {
    return {
      text: htmlToText(file.buffer.toString("utf8")),
      source_type: "html",
    };
  }
  if (sourceType === "docx") {
    return { text: await docxToText(file.buffer), source_type: "docx" };
  }
  if (sourceType === "image") {
    const mediaType = imageMediaType(file);
    if (!mediaType) {
      throw new Error(
        `Unsupported image type: ${file.originalname} (${file.mimetype || "no mimetype"})`
      );
    }
    return {
      buffer: file.buffer,
      source_type: "image",
      media_type: mediaType,
      original_name: file.originalname,
    };
  }

  // Unreachable given the check above, but defensive
  throw new Error(`Unhandled source type: ${sourceType}`);
}

// ─── chunkText (exported) ───────────────────────────────────────────────────

/**
 * Split text into chunks that fit within maxChars, preferring to break
 * on natural boundaries. Three-tier fallback:
 *
 *   1. Paragraph boundaries (\n\n)
 *   2. Sentence boundaries (. ? ! followed by whitespace)
 *   3. Word boundaries (whitespace)
 *
 * Each chunk stays under maxChars unless a single word exceeds the
 * limit (extremely rare; emitted as-is).
 *
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
function chunkText(text, maxChars) {
  if (!text || text.length === 0) return [];
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n\n+/).filter(p => p.length > 0);
  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    // Single paragraph too big — flush current, then split paragraph
    if (para.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (const sub of splitOversizedParagraph(para, maxChars)) {
        chunks.push(sub);
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > maxChars) {
      chunks.push(current);
      current = para;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

// ─── Internal chunking fallbacks ────────────────────────────────────────────

function splitOversizedParagraph(text, maxChars) {
  // Split on sentence terminators followed by whitespace
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) { chunks.push(current); current = ""; }
      for (const sub of splitByWords(sentence, maxChars)) {
        chunks.push(sub);
      }
      continue;
    }
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitByWords(text, maxChars) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) chunks.push(current);
      // Single word exceeding maxChars — emit as-is rather than truncate
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  parseInputFile,
  chunkText,
  htmlToText,
};
