import React from 'react';

interface MathRendererProps {
  math: string;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ math }) => {
  if (!math) return null;

  // Regex to match block math $$...$$ and inline math $...$
  const regex = /(\$\$[\s\S]+?\$\$|\$[\s\S]+?\$)/g;
  const parts = math.split(regex);

  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((part, idx) => {
        if (!part) return null;

        // Check if it's block math $$...$$
        if (part.startsWith('$$') && part.endsWith('$$')) {
          const latex = part.slice(2, -2);
          return (
            <span
              key={idx}
              style={{ display: 'block', margin: '1em 0', textAlign: 'center' }}
              ref={(el) => {
                if (el && (window as any).katex) {
                  try {
                    (window as any).katex.render(latex, el, {
                      throwOnError: false,
                      displayMode: true,
                    });
                  } catch (err) {
                    el.textContent = part;
                  }
                }
              }}
            />
          );
        }

        // Check if it's inline math $...$
        if (part.startsWith('$') && part.endsWith('$')) {
          const latex = part.slice(1, -1);
          return (
            <span
              key={idx}
              style={{ display: 'inline' }}
              ref={(el) => {
                if (el && (window as any).katex) {
                  try {
                    (window as any).katex.render(latex, el, {
                      throwOnError: false,
                      displayMode: false,
                    });
                  } catch (err) {
                    el.textContent = part;
                  }
                }
              }}
            />
          );
        }

        // Otherwise, it's plain text: support \newline and \\ as line breaks
        const formattedText = part
          .replace(/\\newline/g, '\n')
          .replace(/\\\\/g, '\n');

        return <span key={idx}>{formattedText}</span>;
      })}
    </span>
  );
};

export default MathRenderer;
