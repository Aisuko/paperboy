export const RESIDUAL_STEPS = [
	{
		kicker: 'the stream',
		title: 'One vector, written to L times',
		desc: 'A transformer block never replaces its input. Attention and the MLP each read the residual stream, compute a correction, and add it back. The same d-dimensional vector carries the token from the embedding all the way to the head.',
		formula: 'x ← x + Attn(x)   then   x ← x + MLP(x)',
	},
	{
		kicker: 'the problem',
		title: 'Variance adds, so the scale drifts up',
		desc: 'Two roughly independent vectors added together have the sum of their variances. Do that twice a block for L blocks and the stream grows like √(1 + 2L) with nothing pulling it back — a 32-layer model ends about eight times louder than it started.',
		formula: 'var(x + F) = var(x) + var(F)   →   rms ≈ √(1 + 2L)',
	},
	{
		kicker: 'what breaks',
		title: 'Three things break at once',
		desc: 'Attention logits are a dot product of two scaled vectors, so they grow with the square of the scale and softmax saturates into a one-hot. Pre-activations run off the useful part of the nonlinearity. And in float16 the whole thing has 65,504 of headroom before it becomes inf.',
		formula: 'q·k ∝ s²   ·   softmax saturates   ·   fp16 max 65,504',
	},
	{
		kicker: 'post-norm',
		title: 'Post-norm: the norm sits on the highway',
		desc: 'The 2017 Transformer normalised after the addition, so the residual path itself passes through a norm in every block. That pins the stream at rms 1, but every backward pass is rescaled 2L times on the way down, gradients near the output start large, and the run needs learning-rate warm-up to survive the first steps.',
		formula: 'x ← LayerNorm(x + F(x))',
	},
	{
		kicker: 'pre-norm',
		title: 'Pre-norm: normalise the branch, not the road',
		desc: 'GPT-2 moved the norm to the input of each sub-block and added one more before the head. The residual path is now a clean identity from block 1 to block L, so the gradient reaches the bottom unscaled. The stream still grows — but every sub-layer reads a normalised copy, which is the part that mattered.',
		formula: 'x ← x + F(LayerNorm(x))   +   final norm',
	},
	{
		kicker: 'why it works',
		title: 'What a norm actually buys',
		desc: 'Not "internal covariate shift". A norm makes the layer invariant to the scale of what it is fed, which flattens the loss surface, decouples the gradient from the activation magnitude, and lets you raise the learning rate. Everything downstream — attention logits, activation ranges, fp16 headroom — inherits a fixed scale for free.',
		formula: 'N(a · x) = N(x)   →   ∂L/∂x scales as 1/‖x‖',
	},
];

export const NORM_STEPS = [
	{
		kicker: 'the input',
		title: 'One token, d numbers',
		desc: 'Normalisation in a transformer is per token, across the feature axis — never across the batch. Each token gets its own statistics, which is why the same maths works at batch size 1 and why nothing has to be tracked between training and inference.',
		formula: 'x ∈ ℝᵈ   ·   d = 768 (GPT-2) … 18,432 (PaLM)',
	},
	{
		kicker: 'LayerNorm',
		title: 'Step 1 — subtract the mean',
		desc: 'LayerNorm first re-centres: compute μ over the d features and subtract it, so the vector now has mean exactly zero. This is the half of LayerNorm that RMSNorm throws away, and the reason the two disagree the moment the input has a mean.',
		formula: 'μ = (1/d) Σᵢ xᵢ   ·   x̃ = x − μ',
	},
	{
		kicker: 'LayerNorm',
		title: 'Step 2 — divide by σ, then scale and shift',
		desc: 'Variance is taken over the centred vector, the square root of it plus ε divides through, and two learned d-vectors — a gain γ and a bias β — put the layer back in control of the scale it wants. Two parameters per feature.',
		formula: 'y = γ ⊙ (x − μ)/√(σ² + ε) + β',
	},
	{
		kicker: 'RMSNorm',
		title: 'Drop the mean entirely',
		desc: 'RMSNorm divides by the root mean square of the raw vector. No μ, no subtraction, no β. The hypothesis it tests is that re-centring invariance was never doing the work — only re-scaling invariance was — and the ablations agreed.',
		formula: 'rms(x) = √((1/d) Σᵢ xᵢ² + ε)   ·   y = γ ⊙ x/rms(x)',
	},
	{
		kicker: 'the difference',
		title: 'They differ by exactly the mean',
		desc: 'When the input already has mean zero the two normalise to the same vector and only β separates them. Push the mean away from zero and LayerNorm ignores it entirely while RMSNorm carries it straight through — LayerNorm is invariant to a shift, RMSNorm only to a scale.',
		formula: 'LN(x + c·1) = LN(x)   ·   RMS(x + c·1) ≠ RMS(x)',
	},
	{
		kicker: 'the cost',
		title: 'Two reductions become one',
		desc: 'LayerNorm needs a pass for μ and a pass for σ² and carries 2d parameters. RMSNorm needs one reduction and d parameters. Both read d values and write d values, so both are memory-bound — the saving is the extra sweep, the bias load, and a shorter backward, worth 7–64% of step time in the original paper.',
		formula: '7 ops/element and 2d params  →  4 ops/element and d params',
	},
	{
		kicker: 'adoption',
		title: 'Why everything migrated',
		desc: 'Same quality, less work, fewer tensors, and it composes with the other thing large models did — dropping biases everywhere for stability. GPT-1/2/3 and BERT are LayerNorm; T5, PaLM, LLaMA, Mistral, Qwen and Gemma are RMSNorm. The choice is now effectively settled.',
		formula: 'LayerNorm: γ, β   ·   RMSNorm: γ only',
	},
];

