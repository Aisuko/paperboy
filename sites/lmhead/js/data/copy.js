// Step copy for the four pages. One entry per scrubber node; the world's
// VIEWS array is parallel to each of these.

export const HEAD_STEPS = [
	{
		kicker: 'backbone + head',
		title: 'A trunk that understands, a head that speaks',
		desc: 'Everything left of the divider is the backbone: it turns tokens into meaning. The small green wall on the right is the LM head — the task-specific layer bolted onto the trunk. Swap it out and the same backbone can classify or rank instead of talk.',
		formula: 'model = backbone ∘ head',
	},
	{
		kicker: 'embedding',
		title: 'Tokens become vectors',
		desc: 'Each of the 5 prompt tokens is looked up in the embedding table and becomes a row of 6 numbers. From here on, the model only ever sees these vectors — the words are gone.',
		formula: 'E[token]  →  (T, d) = (5, 6)',
	},
	{
		kicker: 'transformer blocks',
		title: 'N blocks refine one stream',
		desc: 'Four transformer blocks read the whole sequence and rewrite each position\'s vector, over and over. The residual rail threads through all of them: every block adds its correction to the same running stream.',
		formula: 'h ← h + block(h)   × 4',
	},
	{
		kicker: 'final hidden state',
		title: 'Six numbers that must say everything',
		desc: 'After the last block, the vector at the final position is all the model knows about what comes next. This single d_model-sized column is the only thing the LM head ever reads.',
		formula: 'h ∈ ℝ⁶',
	},
	{
		kicker: 'the LM head',
		title: 'One matrix, vocab-many scores',
		desc: 'The head is just a linear layer: a 6×16 weight matrix that projects the hidden vector onto every word in the vocabulary at once. No activation, no magic — sixteen dot products.',
		formula: 'z = h · W   (6,)·(6,16) → (16,)',
	},
	{
		kicker: 'softmax',
		title: 'Scores become a distribution',
		desc: 'Softmax turns the 16 raw scores into 16 probabilities that sum to one. That distribution over the vocabulary — a guess about the next word — is why the head is called a *language-model* head.',
		formula: 'p = softmax(z)   Σp = 1',
	},
];

export const PROJ_STEPS = [
	{
		kicker: 'the cast',
		title: 'One vector meets one matrix',
		desc: 'On the left, the hidden vector h — six numbers. In the middle, the head\'s weight matrix W — one column per vocabulary word. Below, sixteen empty slots waiting for scores.',
		formula: 'h (6,) · W (6,16) → z (16,)',
	},
	{
		kicker: 'why linear',
		title: 'No activation, on purpose',
		desc: 'The backbone already did the nonlinear work. The head\'s only job is to measure how well h matches each word\'s direction — and softmax follows immediately, supplying all the nonlinearity the output needs. A plain matmul is exactly enough.',
		formula: 'z = h·W    (no ReLU, no GELU)',
	},
	{
		kicker: 'one dot product',
		title: 'One logit is one column',
		desc: 'Pick a column j: its score is the dot product of h with that column. Six multiplies, six adds. A word whose column points the same way as h gets a big logit; use the slider to walk the columns.',
		formula: 'z[j] = Σₖ h[k] · W[k][j]',
	},
	{
		kicker: 'all at once',
		title: 'Sixteen dot products in one matmul',
		desc: 'The full projection is just that dot product repeated for every column — one matrix-vector multiply fills all sixteen slots in a single pass. Watch the sweep.',
		formula: 'z = h·W   2·d·V FLOPs = 192',
	},
	{
		kicker: 'no bias',
		title: 'Usually not even a bias',
		desc: 'GPT-2, Llama and most modern heads drop the bias term: softmax only cares about differences between logits, and a constant per-word offset adds little the embedding can\'t learn. The ghost strip fading out is the bias that isn\'t there.',
		formula: 'z = h·W + b̶',
	},
	{
		kicker: 'at decode time',
		title: 'The matmul you pay for every token',
		desc: 'Generating one token means reading the entire d×V matrix to produce one row of logits. At batch 1 that is a memory-bound matmul — the roofline story from the memory-accounting site, starring the biggest matrix in the model.',
		formula: 'read d·V weights → emit V logits',
	},
];

