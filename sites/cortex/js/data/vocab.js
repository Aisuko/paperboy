// Mock vocabulary logits/softmax from the source Transformer Flow
// explainer's step 4-5, plus the sampling-strategy and NLL worked example
// from steps 5-6.

export const VOCAB = [
	{ token: '"weather"', id: 610, logit: 1.20, prob: 0.60 },
	{ token: 'tok_b', id: 87, logit: -0.50, prob: 0.05 },
	{ token: 'tok_c', id: 233, logit: 0.30, prob: 0.20 },
	{ token: 'tok_d', id: 912, logit: 0.10, prob: 0.10 },
	{ token: 'tok_e', id: 4, logit: 0.00, prob: 0.05 },
];

export const CORRECT_TOKEN_ID = 610;

export const SAMPLING_STRATEGIES = [
	{ key: 'greedy', label: 'Greedy / argmax', note: 'Choose probability 0.60 directly.', pickIds: [ 610 ] },
	{ key: 'topk', label: 'Top-k (k=3)', note: 'Sample only from [0.60, 0.20, 0.10] after renormalisation.', pickIds: [ 610, 233, 912 ] },
	{ key: 'topp', label: 'Top-p / nucleus (p=0.85)', note: 'Smallest cumulative set >= 0.85 is [0.60, 0.20, 0.10, ...], then sample.', pickIds: [ 610, 233, 912 ] },
];

export const NLL_EXAMPLE = {
	trainingTargetId: 610,
	trainingTargetToken: '"weather"',
	logProb: -1.61,
	nll: 1.61,
};

export const SCORE_TABLE = [
	{ type: 'Logits', range: '(-inf, +inf)', meaning: 'Raw scores' },
	{ type: 'Log probabilities', range: '(-inf, 0]', meaning: 'log(p)' },
	{ type: 'NLL', range: '[0, +inf)', meaning: '-log(p)' },
];
