export const MLP_STEPS = [
	{
		title: 'What an MLP is',
		kicker: 'what',
		desc: 'Two linear layers with one nonlinearity between them, applied to every token position independently. In GPT-2 small the middle layer is four times wider than the stream: 768 → 3072 → 768.',
		formula: 'h = GELU(x·W1 + b1)\ny = h·W2 + b2',
	},
	{
		title: 'Why a Transformer needs it',
		kicker: 'why',
		desc: 'Attention only mixes tokens: each output is a weighted average of value vectors, which is a linear operation. Stack two linear maps and you still have one linear map. The MLP is where a block does nonlinear work on a position’s own vector — and where about two thirds of the model’s parameters live.',
		formula: 'attention: mixes across positions\nMLP: computes within one position',
	},
	{
		title: 'Up-projection — 3072 detectors',
		kicker: 'how 1/3',
		desc: 'Each row of W1 is a direction in the 768-d stream. Its dot product with x scores how strongly this token points that way. One score per neuron, 3072 of them.',
		formula: 'pre[j] = W1[j] · x + b1[j]',
	},
	{
		title: 'GELU — a soft gate',
		kicker: 'how 2/3',
		desc: 'Negative scores are squashed toward zero, positive ones pass almost unchanged. Only a fraction of the neurons fire for any given token, so the layer is sparse in practice — and it is the nonlinearity that makes depth worth having.',
		formula: 'GELU(z) = z·Φ(z)\n≈ 0.5z(1 + tanh[√(2/π)(z + 0.044715z³)])',
	},
	{
		title: 'Down-projection — writing back',
		kicker: 'how 3/3',
		desc: 'Every neuron owns a column of W2: a vector it adds to the output, scaled by how hard it fired. Read the pair as memory — a row of W1 is a key, a column of W2 is the value it retrieves.',
		formula: 'y = Σj act[j] · W2[:,j] + b2',
	},
	{
		title: 'Residual add',
		kicker: 'how',
		desc: 'The result is added back into the residual stream, not swapped for it. The MLP edits the representation the block was handed; every later block still sees what came before.',
		formula: 'x ← x + MLP(LayerNorm(x))',
	},
];

export const LINEAR_STEPS = [
	{
		title: 'What the linear layer is',
		kicker: 'what',
		desc: 'One matrix multiply. No activation, and in GPT-2 no bias. It takes the 768-d hidden state of the last position and produces 50,257 numbers — one per vocabulary entry. It is the final operation in the network.',
		formula: 'logits = h · Wu\nWu ∈ ℝ^(768 × 50257)',
	},
	{
		title: 'Why a Transformer needs it',
		kicker: 'why',
		desc: 'Everything before this point lives in a continuous 768-d space with no notion of words. Choosing a token needs one comparable score per vocabulary entry. This layer is the only place the vocabulary re-enters the network after the input embedding.',
		formula: '768 numbers  →  50,257 scores',
	},
	{
		title: 'How it works — 50,257 dot products',
		kicker: 'how',
		desc: 'Each column of Wu is one token’s vector. Its dot product with h is that token’s logit: an unnormalised, unbounded similarity score. Nothing is a probability yet.',
		formula: 'logit[v] = h · e[v] = Σi h[i]·e[v][i]',
	},
	{
		title: 'The same thing, geometrically',
		kicker: 'how',
		desc: 'h is one arrow; every vocabulary row is another. The logit is |h||e|cosθ, so the token whose direction sits closest to h scores highest. Steer h with the slider and watch the ranking rearrange.',
		formula: 'logit = |h| |e| cosθ',
	},
	{
		title: 'Why it is called the LM head',
		kicker: 'why the name',
		desc: 'The twelve blocks are the trunk — a general-purpose representation. A head is the thin task-specific layer bolted on top. This one predicts the next token, so: language-modelling head. Replace it with a 2-output linear layer and the same trunk does classification. GPT-2 ties this weight to the input embedding matrix, so a logit is literally how much h looks like that token’s embedding.',
		formula: 'trunk (12 blocks) → head\nlm_head.weight = wte.weight',
	},
];

export const SOFTMAX_STEPS = [
	{
		title: 'What softmax is',
		kicker: 'what',
		desc: 'A function that turns arbitrary real scores into a probability distribution: every output positive, all of them summing to 1, and the ordering of the inputs preserved.',
		formula: 'p[i] = exp(z[i]) / Σj exp(z[j])',
	},
	{
		title: 'Exponentiate',
		kicker: 'how 1/2',
		desc: 'exp is always positive and grows fast, so a gap of one logit becomes a factor of e ≈ 2.72 in probability. Implementations subtract the maximum first: softmax is unchanged by a constant shift, and it stops exp from overflowing.',
		formula: 'e[i] = exp(z[i] − max z)',
	},
	{
		title: 'Normalise',
		kicker: 'how 2/2',
		desc: 'Divide each exponential by their sum. Every bar is now a probability and the row adds to exactly 1.',
		formula: 'p[i] = e[i] / Σj e[j]',
	},
	{
		title: 'Temperature',
		kicker: 'knob',
		desc: 'Logits are divided by T before the exponent. T < 1 sharpens the distribution, T > 1 flattens it, T → 0 becomes argmax. Temperature rescales scores; it never removes a candidate.',
		formula: 'p[i] = softmax(z[i] / T)',
	},
	{
		title: 'Top-k',
		kicker: 'filter',
		desc: 'Sort by probability, keep the k highest, discard the rest and renormalise so the survivors sum to 1 again. k is a fixed count: the same width whether the model is certain or not.',
		formula: 'keep rank < k, then p ← p / Σkept p',
	},
	{
		title: 'Top-p — nucleus',
		kicker: 'filter',
		desc: 'Sort by probability, accumulate mass from the top, stop as soon as the running total reaches p, and keep exactly that prefix. The count adapts to the model: a confident step keeps one or two tokens, a flat step keeps dozens.',
		formula: 'smallest set with Σ p ≥ p, then renormalise',
	},
	{
		title: 'Applied together',
		kicker: 'in practice',
		desc: 'The usual order is temperature, softmax, top-k, top-p, renormalise, sample. Both filters act on the distribution softmax produced — neither is part of softmax itself. Libraries do it by setting the rejected logits to −inf and softmaxing once, which comes to the same thing.',
		formula: 'z / T → softmax → top-k → top-p → renorm → sample',
	},
];
