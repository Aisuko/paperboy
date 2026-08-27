// The 7-step self-attention walkthrough. Every dimension quoted is GPT-2
// small's (see data/gpt2.js); `trace` is what the left-hand console prints as
// each step comes on screen.

import { GPT2 } from './gpt2.js';

const SEQ = 5;

export const ATTENTION_STEPS = [
	{
		title: '1. Project into Q, K and V',
		copy: 'Each head projects the block input into three different views of the same token: a query (what am I looking for?), a key (what do I offer?) and a value (what do I contribute if chosen?).',
		equations: [ 'Q_h = X W^Q_h', 'K_h = X W^K_h', 'V_h = X W^V_h' ],
		trace: [
			{ text: `in    x         [1, ${ SEQ }, ${ GPT2.dModel }]`, kind: 'dim' },
			{ text: `op    c_attn    [${ GPT2.dModel }, ${ 3 * GPT2.dModel }]  →  q, k, v`, kind: 'calc' },
			{ text: `split ${ GPT2.nHead } heads × ${ GPT2.dHead } dims`, kind: 'out' },
		],
	},
	{
		title: '2. Score every pair, then scale',
		copy: 'The dot product of a query with a key measures how relevant one token is to another. Dividing by √d_k stops those dot products growing with head size, which would drive softmax into a one-hot spike and kill the gradient.',
		equations: [ 'S_h = Q_h K_hᵀ / √d_k', `d_k = ${ GPT2.dHead },  √d_k = ${ Math.sqrt( GPT2.dHead ).toFixed( 0 ) }` ],
		trace: [
			{ text: `calc  q @ kᵀ     [${ SEQ }, ${ GPT2.dHead }] × [${ GPT2.dHead }, ${ SEQ }]  →  [${ SEQ }, ${ SEQ }]`, kind: 'calc' },
			{ text: `scale ÷ √${ GPT2.dHead } = ${ Math.sqrt( GPT2.dHead ).toFixed( 0 ) }`, kind: 'out' },
			{ text: 'mask  j > i set to −inf before softmax', kind: 'warn' },
			{ text: 'norm  softmax along each row → rows sum to 1', kind: 'calc' },
		],
	},
	{
		title: '3. Weight the values',
		copy: 'Each row of the attention matrix is a set of mixing weights. Multiplying it by V produces one output vector per token: a weighted blend of everything that token was allowed to look at.',
		equations: [ 'Z_h = A_h V_h' ],
		trace: [
			{ text: `calc  A @ V      [${ SEQ }, ${ SEQ }] × [${ SEQ }, ${ GPT2.dHead }]  →  [${ SEQ }, ${ GPT2.dHead }]`, kind: 'calc' },
			{ text: `out   one ${ GPT2.dHead }-dim vector per token, per head`, kind: 'dim' },
		],
	},
	{
		title: '4. Concatenate the heads',
		copy: 'All twelve head outputs are laid end to end, restoring the model width. Up to this point no head has seen what any other head did.',
		equations: [ 'Z = Concat(Z_1, …, Z_H)', `${ GPT2.nHead } × ${ GPT2.dHead } = ${ GPT2.dModel }` ],
		trace: [
			{ text: `calc  concat ${ GPT2.nHead } × [${ SEQ }, ${ GPT2.dHead }]  →  [${ SEQ }, ${ GPT2.dModel }]`, kind: 'calc' },
		],
	},
	{
		title: '5. Project the heads back together (W^O)',
		copy: 'The concatenated output is passed through one more linear layer. This is the only place the heads mix with each other — remove W^O and twelve heads stay twelve independent channels.',
		equations: [ 'AttentionOutput = Z W^O', `W^O: [${ GPT2.dModel }, ${ GPT2.dModel }]` ],
		trace: [
			{ text: `op    c_proj    [${ GPT2.dModel }, ${ GPT2.dModel }]`, kind: 'calc' },
			{ text: `out   attn_out  [1, ${ SEQ }, ${ GPT2.dModel }]`, kind: 'dim' },
		],
	},
	{
		title: '6. Where it sits in the block',
		copy: 'The attention output does not replace the residual stream — it is added into it, and the MLP that follows reads the result. This is the sub-block that 02 Block walks through end to end.',
		equations: [ 'ln_1 → attention → +residual → ln_2 → MLP → +residual' ],
		trace: [
			{ text: 'calc  x ← x + attn_out', kind: 'calc' },
			{ text: `note  ${ GPT2.nLayer } blocks stacked, all identically shaped`, kind: 'note' },
		],
	},
	{
		title: '7. What it costs',
		copy: 'Attention is quadratic in sequence length: every new token is scored against every token before it. That is the number the KV cache exists to stop from being paid twice.',
		equations: [ 'scores per step ∝ n', 'scores over a full generation ∝ n²' ],
		trace: [
			{ text: `calc  ${ SEQ } tokens → ${ ( SEQ * ( SEQ + 1 ) ) / 2 } scored pairs per head`, kind: 'calc' },
			{ text: `calc  × ${ GPT2.nHead } heads × ${ GPT2.nLayer } layers = ${ ( ( SEQ * ( SEQ + 1 ) ) / 2 ) * GPT2.nHead * GPT2.nLayer } dot products`, kind: 'out' },
			{ text: 'note  at 1024 tokens that is 77M per forward pass', kind: 'note' },
		],
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
