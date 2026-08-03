import { useState, useRef, useEffect } from "react";
import { motion as Motion, AnimatePresence } from "motion/react";
import { SparklesIcon, DownloadIcon, CopyIcon, RefreshIcon, CloseIcon, FileTextIcon, ArrowRightIcon } from "./Icons";
import CountUp from "./reactbits/CountUp";
import ShinyText from "./reactbits/ShinyText";
import StarBorder from "./reactbits/StarBorder";
import { slugify } from "../utils/text";
import { triggerDownload } from "../utils/webExport";
import "./FinalOutput.css";

export default function FinalOutput({
  synthesis,
  seedData,
  directions,
  ideaNodes,
  round = 1,
  evaluation,
  commitment,
  onChangeCommitment,
  onClose,
  onReset,
  onContinue,
  onExportImage
}) {
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const modalRef = useRef(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const focusableSelector = [
      "button:not(:disabled)",
      "[href]",
      "input:not(:disabled)",
      "select:not(:disabled)",
      "textarea:not(:disabled)",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");

    const getFocusableElements = () => Array.from(
      modalRef.current?.querySelectorAll(focusableSelector) || []
    ).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);

    getFocusableElements()[0]?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (!focusableElements.length) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const handleDownload = () => {
    const markdown = generateMarkdownReport();
    const blob = new Blob([markdown], { type: "text/markdown" });
    // slugify strips characters that are illegal in filenames on Windows/macOS.
    triggerDownload(blob, `thinkstorm-${slugify(seedData?.userInput, "report")}.md`);
    showToast("Report downloaded");
  };

  const handleCopy = async () => {
    try {
      const markdown = generateMarkdownReport();
      await navigator.clipboard.writeText(markdown);
      showToast("Copied to clipboard!");
    } catch {
      showToast("Failed to copy", "error");
    }
  };

  const handlePrintPdf = () => {
    window.print();
    showToast("Print dialog opened");
  };

  const handleExportImage = async () => {
    try {
      // onExportImage rejects on failure, so a success toast here means the
      // PNG actually reached the user.
      await onExportImage?.();
      showToast("Web image downloaded");
    } catch (err) {
      showToast(err?.message || "Failed to export image", "error");
    }
  };

  const generateMarkdownReport = () => {
    const lines = [];

    lines.push(`# ThinkStorm Synthesis Report`);
    lines.push(`\n**Topic:** ${seedData?.userInput || "Brainstorming Session"}`);
    lines.push(`\n**Mode:** ${synthesis?.detected_mode || "exploration"}`);
    lines.push(`\n---\n`);

    // Thinking Objective
    lines.push(`## 🎯 Thinking Objective`);
    lines.push(`\n${seedData?.objective || ""}`);

    if (seedData?.guiding_questions?.length > 0) {
      lines.push(`\n### Guiding Questions`);
      seedData.guiding_questions.forEach(q => {
        lines.push(`- ${q}`);
      });
    }

    lines.push(`\n---\n`);

    // Problem Statement
    lines.push(`## 📋 Problem Statement`);
    lines.push(`\n${synthesis?.problem_statement?.interpreted_goal || ""}`);

    if (synthesis?.problem_statement?.key_assumptions?.length > 0) {
      lines.push(`\n### Key Assumptions`);
      synthesis.problem_statement.key_assumptions.forEach(a => {
        lines.push(`- ${a}`);
      });
    }

    lines.push(`\n---\n`);

    // Directions
    lines.push(`## 📂 Directions Explored`);

    directions?.forEach(dir => {
      lines.push(`\n### ${dir.direction_id}: ${dir.title}`);
      lines.push(`\n${dir.summary}`);

      const ideas = dir.idea_ids
        .map(id => ideaNodes?.find(n => n.id === id))
        .filter(Boolean);

      if (ideas.length > 0) {
        lines.push(`\n**Ideas:**`);
        ideas.forEach(idea => {
          lines.push(`- [${idea.type}] ${idea.content}`);
        });
      }
    });

    lines.push(`\n---\n`);

    // Directions Analysis
    lines.push(`## 📊 Analysis`);

    synthesis?.directions_analysis?.forEach(da => {
      lines.push(`\n### ${da.direction_id} (${da.potential} potential)`);
      lines.push(`\n**Value:** ${da.value}`);

      if (da.risks?.length > 0) {
        lines.push(`\n**Risks:**`);
        da.risks.forEach(r => lines.push(`- ${r}`));
      }

      if (da.unknowns?.length > 0) {
        lines.push(`\n**Unknowns:**`);
        da.unknowns.forEach(u => lines.push(`- ${u}`));
      }
    });

    lines.push(`\n---\n`);

    // Comparison
    lines.push(`## ⚖️ Comparison`);
    if (evaluation?.selected_direction_id) {
      lines.push(`\n**User-selected direction:** ${evaluation.selected_direction_id}`);
      if (evaluation.criteria?.length > 0) {
        lines.push(`\n**Evaluation criteria:** ${evaluation.criteria.map((criterion) => `${criterion.label} (${criterion.weight}/5)`).join(", ")}`);
      }
      const selectedScores = evaluation.scores?.[evaluation.selected_direction_id];
      if (selectedScores) {
        lines.push(`\n**Selected direction scores:** ${evaluation.criteria.map((criterion) => `${criterion.label}: ${selectedScores[criterion.id] ?? "—"}/5`).join(", ")}`);
      }
    }
    lines.push(`\n**Most Promising:** ${synthesis?.comparison?.most_promising || "N/A"}`);

    if (synthesis?.comparison?.can_be_combined?.length > 0) {
      lines.push(`\n**Can Be Combined:** ${synthesis.comparison.can_be_combined.join(", ")}`);
    }

    if (synthesis?.comparison?.should_deprioritize?.length > 0) {
      lines.push(`\n**Should Deprioritize:** ${synthesis.comparison.should_deprioritize.join(", ")}`);
    }

    lines.push(`\n---\n`);

    // Next Actions
    lines.push(`## 🚀 Next Actions`);

    if (synthesis?.next_actions?.immediate_steps?.length > 0) {
      lines.push(`\n### Immediate Steps`);
      synthesis.next_actions.immediate_steps.forEach((s, i) => {
        lines.push(`${i + 1}. ${s}`);
      });
    }

    if (synthesis?.next_actions?.questions_to_answer?.length > 0) {
      lines.push(`\n### Questions to Answer`);
      synthesis.next_actions.questions_to_answer.forEach(q => {
        lines.push(`- ${q}`);
      });
    }

    if (synthesis?.next_actions?.validation_methods?.length > 0) {
      lines.push(`\n### Validation Methods`);
      synthesis.next_actions.validation_methods.forEach(v => {
        lines.push(`- ${v}`);
      });
    }

    if (commitment?.first_step || commitment?.success_metric || commitment?.owner || commitment?.due_date) {
      lines.push(`\n### Committed Experiment`);
      if (commitment.first_step) lines.push(`- **First step:** ${commitment.first_step}`);
      if (commitment.success_metric) lines.push(`- **Success metric:** ${commitment.success_metric}`);
      if (commitment.owner) lines.push(`- **Owner:** ${commitment.owner}`);
      if (commitment.due_date) lines.push(`- **Due:** ${commitment.due_date}`);
    }

    lines.push(`\n---\n`);
    lines.push(`\n*Generated by ThinkStorm*`);

    return lines.join("\n");
  };

  return (
    <Motion.div
      className="final-output-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <Motion.div
        className="final-output-container"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="final-output-title"
        initial={{ scale: 0.9, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 50 }}
        transition={{ type: "spring", damping: 25 }}
      >
        <header className="output-header">
          <div className="output-title-section">
            <h2 id="final-output-title">
              <span className="output-title-icon"><SparklesIcon size={18} /></span>
              Synthesis Report
            </h2>
            <div className="output-meta">
              <span className="topic-badge">{seedData?.userInput}</span>
              <span className={`mode-tag ${synthesis?.detected_mode}`}>
                <ShinyText speed={5}>{synthesis?.detected_mode} mode</ShinyText>
              </span>
              <span className="output-stat">
                <CountUp to={directions?.length || 0} duration={1.1} />
                <em>directions</em>
              </span>
              <span className="output-stat">
                <CountUp to={ideaNodes?.length || 0} duration={1.4} delay={0.1} />
                <em>ideas</em>
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close synthesis report">
            <CloseIcon size={18} />
          </button>
        </header>

        <div className="output-content">
          {/* Thinking Objective */}
          <section className="report-section">
            <h3>Thinking Objective</h3>
            <p className="objective-text">{seedData?.objective}</p>
            {seedData?.guiding_questions?.length > 0 && (
              <div className="guiding-questions">
                <h4>Guiding Questions</h4>
                <ul>
                  {seedData.guiding_questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Problem Statement */}
          <section className="report-section">
            <h3>Problem Statement</h3>
            <p className="problem-text">{synthesis?.problem_statement?.interpreted_goal}</p>
            {synthesis?.problem_statement?.key_assumptions?.length > 0 && (
              <div className="assumptions-list">
                <h4>Key Assumptions</h4>
                <ul>
                  {synthesis.problem_statement.key_assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Directions Summary */}
          <section className="report-section">
            <h3>Directions Explored</h3>
            <div className="directions-summary">
              {directions?.map(dir => (
                <div key={dir.direction_id} className="direction-summary-card">
                  <div className="dir-header">
                    <span className="dir-badge">{dir.direction_id}</span>
                    <span className="dir-title">{dir.title}</span>
                  </div>
                  <p className="dir-sum">{dir.summary}</p>
                  <div className="dir-ideas-list">
                    {dir.idea_ids
                      .map(id => ideaNodes?.find(n => n.id === id))
                      .filter(Boolean)
                      .map(idea => (
                        <span key={idea.id} className={`idea-chip ${idea.type}`}>
                          {idea.content}
                        </span>
                      ))
                    }
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Full Analysis */}
          <section className="report-section">
            <h3>Detailed Analysis</h3>
            <div className="full-analysis">
              {synthesis?.directions_analysis?.map(da => (
                <div key={da.direction_id} className="analysis-block">
                  <div className="analysis-block-header">
                    <span className="block-dir-id">{da.direction_id}</span>
                    <span className={`potential-tag ${da.potential}`}>
                      {da.potential} potential
                    </span>
                  </div>
                  <div className="analysis-block-content">
                    <div className="analysis-row">
                      <span className="row-label">Value:</span>
                      <span className="row-value">{da.value}</span>
                    </div>
                    <div className="analysis-row">
                      <span className="row-label">Risks:</span>
                      <ul className="row-list">
                        {da.risks?.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                    <div className="analysis-row">
                      <span className="row-label">Unknowns:</span>
                      <ul className="row-list">
                        {da.unknowns?.map((u, i) => <li key={i}>{u}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Comparison */}
          <section className="report-section">
            <h3>Direction Comparison</h3>
            <div className="comparison-summary">
              {evaluation?.selected_direction_id && (
                <div className="comp-block selected-choice">
                  <span className="comp-block-label">Your Choice</span>
                  <span className="comp-block-value">{evaluation.selected_direction_id}</span>
                  {evaluation.criteria?.length > 0 && (
                    <span className="comp-block-detail">
                      {evaluation.criteria.map((criterion) => `${criterion.label} · ${evaluation.scores?.[evaluation.selected_direction_id]?.[criterion.id] ?? "—"}/5`).join("  |  ")}
                    </span>
                  )}
                </div>
              )}
              <div className="comp-block promising">
                <span className="comp-block-label">Most Promising</span>
                <span className="comp-block-value">{synthesis?.comparison?.most_promising}</span>
              </div>
              {synthesis?.comparison?.can_be_combined?.length > 0 && (
                <div className="comp-block combine">
                  <span className="comp-block-label">Can Be Combined</span>
                  <span className="comp-block-value">
                    {synthesis.comparison.can_be_combined.join(" + ")}
                  </span>
                </div>
              )}
              {synthesis?.comparison?.should_deprioritize?.length > 0 && (
                <div className="comp-block deprioritize">
                  <span className="comp-block-label">Deprioritize</span>
                  <span className="comp-block-value">
                    {synthesis.comparison.should_deprioritize.join(", ")}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Next Actions */}
          <section className="report-section">
            <h3>Recommended Next Actions</h3>
            <div className="next-actions-summary">
              {synthesis?.next_actions?.immediate_steps?.length > 0 && (
                <div className="action-block">
                  <h4>Immediate Steps</h4>
                  <ol>
                    {synthesis.next_actions.immediate_steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
              {synthesis?.next_actions?.questions_to_answer?.length > 0 && (
                <div className="action-block">
                  <h4>Questions to Answer</h4>
                  <ul>
                    {synthesis.next_actions.questions_to_answer.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
              {synthesis?.next_actions?.validation_methods?.length > 0 && (
                <div className="action-block">
                  <h4>Validation Methods</h4>
                  <ul>
                    {synthesis.next_actions.validation_methods.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          <section className="report-section commitment-section">
            <h3>Commit the next experiment</h3>
            <p className="commitment-intro">Turn the report into one small, testable step you can return to later.</p>
            <div className="commitment-grid">
              <label>
                <span>First step</span>
                <input value={commitment?.first_step || ""} onChange={(event) => onChangeCommitment?.({ ...(commitment || {}), first_step: event.target.value })} placeholder="What will you do first?" maxLength={220} />
              </label>
              <label>
                <span>Success metric</span>
                <input value={commitment?.success_metric || ""} onChange={(event) => onChangeCommitment?.({ ...(commitment || {}), success_metric: event.target.value })} placeholder="What evidence would change your mind?" maxLength={180} />
              </label>
              <label>
                <span>Owner</span>
                <input value={commitment?.owner || ""} onChange={(event) => onChangeCommitment?.({ ...(commitment || {}), owner: event.target.value })} placeholder="Name" maxLength={80} />
              </label>
              <label>
                <span>Due date</span>
                <input type="date" value={commitment?.due_date || ""} onChange={(event) => onChangeCommitment?.({ ...(commitment || {}), due_date: event.target.value })} />
              </label>
            </div>
            <button type="button" className={`commitment-status ${commitment?.status === "done" ? "done" : ""}`} onClick={() => onChangeCommitment?.({ ...(commitment || {}), status: commitment?.status === "done" ? "open" : "done" })}>
              {commitment?.status === "done" ? "✓ Experiment marked complete" : "Mark experiment complete"}
            </button>
          </section>
        </div>

        <footer className="output-footer">
          <button className="output-btn image" onClick={handleExportImage}>
            <DownloadIcon size={16} /> Web image
          </button>
          <button className="output-btn download" onClick={handleDownload}>
            <FileTextIcon size={16} /> Markdown
          </button>
          <button className="output-btn pdf" onClick={handlePrintPdf}>
            <FileTextIcon size={16} /> PDF
          </button>
          <button className="output-btn copy" onClick={handleCopy}>
            <CopyIcon size={16} /> Copy
          </button>
          <button className="output-btn ghost" onClick={onReset}>
            <RefreshIcon size={16} /> Start over
          </button>
          {onContinue && (
            <StarBorder className="output-btn-star" color="#18c6d6" speed="6s" onClick={onContinue}>
              <span className="output-btn new">
                Grow web {round + 1} <ArrowRightIcon size={16} />
              </span>
            </StarBorder>
          )}
        </footer>

        <AnimatePresence>
          {toast && (
            <Motion.div
              className={`output-toast ${toast.type}`}
              initial={{ opacity: 0, y: 20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 20, x: "-50%" }}
            >
              {toast.type === "error" ? "⚠️" : "✓"} {toast.message}
            </Motion.div>
          )}
        </AnimatePresence>
      </Motion.div>
    </Motion.div>
  );
}
