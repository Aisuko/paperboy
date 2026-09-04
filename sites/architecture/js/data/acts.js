const SQRT_2 = Math.SQRT2;
const SQRT_2_PI = Math.sqrt( 2 / Math.PI );

export function erf( x ) {

	const s = Math.sign( x );
	const a = Math.abs( x );
	const t = 1 / ( 1 + 0.3275911 * a );
	const y = 1 - ( ( ( ( ( 1.061405429 * t - 1.453152027 ) * t + 1.421413741 ) * t - 0.284496736 ) * t + 0.254829592 ) * t ) * Math.exp( -a * a );
	return s * y;

}

export const ncdf = ( x ) => 0.5 * ( 1 + erf( x / SQRT_2 ) );
export const npdf = ( x ) => Math.exp( -0.5 * x * x ) / Math.sqrt( 2 * Math.PI );
export const sigmoid = ( x ) => 1 / ( 1 + Math.exp( -x ) );

export const SELU_A = 1.6732632423543772;
export const SELU_L = 1.0507009873554805;

export const geluTanh = ( x ) => 0.5 * x * ( 1 + Math.tanh( SQRT_2_PI * ( x + 0.044715 * x ** 3 ) ) );

export const ACTS = [
	{
		key: 'relu', label: 'ReLU', color: 0x6ea8fe,
		expr: 'relu(x) = max(0, x)',
		f: ( x ) => Math.max( 0, x ),
		d: ( x ) => x > 0 ? 1 : 0,
		flops: 1,
		users: 'Transformer 2017 · T5 1.0',
		note: 'Zero gradient for every negative input, and a kink at the origin. Cheap, sparse, and the reason "dead units" was ever a phrase.',
	},
	{
		key: 'gelu', label: 'GeLU', color: 0xa78bfa,
		expr: 'gelu(x) = x · Φ(x) = x · ½(1 + erf(x/√2))',
		f: ( x ) => x * ncdf( x ),
		d: ( x ) => ncdf( x ) + x * npdf( x ),
		flops: 9,
		users: 'GPT-1/2/3 · BERT · OPT · Falcon',
		note: 'Weights the input by the probability a standard normal falls below it. Smooth everywhere, non-monotonic, and it dips to −0.170 near x = −0.752.',
	},
	{
		key: 'swish', label: 'Swish', color: 0x4ec9b0,
		expr: 'swish_β(x) = x · σ(βx)   ·   β = 1 is SiLU',
		f: ( x, b = 1 ) => x * sigmoid( b * x ),
		d: ( x, b = 1 ) => { const s = sigmoid( b * x ); return s + b * x * s * ( 1 - s ); },
		flops: 4,
		users: 'the gate inside SwiGLU',
		note: 'β interpolates: at β → 0 it is x/2, at β → ∞ it is ReLU. Found by an architecture search, then kept because the smooth version trains better.',
	},
	{
		key: 'selu', label: 'SeLU', color: 0xef8f6e,
		expr: 'selu(x) = λ · (x if x > 0 else α(eˣ − 1))',
		f: ( x ) => SELU_L * ( x > 0 ? x : SELU_A * ( Math.exp( x ) - 1 ) ),
		d: ( x ) => SELU_L * ( x > 0 ? 1 : SELU_A * Math.exp( x ) ),
		flops: 3,
		users: 'self-normalising nets · not transformers',
		note: 'λ and α are solved for, not tuned: with LeCun-normal init they make activations converge to mean 0, variance 1 without a norm layer. Pre-norm plus RMSNorm does the same job and survives being combined with everything else.',
	},
];

export const BY_ACT = Object.fromEntries( ACTS.map( ( a ) => [ a.key, a ] ) );

export const GLUS = [
	{ key: 'plain', label: 'FFN', gate: null, mats: 2, expr: 'FFN(x) = σ(xW₁) W₂', ppl: 1.983, gateLabel: '—' },
	{ key: 'liglu', label: 'LiGLU', gate: ( x ) => x, mats: 3, expr: 'FFN(x) = ((xW) ⊗ xV) W₂', ppl: 1.960, gateLabel: 'identity' },
	{ key: 'reglu', label: 'ReGLU', gate: BY_ACT.relu.f, mats: 3, expr: 'FFN(x) = (relu(xW) ⊗ xV) W₂', ppl: 1.953, gateLabel: 'ReLU' },
	{ key: 'geglu', label: 'GeGLU', gate: BY_ACT.gelu.f, mats: 3, expr: 'FFN(x) = (gelu(xW) ⊗ xV) W₂', ppl: 1.942, gateLabel: 'GeLU' },
	{ key: 'swiglu', label: 'SwiGLU', gate: ( x ) => BY_ACT.swish.f( x, 1 ), mats: 3, expr: 'FFN(x) = (swish₁(xW) ⊗ xV) W₂', ppl: 1.944, gateLabel: 'Swish₁' },
	{ key: 'glu', label: 'GLU', gate: sigmoid, mats: 3, expr: 'FFN(x) = (σ(xW) ⊗ xV) W₂', ppl: 1.982, gateLabel: 'sigmoid' },
];

export const BY_GLU = Object.fromEntries( GLUS.map( ( g ) => [ g.key, g ] ) );

export const PPL_BASE = 1.997;

export const USAGE = [
	[ 'GPT-2 / GPT-3', 'GeLU', '2 mats' ],
	[ 'T5 1.0', 'ReLU', '2 mats' ],
	[ 'T5 1.1 · Gemma', 'GeGLU', '3 mats' ],
	[ 'LLaMA · Mistral · Qwen', 'SwiGLU', '3 mats' ],
	[ 'PaLM · OLMo · DeepSeek', 'SwiGLU', '3 mats' ],
];

const hash = ( a, b, s ) => Math.sin( a * 12.9898 + b * 78.233 + s ) * 1.4;

export const W_GATE = ( i, j ) => hash( i, j, 1.7 );
export const W_UP = ( i, j ) => hash( i, j, 5.3 );
export const W_DOWN = ( i, j ) => hash( i, j, 9.1 ) * 0.5;

export function project( x, n, w ) {

	const out = [];
	for ( let j = 0; j < n; j ++ ) {

		let s = 0;
		for ( let i = 0; i < x.length; i ++ ) s += x[ i ] * w( i, j );
		out.push( s / Math.sqrt( x.length ) );

	}
	return out;

}

export function ffn( x, variant, dff, dout ) {

	const a = project( x, dff, W_GATE );
	const up = variant.gate ? project( x, dff, W_UP ) : null;
	const gate = variant.gate ? a.map( variant.gate ) : a.map( BY_ACT.gelu.f );
	const h = up ? gate.map( ( g, i ) => g * up[ i ] ) : gate;
	return { a, up, gate, h, y: project( h, dout, W_DOWN ) };

}
