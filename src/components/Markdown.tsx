import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, FileCode2, WandSparkles } from 'lucide-react';

type Props = {
  content: string;
  onApply?: (code: string, language: string) => void;
  className?: string;
};

export function Markdown({ content, onApply, className }: Props) {
  return (
    <div className={'markdown ' + (className || '')}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => {
            const child = React.Children.toArray(children)[0] as
              | React.ReactElement<{ children?: React.ReactNode; className?: string }>
              | undefined;
            const raw = child?.props?.children;
            const code = typeof raw === 'string' ? raw.replace(/\n$/, '') : '';
            const language = (child?.props?.className || '').replace('language-', '') || 'text';
            return <CodeBlock code={code} language={language} onApply={onApply} />;
          },
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={event => {
                event.preventDefault();
                if (href && /^https?:\/\//i.test(href)) void window.studio.openExternal(href);
              }}
            >
              {children}
            </a>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({
  code,
  language,
  onApply
}: {
  code: string;
  language: string;
  onApply?: (code: string, language: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <div className="code-block">
      <div className="code-block-head">
        <span className="code-lang">
          <FileCode2 size={12} /> {language}
        </span>
        <div className="code-actions">
          <button type="button" onClick={copy} title="Copy code">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {onApply && (
            <button type="button" onClick={() => onApply(code, language)} title="Apply this code to a project file">
              <WandSparkles size={12} /> Apply
            </button>
          )}
        </div>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
