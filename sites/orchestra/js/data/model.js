export const ORCH = { dModel: 768, vocab: 50257, layers: 12 };
export const SHOWN = { d: 8, vocab: 9 };

export const QUESTION = 'A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How much does the ball cost, in cents?';
export const ANSWER = ' 5';
export const TRAP = ' 10';

export const TOKENS = [ ' 5', ' 10', ' 0', ' 1', ' 55', ' 15', ' 20', ' 100', ' 50' ];
export const TAIL_LOGIT = -2.8;

export const EMB = [
	[ 0.0113, 0.5708, -0.2012, 0.1168, -0.5661, 0.4061, 0.3085, -0.1984 ],
	[ 0.3603, 0.3785, -0.5267, 0.373, 0.1795, -0.4784, -0.1181, 0.188 ],
	[ -0.5008, 0.3218, -0.3598, -0.3664, 0.3214, 0.3064, -0.2734, 0.3315 ],
	[ 0.2856, 0.3645, 0.2242, -0.5011, 0.4076, -0.1364, 0.5447, -0.0528 ],
	[ 0.0221, -0.3062, -0.1351, 0.3065, 0.1217, 0.3015, 0.5735, 0.5991 ],
	[ -0.1475, 0.3548, 0.5001, 0.5838, 0.4351, 0.2255, -0.1074, -0.0981 ],
	[ 0.488, -0.224, -0.3307, -0.0224, 0.347, 0.5484, -0.1514, -0.3972 ],
	[ -0.5265, -0.157, -0.3531, 0.163, 0.2309, -0.2262, 0.3952, -0.535 ],
	[ -0.0501, 0.4262, 0.2006, -0.2256, -0.5265, 0.4513, 0.2006, -0.4513 ],
];

export const AGENTS = [
	{
		id: 'proposer', name: 'Proposer', short: 'PRO', role: 'reads the question once and answers',
		blurb: 'High temperature, no verification pass. It is the fastest to an answer and the easiest to fool.',
		temp: 0.95, anchor: 1.0, color: 0xe8a33d,
		h0: [ 1.2143, 2.176, -1.9237, 0.7385, 0.6934, -1.2753, 0.1518, 0.6118 ],
	},
	{
		id: 'verifier', name: 'Verifier', short: 'VER', role: 'sets up the algebra and checks it',
		blurb: 'Low temperature and a low anchor coefficient: it commits to a peaked distribution and moves the least when peers disagree with it.',
		temp: 0.50, anchor: 0.30, color: 0x4ec9b0,
		h0: [ 0.0074, 2.7467, -1.5718, 0.5165, -1.6354, 1.2477, 0.7908, -0.2676 ],
	},
	{
		id: 'skeptic', name: 'Skeptic', short: 'SKE', role: 'attacks whatever is currently leading',
		blurb: 'Deliberately the least certain member. Its job is to keep probability mass on alternatives long enough for them to be argued for.',
		temp: 0.95, anchor: 1.0, color: 0xa78bfa,
		h0: [ 1.2774, 1.1117, -1.8916, 1.2846, -0.0185, 0.4962, 0.7211, 0.3712 ],
	},
	{
		id: 'grounder', name: 'Grounder', short: 'GRO', role: 're-reads the constraint against the numbers',
		blurb: 'Mid temperature, mid anchor. It starts on the trap answer but is the first to move once the algebra reaches it over the channel.',
		temp: 0.62, anchor: 0.75, color: 0x6ea8fe,
		h0: [ 0.4537, 2.452, -2.074, 0.834, -0.4512, -0.0454, 0.1035, 0.358 ],
	},
];

export const CORRUPT_H = [ 2.0895, 2.2297, -2.7096, 1.7347, 1.1835, -2.6436, -0.3421, 0.9821 ];
export const CORRUPT_TEMP = 0.18;

export const DEFAULTS = {
	lambda: 1.0, decay: 0.65, topN: 4, nucleus: 0.9,
	budget: 5, eps: 0.10, cap: 0.35, uCap: 0.85,
	mode: 'mean', topology: 'all', corrupt: false,
	guards: { cap: true, anchor: true, decay: true, nucleus: true },
};

