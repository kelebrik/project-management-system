type SegmentedFilterOption<TValue extends string> = {
  value: TValue;
  label: string;
};

type SegmentedFilterProps<TValue extends string> = {
  ariaLabel: string;
  value: TValue;
  options: readonly SegmentedFilterOption<TValue>[];
  onChange: (value: TValue) => void;
  className?: string;
};

export function SegmentedFilter<TValue extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  className = "",
}: SegmentedFilterProps<TValue>) {
  return (
    <div className={`segmented-control ${className}`.trim()} aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          type="button"
          className={value === option.value ? "active" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
