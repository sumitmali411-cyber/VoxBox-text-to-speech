import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set worker for pdfjs using Vite's bundled worker URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      isEvalSupported: true,
    });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
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
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

export function splitIntoChunks(text: string, maxLength: number = 200): string[] {
  // Split by sentences to avoid cutting in the middle of a word
  // This regex handles most sentence endings including abbreviations
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if ((currentChunk + trimmedSentence).length > maxLength) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = trimmedSentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  
  return chunks;
}
