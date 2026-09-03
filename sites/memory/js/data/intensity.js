export const WEEK = 7 * 24 * 3600;
export const D_MODEL = 12288;
export const D_FF = 49152;
export const CTX = 2048;
export const BYTES_PER_PARAM = 16;

export const ACCELERATORS = [
	{ key: 'a5000', name: 'RTX A5000', arch: 'Ampere · GA102', mem: 24e9, bw: 768e9, peak: { fp32: 27.8e12, bf16: 111.1e12, fp8: null } },
	{ key: 'a100', name: 'A100 80GB', arch: 'Ampere · GA100', mem: 80e9, bw: 2039e9, peak: { fp32: 19.5e12, bf16: 312e12, fp8: null } },
	{ key: 'h100', name: 'H100 SXM', arch: 'Hopper', mem: 80e9, bw: 3350e9, peak: { fp32: 67e12, bf16: 989.4e12, fp8: 1978.9e12 } },
	{ key: 'b200', name: 'B200', arch: 'Blackwell', mem: 192e9, bw: 8000e9, peak: { fp32: 80e12, bf16: 2250e12, fp8: 4500e12 } },
];

export const PRECISIONS = [
	{ key: 'fp32', label: 'fp32', bytes: 4 },
	{ key: 'bf16', label: 'bf16', bytes: 2 },
	{ key: 'fp8', label: 'fp8', bytes: 1 },
];

export const GELU_TERMS = [
	[ 'x · x · x', 2 ],
	[ '· 0.044715', 1 ],
	[ '+ x', 1 ],
	[ '· √(2/π)', 1 ],
	[ 'tanh', 1 ],
	[ '+ 1', 1 ],
	[ '· x', 1 ],
	[ '· 0.5', 1 ],
];

export const GELU_FLOPS = GELU_TERMS.reduce( ( a, t ) => a + t[ 1 ], 0 );

export const OPS = [
	{
		key: 'relu', label: 'relu', kind: 'elementwise', per: 1,
		expr: 'relu(x) = max(x, 0)',
		measure( b, e ) {

			const n = b * D_FF;
			return { n, flops: n, read: e * n, write: e * n, bytes: 2 * e * n };

		},
	},
	{
		key: 'gelu', label: 'gelu', kind: 'elementwise', per: GELU_FLOPS,
		expr: 'gelu(x) = 0.5x (1 + tanh(√(2/π)(x + 0.044715x³)))',
		measure( b, e ) {

			const n = b * D_FF;
			return { n, flops: GELU_FLOPS * n, read: e * n, write: e * n, bytes: 2 * e * n };

		},
	},
	{
		key: 'linear', label: 'linear', kind: 'matmul', per: 0,
		expr: 'y = x @ W   (B, 12288) @ (12288, 49152)',
		measure( b, e ) {

			const n = b * D_FF;
			const read = e * ( b * D_MODEL + D_MODEL * D_FF );
			const write = e * n;
			return { n, flops: 2 * b * D_MODEL * D_FF, read, write, bytes: read + write };

		},
	},
];

export const MODELS = [
	{ key: 'm124', label: '124M', n: 124e6, layers: 12, d: 768 },
	{ key: 'm1b3', label: '1.3B', n: 1.3e9, layers: 24, d: 2048 },
	{ key: 'm7b', label: '7B', n: 7e9, layers: 32, d: 4096 },
	{ key: 'm70b', label: '70B', n: 70e9, layers: 80, d: 8192 },
];

export const BY_OP = Object.fromEntries( OPS.map( ( o ) => [ o.key, o ] ) );
export const BY_ACC = Object.fromEntries( ACCELERATORS.map( ( a ) => [ a.key, a ] ) );
export const BY_PREC = Object.fromEntries( PRECISIONS.map( ( p ) => [ p.key, p ] ) );

export const supports = ( acc, prec ) => acc.peak[ prec ] != null;
export const peakOf = ( acc, prec ) => acc.peak[ prec ] ?? acc.peak.bf16;
export const ridge = ( acc, prec ) => peakOf( acc, prec ) / acc.bw;

export function evaluate( op, b, acc, prec ) {

	const e = BY_PREC[ prec ].bytes;
	const m = op.measure( b, e );
	const peak = peakOf( acc, prec );
	const r = ridge( acc, prec );
	const i = m.flops / m.bytes;
	const tCompute = m.flops / peak;
	const tMemory = m.bytes / acc.bw;

	return {
		...m, e, i, peak, r, tCompute, tMemory,
		seconds: Math.max( tCompute, tMemory ),
		attain: Math.min( peak, acc.bw * i ),
		bound: i < r ? 'memory' : 'compute',
		computeUtil: Math.min( 1, i / r ),
		memoryUtil: Math.min( 1, r / i ),
	};

}

export function ridgeBatch( acc, prec ) {

	const e = BY_PREC[ prec ].bytes;
	const r = ridge( acc, prec );
	const den = 2 * D_MODEL * D_FF - r * e * ( D_MODEL + D_FF );
	return den <= 0 ? Infinity : r * e * D_MODEL * D_FF / den;

}

export const flopsPerToken = ( m ) => 6 * m.n + 12 * m.layers * m.d * CTX;
export const trainFlops = ( m, tokens ) => flopsPerToken( m ) * tokens;
export const tokensFor = ( m, flops ) => flops / flopsPerToken( m );
export const attnShare = ( m ) => CTX / ( 6 * m.d );
export const chinchilla = ( m ) => 20 * m.n;
export const fitParams = ( acc ) => acc.mem * 0.85 / BYTES_PER_PARAM;
export const weekFlops = ( acc, prec, mfu ) => peakOf( acc, prec ) * WEEK * mfu;

export const eng = ( v, d = 2 ) => ! isFinite( v ) ? '∞' : v === 0 ? '0' : v.toExponential( d ).replace( 'e+', 'e' );
export const fmtFlops = ( v ) => v >= 1e15 ? `${ ( v / 1e15 ).toFixed( 2 ) } PFLOP/s` : v >= 1e12 ? `${ ( v / 1e12 ).toFixed( 1 ) } TFLOP/s` : `${ ( v / 1e9 ).toFixed( 1 ) } GFLOP/s`;
export const fmtCount = ( v ) => v >= 1e9 ? `${ ( v / 1e9 ).toFixed( 2 ) } B` : v >= 1e6 ? `${ ( v / 1e6 ).toFixed( 0 ) } M` : Math.round( v ).toLocaleString( 'en-AU' );
export const fmtGB = ( v ) => `${ ( v / 1e9 ).toFixed( 0 ) } GB`;
