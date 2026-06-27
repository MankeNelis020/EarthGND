export { deriveRhoApparent, estimateClassDistribution, analyzeDepthCurve } from './reverse-engine';
export { computePosterior, computeChainPosterior, computeSafePosterior, getLiteratureLevel, welfordToLevel, getActivePrior, isLearningBlocked } from './bayesian-posterior';
export { processMeting } from './evidence-accumulator';
export { LITERATURE_PRIOR, CLASS_LOG_SIGMA, MIN_SOFT_N_GLOBAL, MIN_SOFT_N_REGIONAL, GRIND_CLASS } from './priors';
export type { LevelEstimate, PosteriorResult, ClassDistribution, AnalyzedDepthPoint, SoilEvidenceRow, WelfordState, ImportRecord } from './types';