export const SOFT_STEPS = [
	{
		kicker: 'raw logits',
		title: 'Scores with no ceiling',
		desc: 'Straight out of the head, logits are unbounded — positive, negative, any scale. Bars above the line are words the model favours; bars below are words it is pushing away. You cannot read them as probabilities yet.',
		formula: 'z ∈ ℝ¹⁶   unbounded',
	},
	{
		kicker: 'stability',
		title: 'Subtract the max first',
		desc: 'Softmax starts by shifting every logit so the biggest one sits at zero. Mathematically it changes nothing — softmax only sees differences — but it stops eᶻ from overflowing float math. Every real implementation does this.',
		formula: 'z′ = z − max(z)',
	},
	{
		kicker: 'exponentiate',
		title: 'e to the everything',
		desc: 'Exponentiation makes every score positive and stretches the gaps: a word 2 logits ahead becomes e² ≈ 7.4× more likely, not 2 more. This is where "slightly better" turns into "usually chosen".',
		formula: 'eᶻ′ ∈ (0, 1]',
	},
	{
		kicker: 'normalise',
		title: 'Divide by the sum: a distribution',
		desc: 'Divide each exponential by their total and the sixteen bars now sum to exactly one — a proper probability distribution over the vocabulary. This is the model\'s actual answer: not a word, a bet on every word.',
		formula: 'p[j] = eᶻ′ʲ / Σₖ eᶻ′ᵏ   Σp = 1',
	},
	{
		kicker: 'temperature',
		title: 'One knob reshapes the bet',
		desc: 'Divide the logits by T before softmax. T < 1 sharpens the distribution toward the favourite; T > 1 flattens it toward uniform. Same logits, very different behaviour — move the slider and watch.',
		formula: 'p = softmax(z / T)',
	},
	{
		kicker: 'sampling',
		title: 'Then someone has to pick',
		desc: 'The model never chooses a word — the sampler does. Greedy takes the argmax, top-k keeps only the k best before drawing, plain sampling draws from the full distribution. Pick a strategy and press sample.',
		formula: 'next = sample(p)',
	},
];

export const DIMS_STEPS = [
	{
		kicker: 'two numbers',
		title: 'd_model × vocab_size',
		desc: 'The head\'s entire shape is set by two numbers: the width of the backbone and the size of the tokeniser\'s vocabulary. Our toy is 6×16 = 96 weights. Real models replace both numbers with something much bigger.',
		formula: 'params(head) = d · V',
	},
	{
		kicker: 'to scale',
		title: 'The toy vanishes',
		desc: 'The framed rectangles are real heads drawn on a log scale — GPT-2 at 768×50257, Llama-3 70B at 8192×128256. The toy head is the dot in the corner. Vocabulary is always the long axis: V outgrows d in every generation.',
		formula: 'axes are log₁₀ · (d × V)',
	},
	{
		kicker: 'parameter count',
		title: 'Often the single largest matrix',
		desc: 'GPT-2\'s head is 38.6M weights — 31% of the whole 124M model. Llama-3 8B\'s is 525M. No other single matrix in these models is bigger; the "small task-specific layer" is a giant.',
		formula: '768 · 50257 = 38.6M   (31%)',
	},
	{
		kicker: 'weight tying',
		title: 'Reuse the embedding, halve the bill',
		desc: 'The embedding maps words→vectors with a V×d table; the head maps vectors→words with d×V. Tie them — use the embedding\'s transpose as the head — and you store the matrix once. GPT-2 ties; Llama-3 keeps them separate.',
		formula: 'W_head = Eᵀ',
	},
	{
		kicker: 'growth',
		title: 'The two axes grow apart',
		desc: 'From GPT-2 to Llama-3, d_model grew ~11× but vocab grew only ~2.6× — and vocab growth mostly buys better tokenisation of code and other languages, not model capacity. The head\'s cost rides on both.',
		formula: 'd: 768→8192 · V: 50257→128256',
	},
	{
		kicker: 'swap the head',
		title: 'Why "head" is the right word',
		desc: 'Keep the backbone, unbolt the LM head, and screw on a 2-column linear layer: now it\'s a classifier. A 1-column one: a reward model. The ghost heads beside the real one are the same trunk doing different jobs — that is all "head" ever meant.',
		formula: 'backbone + any (d × k) head',
	},
];
