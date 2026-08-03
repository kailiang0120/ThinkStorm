import { motion as Motion } from "motion/react";
import "./StageStepper.css";

/**
 * StageStepper — compact progress stepper for the header. Surfaces the stage
 * names that were previously encoded only as bare numbers, and animates the
 * connector fill as the pipeline advances.
 */
export default function StageStepper({ steps = [], current = 1, className = "" }) {
  return (
    <ol
      className={`stage-stepper ${className}`}
      aria-label={`Progress: step ${current} of ${steps.length}`}
    >
      {steps.map((label, i) => {
        const step = i + 1;
        const isComplete = step < current;
        const isCurrent = step === current;
        return (
          <li
            key={label}
            className={`stepper-step ${isComplete ? "complete" : ""} ${isCurrent ? "current" : ""}`}
            aria-current={isCurrent ? "step" : undefined}
          >
            <Motion.span
              className="stepper-marker"
              initial={false}
              animate={{ scale: isCurrent ? 1.08 : 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
            >
              {isComplete ? (
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : step}
            </Motion.span>
            <span className="stepper-label">{label}</span>
            {i < steps.length - 1 && (
              <span className="stepper-connector" aria-hidden="true">
                <Motion.span
                  className="stepper-connector-fill"
                  initial={false}
                  animate={{ scaleX: isComplete ? 1 : 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
