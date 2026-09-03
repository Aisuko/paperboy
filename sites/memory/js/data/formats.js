function prep( f ) {

	const bias = 2 ** ( f.e - 1 ) - 1;
	const top = 2 ** f.e - 1;
	const maxExp = f.mode === 'ieee' ? top - 1 - bias : top - bias;
	const maxMant = f.mode === 'fn' ? 2 - 2 ** ( 1 - f.m ) : 2 - 2 ** -f.m;

	return {
		...f,
		bias,
		bits: 1 + f.e + f.m,
		bytes: ( 1 + f.e + f.m ) / 8,
		maxExp,
		max: maxMant * 2 ** maxExp,
		minNormal: 2 ** ( 1 - bias ),
		minSub: 2 ** ( 1 - bias - f.m ),
		eps: 2 ** -f.m,
		digits: ( f.m + 1 ) * Math.LN2 / Math.LN10,
	};

}

export const FORMATS = [
	{ key: 'fp32', name: 'float32', short: 'FP32', e: 8, m: 23, mode: 'ieee' },
	{ key: 'fp16', name: 'float16', short: 'FP16', e: 5, m: 10, mode: 'ieee' },
	{ key: 'bf16', name: 'bfloat16', short: 'BF16', e: 8, m: 7, mode: 'ieee' },
	{ key: 'e4m3', name: 'float8 e4m3', short: 'E4M3', e: 4, m: 3, mode: 'fn' },
	{ key: 'e5m2', name: 'float8 e5m2', short: 'E5M2', e: 5, m: 2, mode: 'ieee' },
	{ key: 'nvfp4', name: 'nvfp4 e2m1', short: 'FP4', e: 2, m: 1, mode: 'none', block: 16, scaleBits: 8 },
].map( prep );

export const BY_KEY = Object.fromEntries( FORMATS.map( ( f ) => [ f.key, f ] ) );

function rte( v ) {

	const f = Math.floor( v );
	const d = v - f;
	if ( d > 0.5 ) return f + 1;
	if ( d < 0.5 ) return f;
	return f % 2 === 0 ? f : f + 1;

}

export function quantize( x, f ) {

	const sign = x < 0 ? 1 : 0;
	const a = Math.abs( x );
	const out = { sign, expField: 0, mantField: 0, sub: false, flag: 'zero', value: 0, error: 0 };

	if ( a === 0 ) return out;

	if ( a < f.minSub / 2 ) return { ...out, flag: 'underflow', error: 1 };

	let e = Math.floor( Math.log2( a ) );
	if ( 2 ** e > a ) e --;
	if ( 2 ** ( e + 1 ) <= a ) e ++;

	const minExp = 1 - f.bias;
	let sub = e < minExp;
	let ex = sub ? minExp : e;
	let q = rte( a / 2 ** ( ex - f.m ) );

	if ( q >= 2 ** ( f.m + 1 ) ) { ex ++; q = rte( a / 2 ** ( ex - f.m ) ); }
	if ( sub && q >= 2 ** f.m ) sub = false;

	let value = q * 2 ** ( ex - f.m );
	let flag = value === 0 ? 'underflow' : sub ? 'subnormal' : 'ok';

	if ( value > f.max ) { value = f.max; ex = f.maxExp; q = value / 2 ** ( ex - f.m ); flag = 'overflow'; }

	out.sub = sub;
	out.flag = flag;
	out.value = sign ? -value : value;
	out.expField = sub ? 0 : ex + f.bias;
	out.mantField = sub ? q : q - 2 ** f.m;
	out.error = a === 0 ? 0 : Math.abs( value - a ) / a;
	return out;

}

export function bitArray( q, f ) {

	const bits = [ q.sign ];
	for ( let i = f.e - 1; i >= 0; i -- ) bits.push( ( q.expField >> i ) & 1 );
	for ( let i = f.m - 1; i >= 0; i -- ) bits.push( ( q.mantField >> i ) & 1 );
	return bits;

}

export function fieldOf( f, i ) {

	return i === 0 ? 'sign' : i <= f.e ? 'exp' : 'frac';

}

export function quantizeBlock( values, f ) {

	const amax = Math.max( ...values.map( Math.abs ) );
	const raw = amax === 0 ? 1 : amax / f.max;
	const scale = quantize( raw, BY_KEY.e4m3 ).value || BY_KEY.e4m3.minSub;
	return { scale, amax, cells: values.map( ( v ) => quantize( v / scale, f ) ) };

}

export const SHAPES = [
	{ key: 'mlp', label: 'MLP up-proj', dims: [ 12288 * 4, 12288 ], note: 'GPT-3 175B feed-forward W1' },
	{ key: 'attn', label: 'attention W', dims: [ 12288, 12288 ], note: 'one square projection' },
	{ key: 'emb', label: 'embedding', dims: [ 50257, 12288 ], note: 'vocabulary table' },
];

export const numel = ( dims ) => dims.reduce( ( a, b ) => a * b, 1 );

export function bytesOf( count, f ) {

	return count * f.bits / 8 + ( f.block ? count / f.block * f.scaleBits / 8 : 0 );

}

export const bitsPerValue = ( f ) => f.bits + ( f.block ? f.scaleBits / f.block : 0 );

export const LINKS = [
	{ key: 'pcie4', name: 'PCIe 4.0 x16', gbs: 31.5, note: 'one direction, 16 lanes at 16 GT/s' },
	{ key: 'pcie5', name: 'PCIe 5.0 x16', gbs: 63, note: 'Grace Hopper hosts, most 2024+ servers' },
	{ key: 'pcie6', name: 'PCIe 6.0 x16', gbs: 121, note: 'PAM4 signalling, FLIT mode' },
	{ key: 'nvlink', name: 'NVLink-C2C', gbs: 450, note: 'Grace and Hopper on one package — 900 GB/s counting both directions' },
	{ key: 'hbm', name: 'HBM3e (B200)', gbs: 8000, note: 'the GPU reading its own DRAM' },
];

export const GIB = 2 ** 30;
export const fmtBytes = ( b ) => b >= GIB ? `${ ( b / GIB ).toFixed( 3 ) } GiB` : b >= 2 ** 20 ? `${ ( b / 2 ** 20 ).toFixed( 1 ) } MiB` : `${ ( b / 1024 ).toFixed( 1 ) } KiB`;
export const fmtTime = ( s ) => s >= 1 ? `${ s.toFixed( 2 ) } s` : s >= 1e-3 ? `${ ( s * 1e3 ).toFixed( 2 ) } ms` : `${ ( s * 1e6 ).toFixed( 1 ) } µs`;

export function sci( v, d = 3 ) {

	if ( v === 0 ) return '0';
	const a = Math.abs( v );
	return a >= 1e-4 && a < 1e6 ? Number( v.toPrecision( 6 ) ).toString() : v.toExponential( d );

}
