// The single running example used across every page.
//
// The prompt is a grammatical English sentence fragment, and the IDs are the
// real GPT-2 byte-pair-encoding IDs for it — the leading space is part of the
// token, which is why " is" and " the" carry one. Embedding values are
// illustrative stand-ins for the 768-dimensional rows of `wte`; only their
// relative geometry matters, and the pages that use them say so.

export const INPUT_TEXT = 'How is the weather today';

export const TOKENS = [
	{ text: 'How', display: 'How', id: 2437, position: 0, embedding: [ 0.12, -0.03, 0.45, 0.10 ] },
	{ text: ' is', display: '·is', id: 318, position: 1, embedding: [ 0.07, 0.22, -0.11, 0.31 ] },
	{ text: ' the', display: '·the', id: 262, position: 2, embedding: [ 0.05, 0.19, -0.07, 0.28 ] },
	{ text: ' weather', display: '·weather', id: 6193, position: 3, embedding: [ 0.44, -0.09, 0.03, 0.26 ] },
	{ text: ' today', display: '·today', id: 1909, position: 4, embedding: [ -0.02, 0.39, 0.18, -0.07 ] },
];

// The final hidden state at the last position (" today") after all 12 blocks —
// the vector the language-model head actually consumes on 04 Output.
export const FINAL_HIDDEN_STATE = [ 0.31, -0.42, 0.08, 0.55, -0.17, 0.24, 0.02, -0.36 ];
