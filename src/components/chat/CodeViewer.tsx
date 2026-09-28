import { memo } from 'react';

interface Props {
  content: string;
  language?: string;
}

export const CodeViewer = memo(function CodeViewer({ content, language }: Props) {
  return (
    <pre style={{
      padding: 12,
      fontSize: 12,
      overflow: 'auto',
      background: '#111',
      borderRadius: 6,
      color: '#ccc',
      lineHeight: 1.5,
      maxHeight: 400,
    }}>
      {language && <div style={{ fontSize: 10, color: '#666', marginBottom: 8 }}>{language}</div>}
      <code>{content}</code>
    </pre>
  );
});
