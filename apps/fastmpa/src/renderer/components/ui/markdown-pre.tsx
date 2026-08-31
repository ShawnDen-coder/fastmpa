export function MarkdownPre({
  children,
}: {
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const text = typeof children === "string" ? children.replace(/\n$/, "") : "";
  return (
    <pre className="markdown-pre">
      <button
        type="button"
        className="copy-code-button"
        onClick={() => void navigator.clipboard.writeText(text)}
      >
        Copy
      </button>
      {children}
    </pre>
  );
}
