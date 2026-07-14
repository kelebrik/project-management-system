type FieldErrorProps = {
  id?: string;
  message?: string;
};

/** Инлайн-сообщение об ошибке под полем формы. */
export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <span className="field-error-message" id={id} role="alert">
      {message}
    </span>
  );
}
