import { Pencil, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { isHttpsUrl, isMattermostUrl } from "../app/http";

type WbsUrlFieldProps = {
  contextLabel: string;
  isReadOnly: boolean;
  kind: "jira" | "mattermost";
  onInvalid?: (message: string) => void;
  onSave: (value: string) => void;
  value: string;
};

const URL_FIELD_CONFIG = {
  jira: {
    label: "Jira",
    placeholder: "https://...",
    validate: isHttpsUrl,
    invalidMessage: "Ссылка Jira должна начинаться с https://",
  },
  mattermost: {
    label: "MM",
    placeholder: "https://mm.sberdevices.ru/...",
    validate: isMattermostUrl,
    invalidMessage: "Ссылка MM должна вести на https://mm.sberdevices.ru",
  },
} as const;

export function WbsUrlField({
  contextLabel,
  isReadOnly,
  kind,
  onInvalid,
  onSave,
  value,
}: WbsUrlFieldProps) {
  const config = URL_FIELD_CONFIG[kind];
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const cancel = () => {
    skipBlurCommitRef.current = true;
    setBuffer(value);
    setEditing(false);
  };

  const commit = () => {
    const nextValue = buffer.trim();
    if (!config.validate(nextValue)) {
      onInvalid?.(config.invalidMessage);
      cancel();
      return;
    }
    if (nextValue !== value.trim()) onSave(nextValue);
    setEditing(false);
  };

  if (editing && !isReadOnly) {
    return (
      <input
        ref={inputRef}
        className={config.validate(buffer) ? "" : "input-error"}
        aria-invalid={!config.validate(buffer)}
        aria-label={`Ссылка ${config.label} ${contextLabel}`}
        value={buffer}
        placeholder={config.placeholder}
        onChange={(event) => setBuffer(event.target.value)}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
      />
    );
  }

  const href = value.trim();
  return (
    <div className="wbs-url-field">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {config.label}
        </a>
      ) : (
        <span className="wbs-url-empty">—</span>
      )}
      {!isReadOnly && (
        <button
          type="button"
          className="wbs-url-edit"
          aria-label={`${href ? "Изменить" : "Добавить"} ссылку ${config.label} ${contextLabel}`}
          title={href ? `Изменить ссылку ${config.label}` : `Добавить ссылку ${config.label}`}
          onClick={() => {
            skipBlurCommitRef.current = false;
            setBuffer(value);
            setEditing(true);
          }}
        >
          {href ? <Pencil size={13} /> : <Plus size={14} />}
        </button>
      )}
    </div>
  );
}
