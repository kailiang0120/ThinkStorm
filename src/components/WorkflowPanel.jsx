import { useState } from "react";
import {
  ArrowRightIcon,
  LayersIcon,
  RefreshIcon,
  SparklesIcon,
  TargetIcon,
  TrashIcon
} from "./Icons";

const IDEA_TYPES = ["problem", "method", "application", "assumption", "opportunity"];
const EXPANSION_LENSES = [
  { value: "directions", label: "Strategic directions", help: "Parallel routes at the same level" },
  { value: "deeper", label: "Go deeper", help: "Mechanisms, details, and root causes" },
  { value: "alternatives", label: "Find alternatives", help: "Different ways to achieve the same outcome" },
  { value: "risks", label: "Identify risks", help: "Failure modes and unintended consequences" },
  { value: "assumptions", label: "Challenge assumptions", help: "Beliefs that need evidence" },
  { value: "applications", label: "Find applications", help: "Concrete use cases and contexts" },
  { value: "next_steps", label: "Suggest next steps", help: "Tests, evidence, and decisions" }
];

export function SeedReviewPanel({ seedData, onChange, onConfirm, onBack, isLoading }) {
  if (!seedData) return null;

  const updateQuestion = (index, value) => {
    const questions = [...(seedData.guiding_questions || [])];
    questions[index] = value;
    onChange({ ...seedData, guiding_questions: questions });
  };

  return (
    <section className="workflow-panel seed-review-panel" aria-labelledby="seed-review-title">
      <div className="workflow-panel-heading">
        <span className="workflow-panel-icon"><TargetIcon size={18} /></span>
        <div>
          <span className="workflow-kicker">Step 1 · Frame the work</span>
          <h2 id="seed-review-title">Make the question yours</h2>
        </div>
      </div>
      <p className="workflow-panel-intro">
        ThinkStorm drafted a starting brief. Edit it until it describes the decision you actually need to make.
      </p>

      <label className="workflow-field">
        <span>Thinking objective</span>
        <textarea
          value={seedData.objective || ""}
          onChange={(event) => onChange({ ...seedData, objective: event.target.value })}
          rows={2}
          maxLength={220}
          disabled={isLoading}
        />
      </label>

      <div className="workflow-field-group">
        <span className="workflow-field-label">Guiding questions</span>
        {(seedData.guiding_questions || []).slice(0, 3).map((question, index) => (
          <input
            key={`seed-question-${index}`}
            value={question}
            onChange={(event) => updateQuestion(index, event.target.value)}
            maxLength={160}
            disabled={isLoading}
            aria-label={`Guiding question ${index + 1}`}
          />
        ))}
      </div>

      <div className="workflow-panel-actions">
        <button type="button" className="workflow-btn ghost" onClick={onBack} disabled={isLoading}>Back</button>
        <button type="button" className="workflow-btn primary" onClick={onConfirm} disabled={isLoading || !seedData.objective?.trim()}>
          {isLoading ? "Preparing…" : "Start capturing ideas"} <ArrowRightIcon size={16} />
        </button>
      </div>
    </section>
  );
}

