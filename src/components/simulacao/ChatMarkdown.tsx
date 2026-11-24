"use client";

import { Fragment, ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Matches: [label](https?://url) | **bold** | __bold__ | `code` | *italic*
  const tokenRegex =
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*(?!\s)([^*\n]+?)(?<!\s)\*/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const key = `${keyPrefix}-${idx++}`;
    if (match[1] !== undefined && match[2] !== undefined) {
      nodes.push(
        <a
          key={key}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-current/50 underline-offset-2 [overflow-wrap:anywhere] hover:opacity-80"
        >
          {match[1]}
        </a>
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {renderInline(match[3], `${key}-b`)}
        </strong>
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {renderInline(match[4], `${key}-u`)}
        </strong>
      );
    } else if (match[5] !== undefined) {
      nodes.push(
        <code key={key} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[11px] [overflow-wrap:anywhere]">
          {match[5]}
        </code>
      );
    } else if (match[6] !== undefined) {
      nodes.push(
        <em key={key} className="italic">
          {match[6]}
        </em>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function ChatMarkdown({ content, isUser }: { content: string; isUser?: boolean }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let blockIdx = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (/^(?:---|\*\*\*)$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${blockIdx++}`} className="my-2 border-(--color-border)" />);
      i++;
      continue;
    }

    const headingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      blocks.push(
        <p key={`h-${blockIdx++}`} className={isUser ? "font-semibold text-white" : "font-semibold text-(--color-text-primary)"}>
          {renderInline(headingMatch[1], `h-${blockIdx}`)}
        </p>
      );
      i++;
      continue;
    }

    if (/^(?:[-*•])\s+(.+)$/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^(?:[-*•])\s+(.+)$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      const listKey = blockIdx++;
      blocks.push(
        <ul key={`ul-${listKey}`} className="list-disc space-y-1 pl-4">
          {items.map((item, itemIdx) => (
            <li key={`ul-${listKey}-${itemIdx}`}>{renderInline(item, `ul-${listKey}-${itemIdx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+(.+)$/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^\d+\.\s+(.+)$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      const listKey = blockIdx++;
      blocks.push(
        <ol key={`ol-${listKey}`} className="list-decimal space-y-1 pl-4">
          {items.map((item, itemIdx) => (
            <li key={`ol-${listKey}-${itemIdx}`}>{renderInline(item, `ol-${listKey}-${itemIdx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (
        !cur ||
        /^(?:---|\*\*\*)$/.test(cur) ||
        /^#{1,4}\s+/.test(cur) ||
        /^(?:[-*•])\s+/.test(cur) ||
        /^\d+\.\s+/.test(cur)
      ) {
        break;
      }
      paragraphLines.push(lines[i]);
      i++;
    }

    const pKey = blockIdx++;
    blocks.push(
      <p key={`p-${pKey}`}>
        {paragraphLines.map((pLine, lineIdx) => (
          <Fragment key={`p-${pKey}-${lineIdx}`}>
            {lineIdx > 0 && <br />}
            {renderInline(pLine, `p-${pKey}-${lineIdx}`)}
          </Fragment>
        ))}
      </p>
    );
  }

  return <div className="space-y-1.5 break-words">{blocks}</div>;
}