export const ACT_STEPS = [
	{
		kicker: 'why any',
		title: 'Without one, the MLP is a single matrix',
		desc: 'The feed-forward sub-block is two projections with something pointwise in between. Remove the nonlinearity and W₁W₂ collapses to one matrix — the block would have the same expressive power as a linear map and the depth would be free of charge.',
		formula: 'FFN(x) = σ(x W₁) W₂   ·   σ = identity ⇒ W₁W₂',
	},
	{
		kicker: 'ReLU',
		title: 'ReLU — the cheap one',
		desc: 'max(0, x). One comparison per element, exact sparsity in the output, and a derivative that is either 0 or 1. The flat half is also the problem: a unit pushed negative gets no gradient at all, and the kink at the origin is a discontinuity the optimiser can feel.',
		formula: 'relu(x) = max(0, x)   ·   relu′(x) = 1[x > 0]',
	},
	{
		kicker: 'GeLU',
		title: 'GeLU — gate by probability',
		desc: 'Multiply x by the chance a standard normal lands below it. Large positive inputs pass almost untouched, large negative ones are almost erased, and in between the transition is smooth. It dips to −0.170 near x = −0.752, so unlike ReLU it is not monotonic. The tanh form is an approximation kept for speed.',
		formula: 'gelu(x) = x·Φ(x) ≈ 0.5x(1 + tanh(√(2/π)(x + 0.044715x³)))',
	},
	{
		kicker: 'Swish',
		title: 'Swish — the same shape, from a sigmoid',
		desc: 'x·σ(βx) traces almost the same curve as GeLU using one sigmoid instead of an erf. β is a dial: at β → 0 it flattens to x/2, at β → ∞ it becomes ReLU. β = 1 is SiLU, and SiLU is what sits inside SwiGLU.',
		formula: 'swish_β(x) = x · σ(βx)   ·   σ(z) = 1/(1 + e⁻ᶻ)',
	},
	{
		kicker: 'SeLU',
		title: 'SeLU — a normaliser disguised as an activation',
		desc: 'A scaled exponential unit whose two constants are solved, not tuned, so that with LeCun-normal init the activations converge to mean 0 and variance 1 by themselves. It is a norm layer folded into the nonlinearity — and it lost, because pre-norm with an explicit RMSNorm does the same thing without constraining the initialisation.',
		formula: 'λ = 1.05070099   ·   α = 1.67326324',
	},
	{
		kicker: 'does it matter',
		title: 'Between these four: barely',
		desc: 'On a matched T5 baseline the pointwise choices land within about 0.015 log-perplexity of each other — real, reproducible, and small. What separates them is smoothness at the origin and whether the negative half keeps a gradient, not the exact curve. The change that actually moved the number was structural, not pointwise.',
		formula: 'ReLU 1.997 · Swish 1.994 · GeLU 1.983   (65k steps)',
	},
];

export const GLU_STEPS = [
	{
		kicker: 'the baseline',
		title: 'Two matrices and a curve',
		desc: 'Up-project d to d_ff, apply the activation, project back. Every element of the hidden layer is decided by one number passed through one fixed function — there is no way for one hidden unit to switch another off.',
		formula: 'FFN(x) = σ(x W₁) W₂   ·   2 · d · d_ff parameters',
	},
	{
		kicker: 'the gate',
		title: 'Add a second projection whose job is to multiply',
		desc: 'A gated linear unit computes two projections of the same input. One goes through a nonlinearity and becomes a gate; the other stays linear and becomes the value. Multiplying them elementwise is the whole idea: the hidden layer is now a product of two learned functions of x, not one.',
		formula: 'GLU(x) = σ(xW) ⊗ (xV)',
	},
	{
		kicker: 'variants',
		title: 'Swap what goes on the gate',
		desc: 'ReGLU, GeGLU, SwiGLU and LiGLU differ only in the function applied to the gate branch. LiGLU applies nothing at all — the gate stays linear — and it still beats every non-gated FFN, which says the gain comes from the multiplication rather than from any particular curve.',
		formula: 'relu / gelu / swish₁ / identity  (xW) ⊗ (xV)',
	},
	{
		kicker: 'the tax',
		title: 'Three matrices, so d_ff shrinks by two thirds',
		desc: 'Gating adds a whole d × d_ff projection. To compare fairly you hold parameters fixed and scale the hidden width by ⅔, then round to something the hardware likes. That is why LLaMA-7B has 11,008 and not 16,384: ⅔ · 4 · 4096 = 10,922, rounded up to the next multiple of 256.',
		formula: 'd_ff ← ⅔ · 4d   ·   3 · d · (⅔ · 4d) = 2 · d · 4d',
	},
	{
		kicker: 'in practice',
		title: 'What people actually ship',
		desc: 'GPT-2, GPT-3, OPT and Falcon use plain GeLU. T5 1.1 and Gemma use GeGLU. LLaMA, Mistral, Qwen, PaLM, OLMo and DeepSeek use SwiGLU. Nothing serious ships SeLU, and plain ReLU survives mostly in T5 1.0 and in models optimised for activation sparsity.',
		formula: 'SwiGLU + RMSNorm + no biases = the current default',
	},
	{
		kicker: 'does it matter',
		title: 'About 0.05 log-perplexity, and it transfers',
		desc: 'At equal parameters and equal compute the gated variants beat their ungated versions consistently, and GeGLU and SwiGLU are indistinguishable from each other. It is one of the few architectural tweaks that survives being moved to a different codebase — which is why it stuck. The paper offers no theory: "we attribute their success, as all else, to divine benevolence."',
		formula: 'GeGLU 1.942 · SwiGLU 1.944 · ReGLU 1.953 · LiGLU 1.960',
	},
];
