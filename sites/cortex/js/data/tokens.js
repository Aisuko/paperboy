// The single running example used throughout the tour, taken verbatim from
// the source Transformer Flow explainer's step 1-2.

export const INPUT_TEXT = 'How the weather today?';

export const TOKENS = [
	{ text: 'How', id: 154, embedding: [ 0.12, -0.03, 0.45, 0.10 ] },
	{ text: 'the', id: 39, embedding: [ 0.07, 0.22, -0.11, 0.31 ] },
	{ text: 'weather', id: 610, embedding: [ 0.44, -0.09, 0.03, 0.28 ] },
	{ text: 'today', id: 1636, embedding: [ -0.02, 0.39, 0.18, -0.07 ] },
	{ text: '?', id: 64, embedding: [ 0.15, 0.01, -0.20, 0.12 ] },
];

// "How" hidden state before/after one transformer block, from step 3.
export const HOW_BEFORE_BLOCK = [ 0.12, -0.03, 0.45, 0.10 ];
export const HOW_AFTER_BLOCK = [ 0.08, 0.14, 0.42, 0.05 ];
