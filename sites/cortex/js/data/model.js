export const GPT2 = { name: 'GPT-2 small (124M)', dModel: 768, dFF: 3072, vocab: 50257, layers: 12 };
export const SHOWN = { d: 8, dff: 32, vocab: 12 };
export const PROMPT = [ 'The', ' cat', ' sat', ' on', ' the' ];

const D = SHOWN.d, DFF = SHOWN.dff, V = SHOWN.vocab;

function rand( i ) {

	const x = Math.sin( i * 127.1 + 311.7 ) * 43758.5453;
	return ( x - Math.floor( x ) ) * 2 - 1;

}

export function gelu( x ) {

	return 0.5 * x * ( 1 + Math.tanh( Math.sqrt( 2 / Math.PI ) * ( x + 0.044715 * x * x * x ) ) );

}

export const RESIDUAL = PROMPT.map( ( _, t ) => Array.from( { length: D }, ( __, i ) => rand( t * 97 + i * 13 ) * 1.1 ) );

export const W1 = Array.from( { length: DFF }, ( _, j ) => Array.from( { length: D }, ( __, i ) => rand( 1000 + j * 31 + i * 7 ) * 0.9 ) );
export const B1 = Array.from( { length: DFF }, ( _, j ) => rand( 4000 + j * 3 ) * 0.4 );
export const W2 = Array.from( { length: D }, ( _, i ) => Array.from( { length: DFF }, ( __, j ) => rand( 7000 + j * 17 + i * 5 ) * 0.55 ) );
export const B2 = Array.from( { length: D }, ( _, i ) => rand( 9000 + i * 23 ) * 0.2 );

export function mlp( t ) {

	const x = RESIDUAL[ t ];
	const pre = W1.map( ( row, j ) => row.reduce( ( s, w, i ) => s + w * x[ i ], 0 ) + B1[ j ] );
	const act = pre.map( gelu );
	const y = W2.map( ( row, i ) => row.reduce( ( s, w, j ) => s + w * act[ j ], 0 ) + B2[ i ] );
	const out = x.map( ( v, i ) => v + y[ i ] );
	return { x, pre, act, y, out, fired: act.filter( ( a ) => a > 0.05 ).length };

}

export function layerNorm( v ) {

	const mean = v.reduce( ( s, a ) => s + a, 0 ) / v.length;
	const varr = v.reduce( ( s, a ) => s + ( a - mean ) ** 2, 0 ) / v.length;
	const sd = Math.sqrt( varr + 1e-5 );
	return v.map( ( a ) => ( a - mean ) / sd );

}

export const MLP_LAST = mlp( PROMPT.length - 1 );
export const HIDDEN = layerNorm( MLP_LAST.out );

export const EMBED = Array.from( { length: V }, ( _, v ) => Array.from( { length: D }, ( __, i ) => rand( 20000 + v * 53 + i * 11 ) * 0.9 ) );

const WORDS = [ ' mat', ' floor', ' ground', ' table', ' couch', ' roof', ' bed', ' grass', ' sofa', ' chair', ' lap', ' step' ];

function rawLogits( h ) {

	return EMBED.map( ( e ) => e.reduce( ( s, w, i ) => s + w * h[ i ], 0 ) * 1.6 );

}

const ORDER = rawLogits( HIDDEN ).map( ( z, i ) => [ z, i ] ).sort( ( a, b ) => b[ 0 ] - a[ 0 ] ).map( ( p ) => p[ 1 ] );

export const VOCAB_ROWS = ORDER.map( ( row, rank ) => ( {
	row, rank,
	token: WORDS[ rank ],
	id: 1000 + row * 337,
	embed: EMBED[ row ],
} ) );

export function logitsFor( h ) {

	const z = rawLogits( h );
	return VOCAB_ROWS.map( ( r ) => z[ r.row ] );

}

export const LOGITS = logitsFor( HIDDEN );