export function IdeaWorkbench({
  activeNode,
  ideaCount,
  expansionLens = "directions",
  onExpansionLensChange,
  onAddIdea,
  onGenerateStarters,
  onSaveNode,
  onSetNodeStatus,
  onDeleteNode,
  isLoading
}) {
  const [newIdea, setNewIdea] = useState("");
  const [newIdeaType, setNewIdeaType] = useState("opportunity");
  const [editContent, setEditContent] = useState(activeNode?.content || "");
  const [editType, setEditType] = useState(activeNode?.type || "opportunity");

  const submitIdea = (event) => {
    event.preventDefault();
    const content = newIdea.trim();
    if (!content) return;
    onAddIdea(content, newIdeaType);
    setNewIdea("");
  };

  const isEditableIdea = activeNode && !activeNode.isRoot;
  const selectedLens = EXPANSION_LENSES.find((lens) => lens.value === expansionLens) || EXPANSION_LENSES[0];

  return (
    <aside className="workflow-panel idea-workbench" aria-labelledby="idea-workbench-title">
      <div className="workflow-panel-heading compact">
        <span className="workflow-panel-icon"><SparklesIcon size={17} /></span>
        <div>
          <span className="workflow-kicker">Step 2 · Diverge</span>
          <h2 id="idea-workbench-title">Capture and shape ideas</h2>
        </div>
        <span className="workflow-count">{ideaCount} ideas</span>
      </div>
      <p className="workflow-panel-intro">
        Add your own thoughts first, then ask AI for different angles. Nothing is final until you choose it.
      </p>

      <label className="lens-selector">
        <span>AI expansion lens</span>
        <select value={expansionLens} onChange={(event) => onExpansionLensChange?.(event.target.value)} disabled={isLoading}>
          {EXPANSION_LENSES.map((lens) => <option key={lens.value} value={lens.value}>{lens.label}</option>)}
        </select>
        <small>{selectedLens.help}. Every generated child will use this one lens.</small>
      </label>

      <form className="idea-capture-form" onSubmit={submitIdea}>
        <textarea
          value={newIdea}
          onChange={(event) => setNewIdea(event.target.value)}
          placeholder="Write an idea, concern, constraint, or possibility…"
          rows={2}
          maxLength={260}
          disabled={isLoading}
          aria-label="New idea"
        />
        <div className="idea-capture-controls">
          <select value={newIdeaType} onChange={(event) => setNewIdeaType(event.target.value)} disabled={isLoading} aria-label="New idea type">
            {IDEA_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button type="submit" className="workflow-btn primary" disabled={isLoading || !newIdea.trim()}>
            Add idea
          </button>
        </div>
      </form>

      <button type="button" className="workflow-btn ai-action" onClick={onGenerateStarters} disabled={isLoading}>
        <SparklesIcon size={15} /> Ask AI: {selectedLens.label}
      </button>

      {isEditableIdea && (
        <div className="idea-edit-card">
          <div className="workflow-subheading">Selected idea</div>
          <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={2} maxLength={260} disabled={isLoading} />
          <div className="idea-capture-controls">
            <select value={editType} onChange={(event) => setEditType(event.target.value)} disabled={isLoading} aria-label="Selected idea type">
              {IDEA_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <button type="button" className="workflow-btn ghost" onClick={() => onSaveNode(activeNode.id, editContent, editType)} disabled={isLoading || !editContent.trim()}>Save</button>
          </div>
          <div className="idea-status-actions" aria-label="Idea status">
            <button type="button" className={`status-btn ${activeNode.status === "shortlisted" ? "selected" : ""}`} onClick={() => onSetNodeStatus(activeNode.id, "shortlisted")} disabled={isLoading}>Shortlist</button>
            <button type="button" className={`status-btn ${activeNode.status === "parked" ? "selected" : ""}`} onClick={() => onSetNodeStatus(activeNode.id, "parked")} disabled={isLoading}>Park</button>
            <button type="button" className="status-btn danger" onClick={() => onDeleteNode(activeNode.id)} disabled={isLoading}><TrashIcon size={13} /> Delete</button>
          </div>
        </div>
      )}

      {activeNode?.isRoot && (
        <div className="workflow-selection-note">Select an idea card to edit or shortlist it. New ideas attach to the selected node.</div>
      )}
    </aside>
  );
}

export function StructureReviewPanel({
  directions,
  ideaNodes = [],
  selectedDirectionId,
  onSelectDirection,
  onChangeDirection,
  onMoveIdea,
  onAddDirection,
  criteria,
  scores = {},
  onChangeScore,
  onChangeCriterion,
  onAddCriterion,
  onRemoveCriterion,
  onBack,
  onSynthesize,
  isLoading
}) {
  return (
    <section className="workflow-panel structure-review-panel" aria-labelledby="structure-review-title">
      <div className="workflow-panel-heading">
        <span className="workflow-panel-icon"><LayersIcon size={18} /></span>
        <div>
          <span className="workflow-kicker">Step 3 · Converge</span>
          <h2 id="structure-review-title">Review the directions</h2>
        </div>
      </div>
      <p className="workflow-panel-intro">AI proposed these groupings. Rename them and choose the direction you want the report to investigate.</p>

      <div className="direction-review-list">
        {directions.map((direction) => (
          <article key={direction.direction_id} className={`direction-review ${selectedDirectionId === direction.direction_id ? "selected" : ""}`}>
            <label className="direction-select">
              <input type="radio" name="selected-direction" value={direction.direction_id} checked={selectedDirectionId === direction.direction_id} onChange={() => onSelectDirection(direction.direction_id)} />
              <span>{direction.direction_id}</span>
            </label>
            <input className="direction-title-input" value={direction.title || ""} onChange={(event) => onChangeDirection(direction.direction_id, { title: event.target.value })} maxLength={60} disabled={isLoading} aria-label={`${direction.direction_id} title`} />
            <textarea className="direction-summary-input" value={direction.summary || ""} onChange={(event) => onChangeDirection(direction.direction_id, { summary: event.target.value })} rows={2} maxLength={220} disabled={isLoading} aria-label={`${direction.direction_id} summary`} />
            <span className="direction-idea-count">{direction.idea_ids?.length || 0} linked ideas</span>
            {direction.idea_ids?.length > 0 && (
              <div className="direction-idea-list">
                {direction.idea_ids.map((ideaId) => {
                  const idea = ideaNodes.find((node) => node.id === ideaId);
                  if (!idea) return null;
                  return (
                    <div className="idea-assignment" key={ideaId}>
                      <span title={idea.content}>{idea.content}</span>
                      <select value={direction.direction_id} onChange={(event) => onMoveIdea(ideaId, event.target.value)} disabled={isLoading} aria-label={`Move ${idea.content}`}>
                        <option value="">Unassigned</option>
                        {directions.map((target) => <option key={target.direction_id} value={target.direction_id}>{target.direction_id}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        ))}
      </div>
      <button type="button" className="workflow-link-btn" onClick={onAddDirection} disabled={isLoading}>+ Add another direction</button>

      <div className="evaluation-box">
        <div className="workflow-subheading">What does “best” mean for this session?</div>
        <p className="evaluation-help">Set the criteria AI should use to challenge the options. Your selected direction remains the decision anchor.</p>
        {criteria.map((criterion) => (
          <div className="criterion-row" key={criterion.id}>
            <input value={criterion.label} onChange={(event) => onChangeCriterion(criterion.id, { label: event.target.value })} maxLength={50} disabled={isLoading} aria-label="Evaluation criterion" />
            <select value={criterion.weight} onChange={(event) => onChangeCriterion(criterion.id, { weight: Number(event.target.value) })} disabled={isLoading} aria-label={`${criterion.label} weight`}>
              {[1, 2, 3, 4, 5].map((weight) => <option key={weight} value={weight}>{weight}/5</option>)}
            </select>
            {criteria.length > 1 && <button type="button" className="criterion-remove" onClick={() => onRemoveCriterion(criterion.id)} disabled={isLoading} aria-label={`Remove ${criterion.label}`}>×</button>}
          </div>
        ))}
        <div className="score-heading">Score each direction (1 low · 5 high)</div>
        <div className="direction-score-grid">
          {directions.map((direction) => (
            <div className="direction-score-row" key={direction.direction_id}>
              <span title={direction.title}>{direction.direction_id} · {direction.title}</span>
              <div>
                {criteria.map((criterion) => (
                  <select key={`${direction.direction_id}-${criterion.id}`} value={scores?.[direction.direction_id]?.[criterion.id] ?? ""} onChange={(event) => onChangeScore(direction.direction_id, criterion.id, event.target.value ? Number(event.target.value) : null)} disabled={isLoading} aria-label={`${direction.title} ${criterion.label} score`}>
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
                  </select>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="workflow-link-btn" onClick={onAddCriterion} disabled={isLoading}>+ Add criterion</button>
      </div>

      <div className="workflow-panel-actions">
        <button type="button" className="workflow-btn ghost" onClick={onBack} disabled={isLoading}><RefreshIcon size={15} /> Keep exploring</button>
        <button type="button" className="workflow-btn primary" onClick={onSynthesize} disabled={isLoading || !selectedDirectionId || !criteria.length}>
          {isLoading ? "Analyzing…" : "Generate decision report"} <ArrowRightIcon size={16} />
        </button>
      </div>
    </section>
  );
}
