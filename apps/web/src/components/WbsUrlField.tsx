import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
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
    invalidMessageKey: "wbs.url.invalidJira",
  },
  mattermost: {
    label: "MM",
    placeholder: "https://mm.sberdevices.ru/...",
    validate: isMattermostUrl,
    invalidMessageKey: "wbs.url.invalidMattermost",
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
  const { t: uiText } = useInterfaceTranslation();
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
      onInvalid?.(uiText(config.invalidMessageKey));
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
        aria-label={uiText("wbs.url.inputLabel", { label: config.label, context: contextLabel })}
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
          aria-label={uiText(href ? "wbs.url.editAction" : "wbs.url.addAction", { label: config.label, context: contextLabel })}
          title={uiText(href ? "wbs.url.editTitle" : "wbs.url.addTitle", { label: config.label })}
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
