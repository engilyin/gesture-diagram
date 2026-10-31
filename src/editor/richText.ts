export type RichTextSegment =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "link"; value: string; href: string };

export type TextSelectionPatch = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const emphasisPattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;

function parseEmphasis(text: string): RichTextSegment[] {
  const segments: RichTextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(emphasisPattern)) {
    const token = match[0];
    const index = match.index ?? -1;
    if (!token || index < 0) {
      continue;
    }
    if (index > cursor) {
      segments.push({ kind: "text", value: text.slice(cursor, index) });
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      segments.push({ kind: "bold", value: token.slice(2, -2) });
    } else if (token.startsWith("*") && token.endsWith("*")) {
      segments.push({ kind: "italic", value: token.slice(1, -1) });
    } else {
      segments.push({ kind: "text", value: token });
    }
    cursor = index + token.length;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", value: text.slice(cursor) });
  }

  if (segments.length === 0) {
    return [{ kind: "text", value: text }];
  }

  return segments;
}

export function parseRichTextSegments(text: string): RichTextSegment[] {
  const segments: RichTextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(linkPattern)) {
    const token = match[0];
    const label = match[1];
    const href = match[2];
    const index = match.index ?? -1;
    if (!token || !label || !href || index < 0) {
      continue;
    }

    if (index > cursor) {
      segments.push(...parseEmphasis(text.slice(cursor, index)));
    }
    segments.push({ kind: "link", value: label, href });
    cursor = index + token.length;
  }

  if (cursor < text.length) {
    segments.push(...parseEmphasis(text.slice(cursor)));
  }

  if (segments.length === 0) {
    return [{ kind: "text", value: text }];
  }

  return segments;
}

export function toggleTextWrap(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  wrapper: "**" | "*",
): TextSelectionPatch {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const wrapperLength = wrapper.length;

  const isWrapped =
    start >= wrapperLength &&
    end + wrapperLength <= value.length &&
    value.slice(start - wrapperLength, start) === wrapper &&
    value.slice(end, end + wrapperLength) === wrapper;

  if (isWrapped) {
    const nextValue =
      value.slice(0, start - wrapperLength) +
      value.slice(start, end) +
      value.slice(end + wrapperLength);
    return {
      value: nextValue,
      selectionStart: start - wrapperLength,
      selectionEnd: end - wrapperLength,
    };
  }

  const selected = value.slice(start, end);
  const nextValue =
    value.slice(0, start) + wrapper + selected + wrapper + value.slice(end);
  if (start === end) {
    const cursor = start + wrapperLength;
    return { value: nextValue, selectionStart: cursor, selectionEnd: cursor };
  }

  return {
    value: nextValue,
    selectionStart: start + wrapperLength,
    selectionEnd: end + wrapperLength,
  };
}

export function applyLinkToSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  href: string,
): TextSelectionPatch {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const selected = value.slice(start, end);
  const label = selected.length > 0 ? selected : "link";
  const token = `[${label}](${href})`;
  const nextValue = value.slice(0, start) + token + value.slice(end);
  const tokenStart = start + 1;
  return {
    value: nextValue,
    selectionStart: tokenStart,
    selectionEnd: tokenStart + label.length,
  };
}
