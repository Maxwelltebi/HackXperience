'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './markdown.module.css';

/**
 * Renders a submission write-up. react-markdown never renders raw HTML and drops unsafe link
 * protocols (javascript:), so a write-up can't inject script. Links open in a new tab.
 */
export default function Markdown({ text }: { text: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
              {children}
            </a>
          ),
          img: ({ alt }) => <span className="muted">[image: {alt || 'no description'}]</span>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
