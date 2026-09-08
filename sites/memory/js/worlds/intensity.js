import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME, EMISSIVE } from '../utils/sceneKit.js';
import { createWall, createFrame, createRail, createBar, setBar, paintCell, cellMesh, cellAt } from '../utils/tensorKit.js';
import {
	OPS, MODELS, BY_OP, BY_ACC, BY_PREC, WEEK, BYTES_PER_PARAM,
	peakOf, ridge, supports, evaluate, ridgeBatch, trainFlops, tokensFor, chinchilla, fitParams, weekFlops,
	eng, fmtFlops, fmtCount, fmtGB,
} from '../data/intensity.js';

const MM_X = -16;
const BUD_X = -7;
const MEM_X = 1.2;
const DIE_X = 6.2;
const ROOF_X = 14;

export const MM = { m: 4, k: 6, n: 4 };

const RW = 9;
const RH = 4.6;
const I_MIN = 0.05;
const I_MAX = 1e4;
const F_MIN = 1e10;
const F_MAX = 1e16;

const LOG_LO = 17;
const LOG_HI = 24;
const BH = ( v ) => THREE.MathUtils.clamp( ( Math.log10( Math.max( v, 1 ) ) - LOG_LO ) / ( LOG_HI - LOG_LO ) * 4.6, 0.02, 4.6 );

const rx = ( i ) => ( Math.log10( i ) - Math.log10( I_MIN ) ) / ( Math.log10( I_MAX ) - Math.log10( I_MIN ) ) * RW - RW / 2;
const ry = ( f ) => THREE.MathUtils.clamp( ( Math.log10( f ) - Math.log10( F_MIN ) ) / ( Math.log10( F_MAX ) - Math.log10( F_MIN ) ) * RH, 0, RH );

const OP_COLOR = { relu: THEME.info, gelu: THEME.violet, linear: THEME.signal };

const VIEWS = [
	{ position: new THREE.Vector3( MM_X, 2.6, 13 ), target: new THREE.Vector3( MM_X, 2.5, 0 ) },
	{ position: new THREE.Vector3( BUD_X - 0.3, 1.2, 17 ), target: new THREE.Vector3( BUD_X - 0.3, 1.0, 0 ) },
	{ position: new THREE.Vector3( BUD_X - 0.3, 1.0, 16 ), target: new THREE.Vector3( BUD_X - 0.3, 1.0, 0 ) },
	{ position: new THREE.Vector3( BUD_X - 0.3, 1.1, 16.5 ), target: new THREE.Vector3( BUD_X - 0.3, 1.0, 0 ) },
	{ position: new THREE.Vector3( 9.65, 0.6, 27 ), target: new THREE.Vector3( 9.65, -0.2, 0 ) },
	{ position: new THREE.Vector3( 3.95, -0.5, 14 ), target: new THREE.Vector3( 3.95, -0.6, 0 ) },
	{ position: new THREE.Vector3( 13.65, 0.6, 15 ), target: new THREE.Vector3( 13.65, 0.55, 0 ) },
];

// Establishing shot: matmul, week budget, memory/die and the roofline in one frame.
const OVERVIEW = { position: new THREE.Vector3( -0.5, 2.2, 41 ), target: new THREE.Vector3( -0.5, 0.4, 0 ) };

