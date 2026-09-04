export const EPS = 1e-5;

export const BASE = [ 1.2, -0.4, 2.1, 0.3, -1.5, 0.8, -0.2, 1.9 ];

export const mean = ( v ) => v.reduce( ( a, b ) => a + b, 0 ) / v.length;
export const meanSq = ( v ) => v.reduce( ( a, b ) => a + b * b, 0 ) / v.length;

export function layerNorm( v, gamma, beta, eps = EPS ) {

	const mu = mean( v );
	const centred = v.map( ( x ) => x - mu );
	const varr = meanSq( centred );
	const denom = Math.sqrt( varr + eps );
	const hat = centred.map( ( x ) => x / denom );
	return { mu, centred, varr, sigma: denom, hat, out: hat.map( ( x, i ) => x * gamma[ i ] + beta[ i ] ) };

}

export function rmsNorm( v, gamma, eps = EPS ) {

	const ms = meanSq( v );
	const denom = Math.sqrt( ms + eps );
	const hat = v.map( ( x ) => x / denom );
	return { ms, rms: denom, hat, out: hat.map( ( x, i ) => x * gamma[ i ] ) };

}

export const NORM_MODES = [
	{ key: 'none', label: 'no norm', formula: 'x + F(x)' },
	{ key: 'post', label: 'post-norm', formula: 'x ← N(x + F(x))' },
	{ key: 'pre', label: 'pre-norm', formula: 'x ← x + F(N(x))' },
];

export function streamRms( mode, sublayers ) {

	const out = [];
	for ( let i = 0; i <= sublayers; i ++ ) out.push( mode === 'post' ? 1 : Math.sqrt( 1 + i ) );
	return out;

}

export function blockInputRms( mode, sublayers ) {

	const out = [];
	for ( let i = 0; i <= sublayers; i ++ ) out.push( mode === 'none' ? Math.sqrt( 1 + i ) : 1 );
	return out;

}

export const MODELS = [
	{ key: 'gpt2', name: 'GPT-2 small', norm: 'LayerNorm', place: 'pre-norm', d: 768, layers: 12, act: 'GeLU', dff: 3072, bias: true },
	{ key: 'gpt3', name: 'GPT-3 175B', norm: 'LayerNorm', place: 'pre-norm', d: 12288, layers: 96, act: 'GeLU', dff: 49152, bias: true },
	{ key: 'llama7', name: 'LLaMA-7B', norm: 'RMSNorm', place: 'pre-norm', d: 4096, layers: 32, act: 'SwiGLU', dff: 11008, bias: false },
	{ key: 'palm', name: 'PaLM 540B', norm: 'RMSNorm', place: 'pre-norm', d: 18432, layers: 118, act: 'SwiGLU', dff: 73728, bias: false },
	{ key: 't5', name: 'T5 1.1 base', norm: 'RMSNorm', place: 'pre-norm', d: 768, layers: 12, act: 'GeGLU', dff: 2048, bias: false },
];

export const BY_MODEL = Object.fromEntries( MODELS.map( ( m ) => [ m.key, m ] ) );

export const normParams = ( m ) => ( m.norm === 'LayerNorm' ? 2 : 1 ) * m.d * ( 2 * m.layers + 1 );

export const LN_OPS = [
	[ 'sum for μ', 1 ],
	[ 'x − μ', 1 ],
	[ 'square', 1 ],
	[ 'sum for σ²', 1 ],
	[ '· 1/σ', 1 ],
	[ '· γ', 1 ],
	[ '+ β', 1 ],
];

export const RMS_OPS = [
	[ 'square', 1 ],
	[ 'sum for ms', 1 ],
	[ '· 1/rms', 1 ],
	[ '· γ', 1 ],
];

export const lnFlops = LN_OPS.reduce( ( a, o ) => a + o[ 1 ], 0 );
export const rmsFlops = RMS_OPS.reduce( ( a, o ) => a + o[ 1 ], 0 );

export const count = ( v ) => v >= 1e9 ? `${ ( v / 1e9 ).toFixed( 2 ) } B` : v >= 1e6 ? `${ ( v / 1e6 ).toFixed( 2 ) } M` : Math.round( v ).toLocaleString( 'en-AU' );
