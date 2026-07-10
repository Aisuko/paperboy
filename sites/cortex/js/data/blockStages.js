// The transformer-block stage sequence, from the source Transformer Flow
// explainer's step 3 and the block-placement diagram in the Self-Attention
// explainer's step 6.

export const BLOCK_STAGES = [
	{
		title: 'LayerNorm',
		type: 'layernorm',
		description: 'Hidden states are normalised before mixing, keeping activation scale stable as the stack gets deeper.',
	},
	{
		title: 'Self-Attention',
		type: 'self-attention',
		description: 'Causal self-attention lets each token absorb context from every earlier token in the sequence.',
	},
	{
		title: 'Residual add',
		type: 'residual-add',
		description: 'The attention output is added back to the block\'s input — a skip connection that keeps gradients flowing through deep stacks.',
	},
	{
		title: 'LayerNorm',
		type: 'layernorm',
		description: 'A second normalisation prepares the residual stream for the MLP.',
	},
	{
		title: 'MLP / FFN',
		type: 'mlp',
		description: 'A position-wise feed-forward network transforms each token\'s representation independently.',
	},
	{
		title: 'Residual add',
		type: 'residual-add',
		description: 'The MLP output is added back again, completing one transformer block.',
	},
];

export const BLOCK_EXAMPLE = {
	flow: 'LayerNorm -> self-attention -> residual -> LayerNorm -> MLP/FFN -> residual',
	description: 'In each decoder block, hidden states are normalised, mixed via causal self-attention, added back through a residual connection, normalised again, passed through an MLP/FFN, and added through another residual path. This lets each token absorb context from earlier tokens. GPT-2 small stacks 12 of these blocks.',
};