const TAIL_COUNT = GPT2.vocab - V;
const TAIL_FRACTION = 0.04;

export const TAIL_LOGIT = ( () => {

	const m = Math.max( ...LOGITS );
	const s = LOGITS.reduce( ( a, z ) => a + Math.exp( z - m ), 0 );
	return m + Math.log( ( TAIL_FRACTION / ( 1 - TAIL_FRACTION ) ) * s / TAIL_COUNT );

} )();

export const DEFAULTS = { temperature: 1, topK: 4, topP: 0.9, mode: 'none', mix: 0 };

export function mixedHidden( mix ) {

	const target = layerNorm( VOCAB_ROWS[ 0 ].embed );
	return layerNorm( HIDDEN.map( ( v, i ) => v * ( 1 - mix ) + target[ i ] * mix ) );

}

export function decode( { temperature = 1, topK = 4, topP = 0.9, mode = 'none', logits = LOGITS } = {} ) {

	const T = Math.max( 0.05, temperature );
	const scaled = logits.map( ( z ) => z / T );
	const tailScaled = TAIL_LOGIT / T;
	const m = Math.max( ...scaled, tailScaled );
	const exps = scaled.map( ( z ) => Math.exp( z - m ) );
	const tailExp = TAIL_COUNT * Math.exp( tailScaled - m );
	const Z = exps.reduce( ( a, b ) => a + b, 0 ) + tailExp;

	const rows = VOCAB_ROWS.map( ( r, i ) => ( {
		...r,
		logit: logits[ i ],
		scaled: scaled[ i ],
		exp: exps[ i ],
		prob: exps[ i ] / Z,
	} ) );
	const tail = { token: `${ TAIL_COUNT.toLocaleString( 'en-AU' ) } others`, isTail: true, logit: TAIL_LOGIT, scaled: tailScaled, exp: tailExp, prob: tailExp / Z };

	const useK = mode === 'k' || mode === 'both';
	const useP = mode === 'p' || mode === 'both';

	let cum = 0;
	let raw = 0;
	let pReached = false;
	const all = [ ...rows, tail ];
	all.forEach( ( r, rank ) => {

		const byK = ! useK || rank < topK;
		const byP = ! useP || ! pReached;
		raw += r.prob;
		r.rawCum = raw;
		r.cum = cum + r.prob;
		r.kept = byK && byP;
		if ( r.kept ) cum = r.cum;
		if ( useP && cum >= topP ) pReached = true;

	} );

	const keptMass = all.reduce( ( s, r ) => s + ( r.kept ? r.prob : 0 ), 0 );
	all.forEach( ( r ) => { r.final = r.kept ? r.prob / keptMass : 0; } );

	const keptCount = all.reduce( ( s, r ) => s + ( r.kept ? ( r.isTail ? TAIL_COUNT : 1 ) : 0 ), 0 );
	const entropy = - all.reduce( ( s, r ) => {

		if ( r.final <= 0 ) return s;
		const per = r.isTail ? r.final / TAIL_COUNT : r.final;
		return s + r.final * Math.log( per );

	}, 0 );

	return { rows, tail, all, temperature: T, topK, topP, mode, keptMass, keptCount, entropy, tailCount: TAIL_COUNT };

}

let seed = 7;

export function sample( result ) {

	seed = ( seed * 1103515245 + 12345 ) % 2147483648;
	let r = ( seed / 2147483648 ) * 1;
	for ( const row of result.all ) {

		r -= row.final;
		if ( r <= 0 ) return row;

	}
	return result.all.find( ( x ) => x.kept ) || result.rows[ 0 ];

}

export function fmt( v, n = 3 ) {

	return ( v >= 0 ? ' ' : '' ) + v.toFixed( n );

}

export function fmtVec( v, n = 2, limit = 8 ) {

	return '[' + v.slice( 0, limit ).map( ( a ) => fmt( a, n ) ).join( ' ' ) + ( v.length > limit ? ' …' : '' ) + ']';

}
