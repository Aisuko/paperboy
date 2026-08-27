// One GPT-2 decoder block, stage by stage.
//
// GPT-2 uses the *pre-LN* arrangement: LayerNorm runs on the way *into* each
// sub-block and the residual add closes it. The original 2017 paper
// (Vaswani et al., "Attention Is All You Need", §3.1) put LayerNorm after the
// residual add instead — post-LN. Pre-LN is what GPT-2 ships and what every
// diagram here shows; the difference is called out on the page rather than
// quietly glossed over.
//
// `trace` is what the left-hand console prints for the stage: the tensor shapes
// and parameter counts a GPT-2 small block actually moves through.

import { GPT2 } from './gpt2.js';

const SEQ = 5; // tokens in the running example
const D = GPT2.dModel;

export const BLOCK_STAGES = [
	{
		title: 'LayerNorm (ln_1)',
		type: 'layernorm',
		description: 'Each token vector is normalised to zero mean and unit variance across its 768 features, then rescaled by a learned gain and bias. This keeps activation scale stable as the stack gets deeper.',
		formula: 'x̂ = γ ⊙ (x − μ) / √(σ² + ε) + β',
		trace: [
			{ text: `in    x        [1, ${ SEQ }, ${ D }]`, kind: 'dim' },
			{ text: 'op    ln_1: per-token mean/var over 768 features', kind: 'calc' },
			{ text: 'stats mean 0.0000   var 1.0000   ε 1e-5', kind: 'out' },
			{ text: `param γ, β        2 × ${ D } = ${ 2 * D }`, kind: 'dim' },
		],
	},
	{
		title: 'Masked self-attention',
		type: 'self-attention',
		description: 'Causal self-attention lets each token read every earlier token in the sequence and itself, but nothing after it. Twelve heads do this in parallel over 64 dimensions each.',
		formula: 'Attention(Q, K, V) = softmax(QKᵀ / √d_k + M) V',
		trace: [
			{ text: `op    c_attn: x @ W_qkv    [${ D }, ${ 3 * D }]`, kind: 'calc' },
			{ text: `out   q, k, v    each [1, ${ GPT2.nHead }, ${ SEQ }, ${ GPT2.dHead }]`, kind: 'dim' },
			{ text: `calc  scores = q @ kᵀ / √${ GPT2.dHead }  →  [${ GPT2.nHead }, ${ SEQ }, ${ SEQ }]`, kind: 'calc' },
			{ text: 'mask  upper triangle set to −inf (causal)', kind: 'warn' },
			{ text: `op    c_proj: heads @ W_o    [${ D }, ${ D }]`, kind: 'calc' },
		],
	},
	{
		title: 'Residual add',
		type: 'residual-add',
		description: 'The attention output is added back to the block\'s input. The residual stream is never overwritten — every sub-block only ever writes a correction into it, which is what lets gradients reach the bottom of a 12-block stack.',
		formula: 'x = x + Attn(ln_1(x))',
		trace: [
			{ text: `calc  x ← x + attn_out    [1, ${ SEQ }, ${ D }]`, kind: 'calc' },
			{ text: 'note  the input is preserved, not replaced', kind: 'note' },
		],
	},
	{
		title: 'LayerNorm (ln_2)',
		type: 'layernorm',
		description: 'A second normalisation prepares the updated residual stream for the feed-forward network. Same operation as ln_1, separate learned parameters.',
		formula: 'x̂ = γ₂ ⊙ (x − μ) / √(σ² + ε) + β₂',
		trace: [
			{ text: 'op    ln_2: per-token mean/var over 768 features', kind: 'calc' },
			{ text: 'stats mean 0.0000   var 1.0000', kind: 'out' },
		],
	},
	{
		title: 'MLP / feed-forward',
		type: 'mlp',
		description: 'A position-wise feed-forward network: project 768 up to 3072, apply GELU, project back down to 768. Every token goes through it independently — this is where most of a block\'s parameters live.',
		formula: 'MLP(x) = GELU(x W₁ + b₁) W₂ + b₂',
		trace: [
			{ text: `op    c_fc:   [${ D }, ${ GPT2.dFF }]   →  [1, ${ SEQ }, ${ GPT2.dFF }]`, kind: 'calc' },
			{ text: 'act   GELU', kind: 'out' },
			{ text: `op    c_proj: [${ GPT2.dFF }, ${ D }]  →  [1, ${ SEQ }, ${ D }]`, kind: 'calc' },
			{ text: `param ≈ ${ ( ( 2 * D * GPT2.dFF ) / 1e6 ).toFixed( 1 ) }M — about two-thirds of the block`, kind: 'dim' },
		],
	},
	{
		title: 'Residual add',
		type: 'residual-add',
		description: 'The MLP output is added back to the residual stream, closing the block. GPT-2 small repeats this whole sequence 12 times before a final LayerNorm hands the stream to the output head.',
		formula: 'x = x + MLP(ln_2(x))',
		trace: [
			{ text: `calc  x ← x + mlp_out    [1, ${ SEQ }, ${ D }]`, kind: 'calc' },
			{ text: `note  block complete — ${ GPT2.nLayer - 1 } more to go`, kind: 'note' },
		],
	},
];

export const BLOCK_SUMMARY = {
	flow: 'ln_1 → attention → +residual → ln_2 → MLP → +residual',
	note: `GPT-2 normalises on the way into each sub-block (pre-LN). The original 2017 Transformer normalised after the residual add (post-LN) instead — the same six pieces, wired in a different order.`,
};
