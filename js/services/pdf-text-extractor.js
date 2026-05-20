const PDF_TEXT_DECODER = new TextDecoder("latin1");

const normalizeWhitespace = (value) => (
  value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
);

const decodePdfLiteral = (value) => {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];

    if (current !== "\\") {
      result += current;
      continue;
    }

    const next = value[index + 1];
    index += 1;

    if (next === "n") {
      result += "\n";
      continue;
    }

    if (next === "r") {
      result += "\r";
      continue;
    }

    if (next === "t") {
      result += "\t";
      continue;
    }

    if (next === "b") {
      result += "\b";
      continue;
    }

    if (next === "f") {
      result += "\f";
      continue;
    }

    if (/[0-7]/.test(next || "")) {
      const octal = `${next}${value[index + 1] || ""}${value[index + 2] || ""}`.match(/^[0-7]{1,3}/)?.[0] || next;
      result += String.fromCharCode(parseInt(octal, 8));
      index += octal.length - 1;
      continue;
    }

    result += next || "";
  }

  return result;
};

const decodePdfHex = (value) => {
  const clean = value.replace(/[^0-9A-Fa-f]/g, "");
  const padded = clean.length % 2 === 0 ? clean : `${clean}0`;
  const bytes = new Uint8Array(padded.length / 2);

  for (let index = 0; index < padded.length; index += 2) {
    bytes[index / 2] = parseInt(padded.slice(index, index + 2), 16);
  }

  return PDF_TEXT_DECODER.decode(bytes);
};

const extractStringsFromChunk = (chunk) => {
  const strings = [];
  const literalPattern = /\((?:\\.|[^\\()])*\)/g;
  const hexPattern = /<([0-9A-Fa-f\s]+)>/g;

  for (const match of chunk.matchAll(literalPattern)) {
    strings.push(decodePdfLiteral(match[0].slice(1, -1)));
  }

  for (const match of chunk.matchAll(hexPattern)) {
    strings.push(decodePdfHex(match[1]));
  }

  return strings;
};

const extractTextFromPageChunk = (chunk) => {
  const parts = [];
  const textBlockPattern = /BT([\s\S]*?)ET/g;

  for (const match of chunk.matchAll(textBlockPattern)) {
    parts.push(...extractStringsFromChunk(match[1]));
  }

  if (!parts.length) {
    parts.push(...extractStringsFromChunk(chunk));
  }

  return normalizeWhitespace(parts.join("\n"));
};

const splitPdfPages = (content) => {
  const pageMatches = [...content.matchAll(/\/Type\s*\/Page\b/g)];

  if (!pageMatches.length) {
    return [{ number: 1, text: extractTextFromPageChunk(content) }];
  }

  return pageMatches.map((match, index) => {
    const start = match.index || 0;
    const end = pageMatches[index + 1]?.index || content.length;
    const pageChunk = content.slice(start, end);

    return {
      number: index + 1,
      text: extractTextFromPageChunk(pageChunk),
    };
  }).filter((page) => page.text);
};

export const extractPdfDocument = async (file) => {
  const buffer = await file.arrayBuffer();
  const content = PDF_TEXT_DECODER.decode(new Uint8Array(buffer));
  const pages = splitPdfPages(content);
  const fullText = normalizeWhitespace(pages.map((page) => page.text).join("\n\n"));

  return {
    fileName: file.name,
    size: file.size,
    pageCount: pages.length,
    pages,
    fullText,
    preview: fullText.slice(0, 1200),
  };
};
