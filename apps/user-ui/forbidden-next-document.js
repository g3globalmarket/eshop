throw new Error(
  "Forbidden import: 'next/document' used outside pages/_document. " +
    "Посмотри стек выше: он покажет путь файла, который это импортирует."
);
