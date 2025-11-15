declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it';
  
  interface TexmathOptions {
    engine?: {
      renderToString: (tex: string, options: any) => string;
    };
    delimiters?: 'dollars' | 'brackets' | 'gitlab' | 'julia' | 'kramdown';
    macros?: Record<string, string>;
  }
  
  function texmath(md: MarkdownIt, options?: TexmathOptions): void;
  
  export default texmath;
}