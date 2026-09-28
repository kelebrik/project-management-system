import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";

const RISK_TONE_KEYS = {
  green: "ui.projects.riskMatrixLow",
  amber: "ui.projects.riskMatrixMedium",
  red: "ui.projects.riskMatrixHigh",
} as const;

/** Active risks and problems by probability and impact; problems carry their own mark. */
export function ProjectRaidMatrixCard() {
  const { t: uiText } = useInterfaceTranslation();
  const { riskMatrix, riskTone } = usePageContext();

  return (
    <section className="risk-matrix-card">
      <div className="subhead">{uiText("ui.projects.riskMatrixTitle")}</div>
      <div className="risk-matrix" aria-label={uiText("ui.projects.riskMatrixTitle")}>
        {[5, 4, 3, 2, 1].map((impact) =>
          [1, 2, 3, 4, 5].map((probability) => {
            const cell = riskMatrix.get(`${probability}:${impact}`) ?? { risks: 0, problems: 0 };
            const tone = riskTone(probability * impact);
            const label = uiText("ui.projects.riskMatrixCell", {
              probability,
              impact,
              zone: uiText(RISK_TONE_KEYS[tone]),
            });
            return (
              <span
                aria-label={uiText("ui.projects.riskMatrixCellCounts", {
                  cell: label,
                  risks: cell.risks,
                  problems: cell.problems,
                })}
                className={`risk-matrix-cell ${tone}`}
                key={`${probability}-${impact}`}
                title={label}
              >
                {cell.risks > 0 && <b className="risk-matrix-risks">{cell.risks}</b>}
                {cell.problems > 0 && <b className="risk-matrix-problems">{cell.problems}</b>}
              </span>
            );
          }),
        )}
      </div>
      <ul className="risk-matrix-legend" aria-hidden="true">
        <li>
          <i className="risk-matrix-risks">1</i>
          {uiText("ui.projects.riskMatrixRisks")}
        </li>
        <li>
          <i className="risk-matrix-problems">1</i>
          {uiText("ui.projects.riskMatrixProblems")}
        </li>
      </ul>
    </section>
  );
}