export const TOPOLOGIES = { all: 'all-to-all', ring: 'ring', star: 'star (Verifier hub)' };
const HUB = 1;

const dot = ( a, b ) => a.reduce( ( s, x, i ) => s + x * b[ i ], 0 );
const norm = ( a ) => Math.hypot( ...a );
const unit = ( a ) => { const n = norm( a ) || 1; return a.map( ( x ) => x / n ); };
const add = ( a, b, k = 1 ) => a.map( ( x, i ) => x + b[ i ] * k );

export function softmax( z, T = 1 ) {

	const s = z.map( ( x ) => x / T );
	const m = Math.max( ...s );
	const e = s.map( ( x ) => Math.exp( x - m ) );
	const q = e.reduce( ( a, b ) => a + b, 0 );
	return e.map( ( x ) => x / q );

}

export function entropy( p ) {

	return -p.reduce( ( s, x ) => s + ( x > 1e-12 ? x * Math.log( x ) : 0 ), 0 );

}

function kl( p, q ) {

	return p.reduce( ( s, x, i ) => s + ( x > 1e-12 ? x * Math.log( x / Math.max( q[ i ], 1e-12 ) ) : 0 ), 0 );

}

export function jsd( list ) {

	const n = list.length;
	const m = list[ 0 ].map( ( _, i ) => list.reduce( ( s, p ) => s + p[ i ], 0 ) / n );
	return list.reduce( ( s, p ) => s + kl( p, m ), 0 ) / n;

}

export function pool( dists, conf, mode ) {

	const n = dists[ 0 ].length;

	if ( mode === 'vote' ) {

		const c = new Array( n ).fill( 0 );
		dists.forEach( ( p, a ) => { c[ argmax( p ) ] += conf[ a ]; } );
		const t = c.reduce( ( a, b ) => a + b, 0 );
		return c.map( ( x ) => x / t );

	}

	if ( mode === 'log' ) {

		const lp = Array.from( { length: n }, ( _, i ) => dists.reduce( ( s, p, a ) => s + conf[ a ] * Math.log( Math.max( p[ i ], 1e-12 ) ), 0 ) );
		const m = Math.max( ...lp );
		const e = lp.map( ( x ) => Math.exp( x - m ) );
		const t = e.reduce( ( a, b ) => a + b, 0 );
		return e.map( ( x ) => x / t );

	}

	return Array.from( { length: n }, ( _, i ) => dists.reduce( ( s, p, a ) => s + conf[ a ] * p[ i ], 0 ) );

}

export const argmax = ( p ) => p.indexOf( Math.max( ...p ) );

export function peersOf( b, topology, n ) {

	if ( topology === 'ring' ) return [ ( b + n - 1 ) % n ];
	if ( topology === 'star' ) return b === HUB ? Array.from( { length: n }, ( _, i ) => i ).filter( ( i ) => i !== HUB ) : [ HUB ];
	return Array.from( { length: n }, ( _, i ) => i ).filter( ( i ) => i !== b );

}

export function makeMessage( p, topN, nucleus, on = true ) {

	const order = p.map( ( _, i ) => i ).filter( ( i ) => i < TOKENS.length ).sort( ( a, b ) => p[ b ] - p[ a ] );
	const keep = [];
	let cum = 0;

	for ( const i of order ) {

		keep.push( i );
		cum += p[ i ];
		if ( on && ( keep.length >= topN || cum >= nucleus ) ) break;

	}

	const mass = keep.reduce( ( s, i ) => s + p[ i ], 0 );
	const pairs = keep.map( ( i ) => ( { v: i, q: p[ i ] / mass } ) );
	return { pairs, mass, bits: -pairs.reduce( ( s, t ) => s + t.q * Math.log2( t.q ), 0 ) };

}

