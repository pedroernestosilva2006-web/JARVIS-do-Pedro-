export const VISION_PROMPT = `Esta imagem foi enviada ao segundo cérebro do Pedro. Descreva-a para virar conhecimento:
1. Transcreva TODO o texto legível (OCR fiel). Em página de livro, destaque trechos sublinhados/marcados com ">>".
2. Se for slide, descreva gráficos e diagramas em uma frase cada.
3. Se identificar o livro, autor, evento ou palestrante, diga explicitamente.
Responda em PT-BR, só o conteúdo, sem preâmbulo.`;

export const PDF_PROMPT = `Extraia o conteúdo essencial deste PDF para o segundo cérebro do Pedro: título, autor, e o texto dos trechos mais importantes (preserve citações literais). Responda em PT-BR, só o conteúdo.`;
