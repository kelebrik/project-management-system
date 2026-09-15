import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";

const RISK_TONE_LABELS = {
  green: "низкий риск",
  amber: "средний риск",
  red: "высокий риск",
} as const;

export function ProjectRaidMatrixCard() {
  const { t: uiText } = useInterfaceTranslation();
  const { riskMatrix, riskTone } = usePageContext();

  return (
    <section className="risk-matrix-card">
      <div className="subhead">{uiText("ui.projects.riskMatrixTitle")}</div>
      <div className="risk-matrix" aria-label={uiText("ui.projects.riskMatrixTitle")}>
        {[5, 4, 3, 2, 1].map((impact) =>
          [1, 2, 3, 4, 5].map((probability) => {
            const count = riskMatrix.get(`${probability}:${impact}`) ?? 0;
            const score = probability * impact;
            const tone = riskTone(score);
            const label = `Вероятность ${probability}, влияние ${impact}, ${RISK_TONE_LABELS[tone]}`;
            return (
              <span
                className={`risk-matrix-cell ${tone}`}
                key={`${probability}-${impact}`}
                aria-label={`${label}, записей: ${count}`}
                title={label}
              >
                {count > 0 ? count : ""}
              </span>
            );
          }),
        )}
      </div>
    </section>
  );
}