export function debate( params = {} ) {

	const o = { ...DEFAULTS, ...params, guards: { ...DEFAULTS.guards, ...( params.guards || {} ) } };
	const n = AGENTS.length;
	const temps = AGENTS.map( ( a, i ) => ( o.corrupt && i === 0 ? CORRUPT_TEMP : a.temp ) );
	let hs = AGENTS.map( ( a, i ) => ( o.corrupt && i === 0 ? CORRUPT_H : a.h0 ).slice() );

	const rounds = [];

	for ( let r = 0; r <= o.budget; r ++ ) {

		const per = hs.map( ( h, i ) => {

			const logits = [ ...EMB.map( ( e ) => dot( h, e ) ), TAIL_LOGIT ];
			const p = softmax( logits, temps[ i ] );
			return { agent: i, h: h.slice(), logits, p, H: entropy( p ), top: argmax( p ) };

		} );

		let conf = per.map( ( s ) => 1 / ( s.H + 0.2 ) );
		const cs = conf.reduce( ( a, b ) => a + b, 0 );
		conf = conf.map( ( c ) => c / cs );
		if ( o.guards.cap ) conf = conf.map( ( c ) => ( 1 - o.cap ) * c + o.cap / n );

		per.forEach( ( s, i ) => {

			s.conf = conf[ i ];
			const t = makeMessage( s.p, o.topN, o.nucleus, o.guards.nucleus );
			s.msg = t.pairs;
			s.msgMass = t.mass;
			s.msgBits = t.bits;
			let u = t.pairs.reduce( ( acc, x ) => add( acc, EMB[ x.v ], x.q ), new Array( SHOWN.d ).fill( 0 ) );
			s.rawNorm = norm( u );
			if ( o.guards.cap && s.rawNorm > o.uCap ) u = unit( u ).map( ( x ) => x * o.uCap );
			s.u = u;

		} );

		const dists = per.map( ( s ) => s.p );
		const pooled = pool( dists, conf, o.mode );
		const dis = jsd( dists );
		const lambda = o.guards.decay ? o.lambda * Math.pow( o.decay, r ) : o.lambda;

		rounds.push( { r, per, conf, pooled, jsd: dis, lambda, top: argmax( pooled ) } );

		if ( r === o.budget || dis < o.eps ) break;

		hs = hs.map( ( h, b ) => {

			const peers = peersOf( b, o.topology, n );
			let g = new Array( SHOWN.d ).fill( 0 );
			let w = 0;
			peers.forEach( ( a ) => { g = add( g, per[ a ].u, conf[ a ] ); w += conf[ a ]; } );
			if ( w === 0 ) return h;
			g = g.map( ( x ) => x / w );
			const k = o.guards.anchor ? AGENTS[ b ].anchor : 1;
			const n0 = norm( h );
			return unit( add( h, g, lambda * k * n0 ) ).map( ( x ) => x * n0 );

		} );

	}

	const last = rounds[ rounds.length - 1 ];
	const published = last.jsd < o.eps;

	return {
		params: o,
		rounds,
		final: last,
		stoppedAt: last.r,
		reason: published ? 'agreement' : 'budget',
		published,
		answer: published ? tokenName( last.top ) : null,
		correct: published && tokenName( last.top ) === ANSWER,
	};

}

export function tokenName( v ) {

	return v < TOKENS.length ? TOKENS[ v ] : 'tail';

}

export function label( v ) {

	return v < TOKENS.length ? TOKENS[ v ].trim() : `${ ( ORCH.vocab - TOKENS.length ).toLocaleString( 'en-AU' ) } others`;

}

export function ranked( p, k = 3 ) {

	return p.map( ( x, v ) => ( { v, p: x } ) ).sort( ( a, b ) => b.p - a.p ).slice( 0, k );

}

export function fmt( x, n = 3 ) {

	return ( x >= 0 ? ' ' : '' ) + x.toFixed( n );

}

export function fmtVec( v, n = 2, count = 8 ) {

	return '[' + v.slice( 0, count ).map( ( x ) => fmt( x, n ) ).join( ' ' ) + ( v.length > count ? ' …' : '' ) + ']';

}
