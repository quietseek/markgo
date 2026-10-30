import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/react";
import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import {
  clearSearch,
  getSearch,
  gotoMatch,
  replaceAll,
  replaceCurrent,
  setSearch,
} from "../lib/editor-ext";
import { toast } from "../lib/toast";

export function FindBar({
  editor,
  replace,
  initial,
  onClose,
}: {
  editor: Editor;
  replace: boolean;
  initial: string;
  onClose(): void;
}) {
  const [query, setQuery] = useState(initial);
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(replace);
  const findRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  // 匹配数与当前序号跟随编辑器状态（文档被修改时也会更新）
  const { matches, index } = useSyncExternalStore(
    (cb) => {
      editor.on("transaction", cb);
      return () => void editor.off("transaction", cb);
    },
    () => getSearch(editor.state),
  );

  useEffect(() => setShowReplace(replace), [replace]);
  useEffect(() => {
    (replace && initial ? replaceRef : findRef).current?.focus();
    findRef.current?.select();
  }, [replace, initial]);
  useEffect(
    () => setSearch(editor, query, caseSensitive),
    [editor, query, caseSensitive],
  );
  useEffect(() => () => clearSearch(editor), [editor]);

  const close = () => {
    onClose();
    const m = getSearch(editor.state).matches[getSearch(editor.state).index];
    if (m) editor.chain().focus().setTextSelection(m).run();
    else editor.commands.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className="find-anchor">
      <div className="find-bar" onKeyDown={onKeyDown}>
        <div className="find-row">
          <input
            ref={findRef}
            value={query}
            placeholder="查找"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                gotoMatch(editor, e.shiftKey ? -1 : 1);
              }
            }}
          />
          <span className="find-count">
            {query
              ? matches.length
                ? `${index + 1}/${matches.length}`
                : "无结果"
              : ""}
          </span>
          <button
            className={`icon-btn sm${caseSensitive ? " active" : ""}`}
            title="区分大小写"
            onClick={() => setCaseSensitive((v) => !v)}
          >
            <CaseSensitive size={15} />
          </button>
          <button
            className="icon-btn sm"
            title="上一个（⇧↵）"
            disabled={!matches.length}
            onClick={() => gotoMatch(editor, -1)}
          >
            <ChevronUp size={15} />
          </button>
          <button
            className="icon-btn sm"
            title="下一个（↵）"
            disabled={!matches.length}
            onClick={() => gotoMatch(editor, 1)}
          >
            <ChevronDown size={15} />
          </button>
          <button className="icon-btn sm" title="关闭（Esc）" onClick={close}>
            <X size={15} />
          </button>
        </div>
        {showReplace && (
          <div className="find-row">
            <input
              ref={replaceRef}
              value={replacement}
              placeholder="替换为"
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  replaceCurrent(editor, replacement);
                }
              }}
            />
            <button
              className="btn"
              disabled={!matches.length}
              onClick={() => replaceCurrent(editor, replacement)}
            >
              替换
            </button>
            <button
              className="btn"
              disabled={!matches.length}
              onClick={() => {
                const n = replaceAll(editor, replacement);
                toast(`已替换 ${n} 处`, "success", 1800);
              }}
            >
              全部替换
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
