// Toy language model used across every page: d_model = 6, vocab = 16.
// All values are deterministic functions of their indices so every number on
// screen can be recomputed by the reader.

export const D_MODEL = 6;
export const VOCAB_SIZE = 16;

export const VOCAB = [
	'the', 'cat', 'sat', 'on', 'mat', 'a', 'dog', 'ran',
	'to', 'park', 'and', 'then', 'slept', 'under', 'tree', 'sun',
];

// The prompt the head world walks through. 5 positions.
export const PROMPT = [ 'the', 'cat', 'sat', 'on', 'the' ];
export const N_BLOCKS = 4;

// Deterministic "weights" and "activations".
export const weight = ( k, j ) => Math.sin( k * 1.3 + j * 0.7 ) * 0.8;
export const hidden = ( t ) => Array.from( { length: D_MODEL }, ( _, k ) => Math.sin( t * 0.9 + k * 1.3 + 0.4 ) * 0.8 );

export function logits( h ) {

	const out = new Array( VOCAB_SIZE );
	for ( let j = 0; j < VOCAB_SIZE; j ++ ) {

		let sum = 0;
		for ( let k = 0; k < D_MODEL; k ++ ) sum += h[ k ] * weight( k, j );
		// Spread the toy logits a little so softmax has something to bite on.
		out[ j ] = sum * 2.2;

	}
	return out;

}

export function softmax( z, T = 1 ) {

	const max = Math.max( ...z );
	const exps = z.map( ( v ) => Math.exp( ( v - max ) / T ) );
	const sum = exps.reduce( ( a, b ) => a + b, 0 );
	return exps.map( ( e ) => e / sum );

}

export function entropy( p ) {

	return -p.reduce( ( a, v ) => a + ( v > 0 ? v * Math.log2( v ) : 0 ), 0 );

}

export function topK( p, k = 5 ) {

	return p
		.map( ( v, j ) => ( { j, p: v, word: VOCAB[ j ] } ) )
		.sort( ( a, b ) => b.p - a.p )
		.slice( 0, k );

}

export function argmax( p ) {

	let best = 0;
	for ( let j = 1; j < p.length; j ++ ) if ( p[ j ] > p[ best ] ) best = j;
	return best;

}

// Weighted draw from a distribution, seeded so replays are reproducible-ish
// (the caller passes a counter, not Math.random, to keep the site deterministic).
export function sampleFrom( p, u ) {

	let acc = 0;
	for ( let j = 0; j < p.length; j ++ ) {

		acc += p[ j ];
		if ( u <= acc ) return j;

	}
	return p.length - 1;

}

// Real models for the dimensions page. Head params = d_model × vocab.
export const MODELS = [
	{ key: 'toy', label: 'toy', d: D_MODEL, vocab: VOCAB_SIZE, total: 96 + 96, tied: true, year: '—' },
	{ key: 'gpt2', label: 'GPT-2 124M', d: 768, vocab: 50257, total: 124e6, tied: true, year: '2019' },
	{ key: 'gpt2xl', label: 'GPT-2 XL', d: 1600, vocab: 50257, total: 1.56e9, tied: true, year: '2019' },
	{ key: 'llama3-8b', label: 'Llama-3 8B', d: 4096, vocab: 128256, total: 8.03e9, tied: false, year: '2024' },
	{ key: 'llama3-70b', label: 'Llama-3 70B', d: 8192, vocab: 128256, total: 70.6e9, tied: false, year: '2024' },
];

export const BY_MODEL = Object.fromEntries( MODELS.map( ( m ) => [ m.key, m ] ) );

export const headParams = ( m ) => m.d * m.vocab;

export function fmtCount( n ) {

	if ( n >= 1e9 ) return ( n / 1e9 ).toFixed( 2 ) + ' B';
	if ( n >= 1e6 ) return ( n / 1e6 ).toFixed( 1 ) + ' M';
	if ( n >= 1e3 ) return ( n / 1e3 ).toFixed( 1 ) + ' K';
	return String( n );

}

export function fmtPct( x ) {

	return ( x * 100 ).toFixed( x >= 0.1 ? 0 : 1 ) + '%';

}
