import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set worker for pdfjs using Vite's bundled worker URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/** Largest document we will read into memory. */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Guards against a malicious document expanding into unbounded text. */
const MAX_EXTRACTED_CHARS = 2_000_000;

export const ALLOWED_FILE_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export function validateFile(file: File): string | null {
  if (file.size === 0) {
    return 'That file is empty.';
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${
      MAX_FILE_SIZE_BYTES / 1024 / 1024
    }MB.`;
  }

  const name = file.name.toLowerCase();
  const hasAllowedExtension = name.endsWith('.pdf') || name.endsWith('.docx');
  const hasAllowedType =
    file.type === ALLOWED_FILE_TYPES.pdf ||
    file.type === ALLOWED_FILE_TYPES.docx ||
    file.type === '';

  // Both the extension and the reported type must line up, so a renamed file
  // is not handed to the wrong parser.
  if (!hasAllowedExtension || !hasAllowedType) {
    return 'Unsupported file type. Please upload a PDF or DOCX.';
  }

  if (name.endsWith('.pdf') && file.type === ALLOWED_FILE_TYPES.docx) {
    return 'That file’s name and contents disagree. Please upload a PDF or DOCX.';
  }

  if (name.endsWith('.docx') && file.type === ALLOWED_FILE_TYPES.pdf) {
    return 'That file’s name and contents disagree. Please upload a PDF or DOCX.';
  }

  return null;
}

export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      // Uploaded PDFs are untrusted. Never let the renderer compile font
      // programs with eval, and never let a document pull in remote resources.
      isEvalSupported: false,
      disableAutoFetch: true,
      // Keep a malformed/hostile XFA or embedded-JS payload out of the parse.
      enableXfa: false,
    });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
        .join(' ');
      fullText += pageText + '\n\n';

      if (fullText.length > MAX_EXTRACTED_CHARS) {
        fullText = fullText.slice(0, MAX_EXTRACTED_CHARS);
        break;
      }
    }

    return fullText;
  } catch (error) {
    console.error('PDF Extraction Error:', error);
    if (error instanceof Error && error.message.includes('worker')) {
      throw new Error('PDF worker failed to load. Please check your internet connection or try a different browser.');
    }
    throw error;
  }
}

export async function extractTextFromDOCX(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  // extractRawText (not convertToHtml) — the document never becomes markup.
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.slice(0, MAX_EXTRACTED_CHARS);
}

export function splitIntoChunks(text: string, maxLength: number = 200): string[] {
  // Split by sentences to avoid cutting in the middle of a word
  // This regex handles most sentence endings including abbreviations
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';

  const pushChunk = (value: string) => {
    // A single "sentence" can exceed maxLength (a document with no
    // punctuation, for example), so hard-split anything still oversized.
    for (let i = 0; i < value.length; i += maxLength) {
      const piece = value.slice(i, i + maxLength).trim();
      if (piece) chunks.push(piece);
    }
  };

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if ((currentChunk + trimmedSentence).length > maxLength) {
      if (currentChunk) pushChunk(currentChunk.trim());
      currentChunk = trimmedSentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }
  }
  if (currentChunk) pushChunk(currentChunk.trim());

  return chunks;
}
