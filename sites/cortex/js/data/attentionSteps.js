// The 7-step self-attention walkthrough, content reproduced verbatim from
// the source Self-Attention Mechanism explainer.

export const ATTENTION_STEPS = [
	{
		title: '1. Compute Q, K, V for each head',
		copy: 'Inside one transformer layer, each head first projects the input hidden states into queries, keys, and values.',
		equations: [ 'Q_h = X W^Q_h', 'K_h = X W^K_h', 'V_h = X W^V_h' ],
	},
	{
		title: '2. Compute attention weights',
		copy: 'The core of self-attention: Q_h K_h^T finds token-to-token similarity, then dividing by sqrt(d_k) keeps softmax from getting too sharp as head dimension grows.',
		equations: [ 'A_h = softmax((Q_h K_h^T) / sqrt(d_k))' ],
	},
	{
		title: '3. Apply attention to values',
		copy: 'The attention matrix aggregates value vectors — this is the output of one head.',
		equations: [ 'Z_h = A_h V_h' ],
	},
	{
		title: '4. Concatenate all heads',
		copy: 'All head outputs are concatenated into one vector whose size matches d_model.',
		equations: [ 'Z = Concat(Z_1, Z_2, ..., Z_H)' ],
	},
	{
		title: '5. Apply output projection (W^O)',
		copy: 'After concatenation, the multi-head output is projected once more with W^O — applied immediately after concatenation, as the final step of the multi-head attention block.',
		equations: [ 'AttentionOutput = Z W^O' ],
	},
	{
		title: '6. Where it sits in the full block',
		copy: 'The attention sub-block order, from Q/K/V projections through to the residual connection and MLP.',
		equations: [ 'Q, K, V -> weights -> heads (Z1..ZH) -> concat -> W^O -> residual -> MLP' ],
	},
	{
		title: '7. Summary + conceptual check',
		copy: 'W^O is applied immediately after concatenating all attention-head outputs, as the final linear projection inside the self-attention block. Remove it, and heads can no longer mix information with each other.',
		equations: [],
	},
];

// Illustrative causal attention matrix (row i only attends to columns <= i,
// matching the decoder-only theme of the running example) for the 3D
// heatmap grid — not a real trained model's weights.
export const MOCK_ATTENTION_MATRIX = [
	1.00, 0.00, 0.00, 0.00, 0.00,
	0.55, 0.45, 0.00, 0.00, 0.00,
	0.30, 0.25, 0.45, 0.00, 0.00,
	0.20, 0.15, 0.30, 0.35, 0.00,
	0.15, 0.10, 0.25, 0.20, 0.30,
];

// Multi-head mock data: deterministic per-head variants of
// MOCK_ATTENTION_MATRIX (seeded jitter, not Math.random()) that preserve the
// causal zero-mask (row i only nonzero for cols <= i) and renormalise each
// row to sum to 1 — illustrative only, not a real trained model's weights.
// GPT-2 small uses 12 attention heads per block.
export const HEAD_COUNT = 12;

function seededJitter( seed ) {

	const x = Math.sin( seed * 12.9898 ) * 43758.5453;
	return x - Math.floor( x );

}

function jitterCausalMatrix( base, headIndex ) {

	const cols = 5;
	const rows = Math.ceil( base.length / cols );
	const out = base.slice();

	for ( let r = 0; r < rows; r ++ ) {

		const nonzero = [];
		for ( let c = 0; c <= r; c ++ ) nonzero.push( r * cols + c );

		let sum = 0;
		nonzero.forEach( ( idx, k ) => {

			const jitter = 0.7 + seededJitter( headIndex * 97 + idx * 13 + k ) * 0.6;
			out[ idx ] = base[ idx ] * jitter;
			sum += out[ idx ];

		} );

		nonzero.forEach( ( idx ) => { out[ idx ] = sum > 0 ? out[ idx ] / sum : 0; } );

	}

	return out;

}

export const HEAD_MATRICES = Array.from( { length: HEAD_COUNT }, ( _, h ) => jitterCausalMatrix( MOCK_ATTENTION_MATRIX, h ) );

// Small deterministic per-head "strength" scalar, used to vary ribbon width
// on head switch without rebuilding geometry.
export const HEAD_STRENGTH = Array.from( { length: HEAD_COUNT }, ( _, h ) => 0.8 + seededJitter( h * 31 + 5 ) * 0.4 );

export const SCALING_NOTE = {
	title: 'Why divide by sqrt(d_k)?',
	lines: [ 'q . k = sum_{t=1}^{d_k} (q_t k_t)', 'Var(q . k) is proportional to d_k' ],
	copy: 'Without scaling, larger head dimensions produce larger dot-product magnitudes, so softmax becomes too sharp — e.g. [100, 2, 1] -> [1, 0, 0] — causing tiny gradients and unstable training.',
};

// Naive-recompute vs KV-cache framing for Q/K/V compute cost, shown while
// steps 1-2 (Q/K/V + attention-weight compute) are on screen. K and V for
// past tokens don't change once written, so a real decoder caches them
// instead of recomputing K/V for every earlier token on every generation
// step — this is the concrete "self-attention is expensive" point.
export const KV_CACHE_NOTE = {
	title: 'Recomputing K/V is wasteful',
	copy: 'Naively, generating each new token recomputes K and V for every earlier token too — O(n) work per step, O(n^2) over a full generation. A KV cache stores each token\'s K/V once and reuses them, so only the newest token needs fresh K/V.',
	opsLabel: ( n ) => ( { naive: ( n * ( n + 1 ) ) / 2, cache: n } ),
};
