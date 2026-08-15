const SUBJECT_ICONS = {
  Physics: '🔋',
  Biology: '🌱',
  Maths: '📐',
}

// Non-3D stand-in for experiments that don't get a bespoke r3f scene
// (DESIGN.md: "the rest can run in the same dialogue-card UI over a
// simple 2D/illustrative scene"). Same /respond engine and DialogueCard
// as ChemScene — just a tap-through instead of a tap/drag gesture.
export default function GenericScene({ experiment, currentStep, disabled, onStepAction }) {
  return (
    <div className="generic-scene" style={{ '--accent': experiment.accent }}>
      <div className="generic-scene-icon">{SUBJECT_ICONS[experiment.subject] ?? '🔬'}</div>
      <div className="generic-scene-subject">{experiment.subject}</div>
      <div className="generic-scene-instruction">{currentStep.instruction}</div>
      {currentStep.concept && <div className="generic-scene-concept">{currentStep.concept}</div>}
      <button className="btn btn-primary" disabled={disabled} onClick={onStepAction}>
        I've done this
      </button>
    </div>
  )
}
