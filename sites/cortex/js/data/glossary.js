// The terms worth knowing, each pointing back at the page where it does its
// work. Definitions are written against GPT-2 small (see data/gpt2.js).

export const GLOSSARY = [
	{
		id: 'token',
		term: 'Token',
		blurb: 'A unit of text with a unique integer ID.',
		description: 'Tokenisation splits text into sub-word units and assigns each one an integer ID. GPT-2 uses byte-pair encoding over a 50,257-token vocabulary, and the leading space is part of the token — " weather" and "weather" are different IDs. More tokens means more compute, quadratically so in attention.',
		jump: 'tokenize',
	},
	{
		id: 'embedding',
		term: 'Embedding',
		blurb: 'The 768-dimensional vector a token ID looks up.',
		description: 'The token-embedding matrix wte has one row per vocabulary entry. A token ID is not fed to the model as a number — it indexes a row, and that row, plus a positional embedding from wpe, is the vector the first block actually receives.',
		jump: 'tokenize',
	},
	{
		id: 'residual-stream',
		term: 'Residual stream',
		blurb: 'The per-token vector every block reads from and writes back into.',
		description: 'Each sub-block computes a correction and adds it to the stream rather than replacing it. That is why a 12-block stack still trains: gradients have an unobstructed additive path from the loss back to the embeddings.',
		jump: 'block',
	},
	{
		id: 'attention-head',
		term: 'Attention head',
		blurb: 'One of twelve parallel 64-dimensional attention channels.',
		description: 'Every head runs the same query–key–value computation over its own 64-dimensional slice. Heads never see each other until the output projection W^O mixes their concatenated results back into 768 dimensions.',
		jump: 'attention',
	},
	{
		id: 'output-embedding',
		term: 'Output embedding',
		blurb: 'The final hidden state, after the last block and final LayerNorm.',
		description: 'After all 12 blocks and a final LayerNorm, each position holds one 768-dimensional vector. Only the last position matters when predicting the next token — that vector is what the language-model head consumes.',
		jump: 'output',
	},
	{
		id: 'lm-head',
		term: 'LM head (linear layer)',
		blurb: 'The linear projection from 768 dimensions to 50,257 logits.',
		description: 'logits = h · Wᵀ. In GPT-2 the weight is tied to the input embedding matrix, so the head is literally wte transposed: a token scores highly when the final hidden state points in the direction of that token\'s embedding row.',
		jump: 'output',
	},
	{
		id: 'temperature',
		term: 'Temperature',
		blurb: 'A divisor on the logits, applied before softmax.',
		description: 'softmax(z / T). T below 1 sharpens the distribution towards the argmax; T above 1 flattens it and gives unlikely tokens a real chance. It rescales confidence without changing the ranking — the order of the candidates is identical at every temperature.',
		jump: 'output',
	},
	{
		id: 'softmax',
		term: 'Softmax',
		blurb: 'Turns a vector of logits into probabilities that sum to 1.',
		description: 'p_i = exp(z_i) / Σ_j exp(z_j). It is computed jointly over the whole vocabulary, so a logit cannot be converted to a probability on its own — every other logit is part of the denominator.',
		jump: 'output',
	},
	{
		id: 'top-p',
		term: 'Top-p (nucleus) sampling',
		blurb: 'Keep the smallest set of tokens whose probability reaches p, then sample.',
		description: 'Sort by probability, accumulate until the total reaches p, discard the tail and renormalise. Unlike top-k it adapts: a confident step keeps one or two candidates, an uncertain one keeps many.',
		jump: 'output',
	},
	{
		id: 'nll',
		term: 'NLL / cross-entropy',
		blurb: 'The training loss: −log of the probability given to the correct token.',
		description: 'NLL = −log P(y_true | context). Zero would mean total confidence in the right answer; the loss grows without bound as that probability approaches zero. Averaged over every position in a batch, this is what gradient descent minimises.',
		jump: 'train',
	},
];