export function buildIntensityWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 110, { y: -4.8, divisions: 110 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];
	const labels = {};

	const label = ( key, text, cls, x, y, z = 0, parent = rig ) => {

		const l = createLabel( text, cls );
		l.position.set( x, y, z );
		parent.add( l );
		labels[ key ] = l;
		return l;

	};

	const matA = createWall( { rows: MM.m, cols: MM.k, cell: 0.34, gap: 0.08, depth: 0.3 } );
	matA.position.set( MM_X - 2.4, 1.0, 0 );
	matA.userData.cells.forEach( ( c ) => ( c.userData.kind = 'a' ) );
	rig.add( matA );

	const matB = createWall( { rows: MM.k, cols: MM.n, cell: 0.34, gap: 0.08, depth: 0.3 } );
	matB.position.set( MM_X + 1.1, 3.5, 0 );
	matB.userData.cells.forEach( ( c ) => ( c.userData.kind = 'b' ) );
	rig.add( matB );

	const matC = createWall( { rows: MM.m, cols: MM.n, cell: 0.34, gap: 0.08, depth: 0.3 } );
	matC.position.set( MM_X + 1.1, 1.0, 0 );
	matC.userData.cells.forEach( ( c ) => ( c.userData.kind = 'c' ) );
	rig.add( matC );

	[ matA, matB, matC ].forEach( ( w ) => {

		const f = createFrame( w.userData.width + 0.24, w.userData.height + 0.24 );
		f.position.copy( w.position );
		rig.add( f );

	} );

	label( 'mmA', 'x · (m, k)', 'label2d label2d-dim', MM_X - 2.4, -0.2 );
	label( 'mmB', 'W · (k, n)', 'label2d label2d-dim', MM_X + 1.1, 4.9 );
	label( 'mmC', '', 'label2d label2d-key', MM_X + 1.1, -0.2 );
	label( 'mmDot', '', 'label2d label2d-key', MM_X - 0.6, 2.5 );

	interactables.push( matA, matB, matC );

	const budget = new THREE.Group();
	budget.position.set( BUD_X, -1.1, 0 );
	rig.add( budget );

	budget.add( createRail( new THREE.Vector3( -3.9, 0, 0 ), new THREE.Vector3( 3.9, 0, 0 ) ) );
	budget.add( createRail( new THREE.Vector3( -3.9, 0, 0 ), new THREE.Vector3( -3.9, 4.6, 0 ) ) );

	for ( let d = LOG_LO; d <= LOG_HI; d += 2 ) {

		const t = createLabel( `1e${ d }`, 'label2d label2d-dim' );
		t.position.set( -4.5, BH( 10 ** d ), 0 );
		budget.add( t );

	}

	const BARS = [
		{ key: 'peak', label: 'promised · week', color: THEME.muted },
		{ key: 'actual', label: 'at this MFU', color: THEME.accent },
		{ key: 'need', label: 'run needs', color: THEME.signal },
	];

	const barSet = BARS.map( ( b, i ) => {

		const bar = createBar( { width: 1.15, depth: 1.15, color: b.color } );
		bar.position.x = ( i - 1 ) * 2.4;
		bar.userData = { kind: 'bar', which: b.key };
		budget.add( bar );

		const cap = createLabel( '', 'label2d label2d-key' );
		cap.position.set( bar.position.x, 0, 0 );
		budget.add( cap );

		const foot = createLabel( b.label, 'label2d label2d-dim' );
		foot.position.set( bar.position.x, -0.42, 0 );
		budget.add( foot );

		return { ...b, bar, cap };

	} );

	interactables.push( ...barSet.map( ( b ) => b.bar ) );

	const plate = new THREE.Mesh(
		new THREE.BoxGeometry( 1, 0.2, 1.1 ),
		new THREE.MeshStandardMaterial( { color: THEME.violet, emissive: THEME.violet, emissiveIntensity: 0.4 * EMISSIVE, roughness: 0.5 } ),
	);
	plate.position.set( 0, -1.15, 0 );
	plate.userData = { kind: 'plate' };
	budget.add( plate );
	interactables.push( plate );

	label( 'plate', '', 'label2d label2d-dim', 0, -1.6, 0, budget );

	const slab = createWall( { rows: 8, cols: 3, cell: 0.34, gap: 0.08, depth: 0.34 } );
	slab.position.set( MEM_X, 0.4, 0 );
	slab.userData.cells.forEach( ( c ) => ( c.userData.kind = 'mem' ) );
	rig.add( slab );

	const slabFrame = createFrame( slab.userData.width + 0.3, slab.userData.height + 0.3 );
	slabFrame.position.copy( slab.position );
	rig.add( slabFrame );

	const die = createWall( { rows: 6, cols: 6, cell: 0.34, gap: 0.08, depth: 0.26 } );
	die.position.set( DIE_X, 0.4, 0 );
	die.userData.cells.forEach( ( c ) => ( c.userData.kind = 'alu' ) );
	rig.add( die );

	const dieFrame = createFrame( die.userData.width + 0.3, die.userData.height + 0.3 );
	dieFrame.position.copy( die.position );
	rig.add( dieFrame );

	const LOAD_A = MEM_X + 1.0;
	const LOAD_B = DIE_X - 1.6;

	rig.add( createRail( new THREE.Vector3( LOAD_A, 0.4, 0.75 ), new THREE.Vector3( LOAD_B, 0.4, 0.75 ) ) );
	rig.add( createRail( new THREE.Vector3( LOAD_A, 0.4, -0.75 ), new THREE.Vector3( LOAD_B, 0.4, -0.75 ) ) );

	const packets = [];
	for ( let i = 0; i < 12; i ++ ) {

		const p = cellMesh( 0.2, 0.2, THEME.accent );
		p.userData = { kind: 'packet', index: i, t: ( i % 6 ) / 6, lane: i < 6 ? 1 : -1 };
		rig.add( p );
		packets.push( p );

	}

	const memBar = createBar( { width: 0.7, depth: 0.7, color: THEME.info } );
	memBar.position.set( MEM_X, -3.3, 0 );
	memBar.userData = { kind: 'util', which: 'memory' };
	rig.add( memBar );

	const cmpBar = createBar( { width: 0.7, depth: 0.7, color: THEME.accent } );
	cmpBar.position.set( DIE_X, -3.3, 0 );
	cmpBar.userData = { kind: 'util', which: 'compute' };
	rig.add( cmpBar );

	interactables.push( slab, die, memBar, cmpBar, ...packets );

	label( 'mem', '', 'label2d label2d-key', MEM_X, 2.5 );
	label( 'die', '', 'label2d label2d-key', DIE_X, 3.15 );
	label( 'load', 'load', 'label2d label2d-dim', ( LOAD_A + LOAD_B ) / 2, 0.9, 0.75 );
	label( 'store', 'store', 'label2d label2d-dim', ( LOAD_A + LOAD_B ) / 2, 0.9, -0.75 );
	label( 'memUtil', '', 'label2d label2d-dim', MEM_X, -3.7 );
	label( 'cmpUtil', '', 'label2d label2d-dim', DIE_X, -3.7 );
	label( 'verdict', '', 'label2d label2d-key', ( MEM_X + DIE_X ) / 2, -2.5 );

	const roof = new THREE.Group();
	roof.position.set( ROOF_X, -1.5, 0 );
	rig.add( roof );

	roof.add( createRail( new THREE.Vector3( -RW / 2, 0, 0 ), new THREE.Vector3( RW / 2, 0, 0 ) ) );
	roof.add( createRail( new THREE.Vector3( -RW / 2, 0, 0 ), new THREE.Vector3( -RW / 2, RH, 0 ) ) );

	[ 0.1, 1, 10, 100, 1000 ].forEach( ( i ) => {

		const t = createLabel( String( i ), 'label2d label2d-dim' );
		t.position.set( rx( i ), -0.35, 0 );
		roof.add( t );

	} );

	[ 1e11, 1e13, 1e15 ].forEach( ( f ) => {

		const t = createLabel( eng( f, 0 ), 'label2d label2d-dim' );
		t.position.set( -RW / 2 - 0.75, ry( f ), 0 );
		roof.add( t );

	} );

	const roofFill = new THREE.Mesh(
		new THREE.BufferGeometry(),
		new THREE.MeshBasicMaterial( { color: THEME.accent, transparent: true, opacity: 0.1, side: THREE.DoubleSide } ),
	);
	roof.add( roofFill );

	const roofLine = new THREE.Line(
		new THREE.BufferGeometry(),
		new THREE.LineBasicMaterial( { color: THEME.accent, transparent: true, opacity: 0.9 } ),
	);
	roof.add( roofLine );

	const ridgeMark = new THREE.Mesh(
		new THREE.BoxGeometry( 0.05, 1, 0.05 ),
		new THREE.MeshStandardMaterial( { color: THEME.rose, emissive: THEME.rose, emissiveIntensity: 0.8 * EMISSIVE } ),
	);
	ridgeMark.geometry.translate( 0, 0.5, 0 );
	ridgeMark.userData = { kind: 'ridge' };
	roof.add( ridgeMark );
	interactables.push( ridgeMark );

	label( 'ridge', '', 'label2d label2d-key', 0, RH + 0.35, 0, roof );
	label( 'roofX', 'arithmetic intensity · FLOP per byte', 'label2d label2d-dim', 0, -0.85, 0, roof );

	const pucks = OPS.map( ( op ) => {

		const m = new THREE.Mesh(
			new THREE.SphereGeometry( 0.14, 18, 12 ),
			new THREE.MeshStandardMaterial( { color: OP_COLOR[ op.key ], emissive: OP_COLOR[ op.key ], emissiveIntensity: 0.9 * EMISSIVE } ),
		);
		m.userData = { kind: 'puck', op: op.key };
		roof.add( m );

		const cap = createLabel( op.label, 'label2d label2d-dim' );
		cap.position.set( 0, 0.34, 0 );
		m.add( cap );

		return { op, mesh: m, cap };

	} );

	interactables.push( ...pucks.map( ( p ) => p.mesh ) );

	let step = 0;
	let opKey = 'relu';
	let batch = 1;
	let accKey = 'a5000';
	let precKey = 'bf16';
	let mfu = 0.5;
	let modelKey = 'm1b3';
	let sweep = 0;
	let clock = 0;
	let flow = 0;

	const acc = () => BY_ACC[ accKey ];
	const model = () => MODELS.find( ( m ) => m.key === modelKey );

	function state() {

		const a = acc();
		const op = BY_OP[ opKey ];
		const ev = evaluate( op, batch, a, precKey );
		const m = model();
		const tokens = chinchilla( m );
		const need = trainFlops( m, tokens );
		const week = weekFlops( a, precKey, mfu );

		return {
			acc: a, op, prec: BY_PREC[ precKey ], model: m, batch, mfu, ev,
			peak: peakOf( a, precKey ),
			ridge: ridge( a, precKey ),
			supported: supports( a, precKey ),
			ridgeBatch: ridgeBatch( a, precKey ),
			fits: fitParams( a ),
			weekPeak: weekFlops( a, precKey, 1 ),
			weekActual: week,
			tokens, need,
			weeks: need / week,
			tokensPerWeek: tokensFor( m, week ),
		};

	}

	function rebuildRoof() {

		const s = state();
		const pts = [];

		for ( let k = 0; k <= 48; k ++ ) {

			const i = I_MIN * ( I_MAX / I_MIN ) ** ( k / 48 );
			pts.push( new THREE.Vector2( rx( i ), ry( Math.min( s.peak, s.acc.bw * i ) ) ) );

		}

		const shape = new THREE.Shape();
		shape.moveTo( pts[ 0 ].x, 0 );
		pts.forEach( ( p ) => shape.lineTo( p.x, p.y ) );
		shape.lineTo( pts[ pts.length - 1 ].x, 0 );
		shape.closePath();

		roofFill.geometry.dispose();
		roofFill.geometry = new THREE.ShapeGeometry( shape );

		roofLine.geometry.dispose();
		roofLine.geometry = new THREE.BufferGeometry().setFromPoints( pts.map( ( p ) => new THREE.Vector3( p.x, p.y, 0.02 ) ) );

		ridgeMark.position.x = rx( s.ridge );
		ridgeMark.scale.y = ry( s.peak );
		labels.ridge.position.x = rx( s.ridge );
		labels.ridge.element.textContent = `${ s.ridge.toFixed( 0 ) } FLOP/byte`;

	}

	function render() {

		const s = state();

		labels.mmC.element.textContent = `y · (m, n) · ${ 2 * MM.m * MM.k * MM.n } FLOPs`;
		labels.mmDot.element.textContent = `2 · k = ${ 2 * MM.k } FLOPs per cell`;

		const values = { peak: s.weekPeak, actual: s.weekActual, need: s.need };
		barSet.forEach( ( b ) => {

			setBar( b.bar, BH( values[ b.key ] ) );
			b.cap.position.y = BH( values[ b.key ] ) + 0.3;
			b.cap.element.textContent = eng( values[ b.key ] );

		} );

		const pw = 1.2 + Math.log10( s.acc.mem / 1e9 ) * 1.6;
		plate.scale.x = pw;
		labels.plate.element.textContent = `${ fmtGB( s.acc.mem ) } · ${ BYTES_PER_PARAM } B/param · fits ${ fmtCount( s.fits ) } params`;

		labels.mem.element.textContent = `HBM · ${ ( s.acc.bw / 1e9 ).toFixed( 0 ) } GB/s`;
		labels.die.element.textContent = `tensor cores · ${ fmtFlops( s.peak ) }${ s.supported ? '' : ' · no ' + precKey }`;
		labels.memUtil.element.textContent = `bandwidth ${ ( s.ev.memoryUtil * 100 ).toFixed( 0 ) }%`;
		labels.cmpUtil.element.textContent = `compute ${ ( s.ev.computeUtil * 100 ).toFixed( 1 ) }%`;
		labels.verdict.element.textContent = `${ s.op.label } · I = ${ s.ev.i.toFixed( 2 ) } ${ s.ev.bound === 'memory' ? '<' : '>' } ${ s.ridge.toFixed( 0 ) } · ${ s.ev.bound }-bound`;

		setBar( memBar, 0.05 + s.ev.memoryUtil * 2.1 );
		setBar( cmpBar, 0.05 + s.ev.computeUtil * 2.1 );

		const memLit = Math.round( 24 * s.ev.memoryUtil );
		slab.userData.cells.forEach( ( c, i ) => paintCell( c, THEME.info, i < memLit ? 0.85 : 0.12 ) );

		const dieLit = Math.round( 36 * s.ev.computeUtil );
		die.userData.cells.forEach( ( c, i ) => paintCell( c, THEME.accent, i < dieLit ? 0.9 : 0.1 ) );

		packets.forEach( ( p ) => paintCell( p, s.ev.bound === 'memory' ? THEME.signal : THEME.muted, s.ev.bound === 'memory' ? 0.9 : 0.3 ) );

		rebuildRoof();

		pucks.forEach( ( p ) => {

			const ev = evaluate( p.op, batch, s.acc, precKey );
			p.mesh.position.set( rx( THREE.MathUtils.clamp( ev.i, I_MIN, I_MAX ) ), ry( ev.attain ), 0.06 );
			const on = p.op.key === opKey;
			p.mesh.scale.setScalar( on ? 1.5 : 0.85 );
			p.mesh.material.emissiveIntensity = ( on ? 1.2 : 0.35 ) * EMISSIVE;
			p.cap.element.className = 'label2d ' + ( on ? 'label2d-key' : 'label2d-dim' );
			p.cap.element.textContent = `${ p.op.label } · ${ ev.i.toFixed( 2 ) }`;

		} );

		if ( step !== 0 ) paintMatmul();

	}

	function paintMatmul() {

		matA.userData.cells.forEach( ( c ) => paintCell( c, THEME.accent, 0.18 ) );
		matB.userData.cells.forEach( ( c ) => paintCell( c, THEME.info, 0.18 ) );
		matC.userData.cells.forEach( ( c ) => paintCell( c, THEME.muted, 0.12 ) );

	}

	function markMatmul( n ) {

		paintMatmul();
		const r = Math.floor( n / MM.n );
		const c = n % MM.n;
		for ( let k = 0; k < MM.k; k ++ ) {

			paintCell( cellAt( matA, r, k ), THEME.signal, 0.9 );
			paintCell( cellAt( matB, k, c ), THEME.signal, 0.9 );

		}
		for ( let i = 0; i < n; i ++ ) paintCell( matC.userData.cells[ i ], THEME.accent, 0.7 );
		paintCell( matC.userData.cells[ n ], THEME.rose, 1 );

	}

	paintMatmul();
	render();

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ i ]; },
		getOverview() { return OVERVIEW; },
		setStep( i ) { step = i; sweep = 0; clock = 0; render(); },
		setOp( key ) { opKey = key; render(); return state(); },
		setBatch( b ) { batch = b; render(); return state(); },
		setAccelerator( key ) { accKey = key; render(); return state(); },
		setPrecision( key ) { precKey = key; render(); return state(); },
		setMfu( v ) { mfu = v; render(); return state(); },
		setModel( key ) { modelKey = key; render(); return state(); },
		getState() { return state(); },
		describe( object ) {

			const u = object.userData;
			const s = state();

			if ( u.kind === 'a' || u.kind === 'b' ) return {
				category: 'matmul', name: u.kind === 'a' ? `x[${ u.row }, ${ u.col }]` : `W[${ u.row }, ${ u.col }]`,
				blurb: u.kind === 'a' ? 'one activation' : 'one weight',
				description: `This element is read once for every column of the other operand — ${ u.kind === 'a' ? MM.n : MM.m } times here, B times in a real layer. That reuse is the only reason a matmul is ever compute-bound.`,
				metricLabel: 'reads per pass', metric: `${ u.kind === 'a' ? MM.n : MM.m }`,
			};

			if ( u.kind === 'c' ) return {
				category: 'matmul', name: `y[${ u.row }, ${ u.col }]`,
				blurb: `a dot product of length k = ${ MM.k }`,
				description: `${ MM.k } multiplies and ${ MM.k } adds — ${ 2 * MM.k } FLOPs — for this one cell. Times m · n = ${ MM.m * MM.n } cells gives 2mkn = ${ 2 * MM.m * MM.k * MM.n }. A real layer swaps 4 and 6 for 12,288 and 49,152.`,
				metricLabel: 'FLOPs here', metric: `${ 2 * MM.k }`,
			};

			if ( u.kind === 'bar' ) {

				const v = { peak: s.weekPeak, actual: s.weekActual, need: s.need }[ u.which ];
				const text = {
					peak: `${ fmtFlops( s.peak ) } × ${ WEEK.toLocaleString( 'en-AU' ) } s. Nothing ever reaches this — it assumes every tensor core issues a fused multiply-add every cycle for seven days.`,
					actual: `The promised rate times MFU ${ mfu.toFixed( 2 ) }. This is the number to plan with: ${ eng( s.tokensPerWeek ) } tokens of a ${ s.model.label } model in a week.`,
					need: `6ND for ${ s.model.label } over ${ eng( s.tokens ) } tokens (Chinchilla 20 per parameter), plus the attention term. At this MFU it is ${ s.weeks.toFixed( 1 ) } weeks on one card.`,
				}[ u.which ];

				return {
					category: 'budget', name: u.which === 'need' ? 'training run' : `${ u.which } FLOPs per week`,
					blurb: eng( v ), description: text,
					metricLabel: 'FLOPs', metric: eng( v ),
				};

			}

			if ( u.kind === 'plate' ) return {
				category: 'capacity', name: `${ fmtGB( s.acc.mem ) } of HBM`,
				blurb: `${ BYTES_PER_PARAM } bytes per parameter`,
				description: 'AdamW mixed precision: 2 bytes of BF16 weights, 2 of BF16 gradients, and 12 of FP32 master weights and moments. Memory decides how big N can be; the FLOP budget decides how many tokens D you get to show it.',
				metricLabel: 'parameters that fit', metric: fmtCount( s.fits ),
			};

			if ( u.kind === 'mem' ) return {
				category: 'memory side', name: 'HBM',
				blurb: `${ ( s.acc.bw / 1e9 ).toFixed( 0 ) } GB/s`,
				description: `This kernel moves ${ eng( s.ev.bytes ) } bytes and would take ${ eng( s.ev.tMemory ) } s at full bandwidth. Bandwidth utilisation right now is ${ ( s.ev.memoryUtil * 100 ).toFixed( 0 ) }%.`,
				metricLabel: 'bytes moved', metric: eng( s.ev.bytes ),
			};

			if ( u.kind === 'alu' ) return {
				category: 'compute side', name: 'tensor core',
				blurb: fmtFlops( s.peak ),
				description: `This kernel is ${ eng( s.ev.flops ) } FLOPs, ${ eng( s.ev.tCompute ) } s at peak. It takes ${ eng( s.ev.seconds ) } s in reality, so the array is busy ${ ( s.ev.computeUtil * 100 ).toFixed( 1 ) }% of the time.`,
				metricLabel: 'FLOPs', metric: eng( s.ev.flops ),
			};

			if ( u.kind === 'packet' ) return {
				category: 'traffic', name: 'load and store',
				blurb: `${ eng( s.ev.read ) } in, ${ eng( s.ev.write ) } out`,
				description: 'Every kernel reads its operands out of HBM and writes its result back. Intensity is the ratio of the arithmetic done in between to the bytes on these two rails.',
				metricLabel: 'FLOP per byte', metric: s.ev.i.toFixed( 3 ),
			};

			if ( u.kind === 'util' ) return {
				category: 'utilisation', name: u.which === 'memory' ? 'bandwidth used' : 'compute used',
				blurb: `${ ( ( u.which === 'memory' ? s.ev.memoryUtil : s.ev.computeUtil ) * 100 ).toFixed( 1 ) }%`,
				description: 'One of these is always at 100%. Which one is the bottleneck, and the ratio between them is exactly intensity over accelerator intensity.',
				metricLabel: 'bound by', metric: s.ev.bound,
			};

			if ( u.kind === 'ridge' ) return {
				category: 'roofline', name: 'accelerator intensity',
				blurb: `${ s.ridge.toFixed( 1 ) } FLOP/byte`,
				description: `${ fmtFlops( s.peak ) } divided by ${ ( s.acc.bw / 1e9 ).toFixed( 0 ) } GB/s. Left of this line the roof slopes and performance is bandwidth times intensity; right of it the roof is flat and nothing more can be extracted.`,
				metricLabel: 'ridge batch for the linear', metric: isFinite( s.ridgeBatch ) ? `B ≈ ${ Math.ceil( s.ridgeBatch ) }` : 'unreachable',
			};

			const ev = evaluate( BY_OP[ u.op ], batch, s.acc, precKey );
			return {
				category: 'operator', name: BY_OP[ u.op ].expr,
				blurb: `${ ev.i.toFixed( 3 ) } FLOP/byte · ${ ev.bound }-bound`,
				description: `${ eng( ev.flops ) } FLOPs over ${ eng( ev.bytes ) } bytes at ${ precKey }. It attains ${ fmtFlops( ev.attain ) } of a promised ${ fmtFlops( s.peak ) } — ${ ( ev.computeUtil * 100 ).toFixed( 1 ) }% of the machine.`,
				metricLabel: 'time', metric: `${ eng( ev.seconds ) } s`,
			};

		},
		update( dt ) {

			flow += dt;

			if ( step === 0 ) {

				clock += dt;
				if ( clock > 0.35 ) {

					clock = 0;
					markMatmul( sweep );
					sweep = ( sweep + 1 ) % ( MM.m * MM.n );

				}
				return;

			}

			const s = state();
			const speed = 0.35 + s.ev.memoryUtil * 1.9;

			packets.forEach( ( p ) => {

				p.userData.t = ( p.userData.t + dt * speed / ( LOAD_B - LOAD_A ) ) % 1;
				const t = p.userData.t;
				const x = p.userData.lane > 0 ? LOAD_A + t * ( LOAD_B - LOAD_A ) : LOAD_B - t * ( LOAD_B - LOAD_A );
				p.position.set( x, 0.4, p.userData.lane * 0.75 );

			} );

			die.userData.cells.forEach( ( c, i ) => {

				if ( i < Math.round( 36 * s.ev.computeUtil ) ) c.material.emissiveIntensity = ( 0.6 + Math.sin( flow * 6 + i ) * 0.3 ) * EMISSIVE;

			} );

		},
	};

}
